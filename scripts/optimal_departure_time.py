"""
STEP 7: Optimal Departure Time for a Flight

This algorithm determines the optimal departure time by finding a flight to follow
for as long as possible, taking a detour to intercept it if needed.

Algorithm:
1. Find candidate flights near the route that are going in a similar direction
2. For each candidate: calculate detour to intercept, follow it as long as possible, continue to destination
3. Pick the flight + departure time that minimizes total cost
4. Output: Structured JSON for UI display

Mathematical Foundation:
-----------------------
The algorithm uses a path optimization approach:

1. Path Structure:
   - Path = Detour + Following + Continuation
   - Detour: Origin -> Intercept Point (solo flight, normal cost)
   - Following: Intercept Point -> Departure Point (formation flight, 5% efficiency gain)
   - Continuation: Departure Point -> Destination (solo flight, normal cost)

2. Objective Function:
   - Minimize total cost: detour_cost + following_cost × 0.95 + continuation_cost
   - Find flight that maximizes following distance (longest formation segment)

3. Optimization Algorithm:
   - For each departure time, find best candidate flight to follow
   - Calculate intercept point and departure point (when flight diverges too much)
   - Select departure time + flight combination that minimizes total cost
"""

import pymongo
from pymongo import MongoClient, GEOSPHERE
from datetime import datetime, timedelta
import os
import sys
import math
import argparse
import json
import csv
from typing import List, Dict, Tuple, Optional

# Try to import tqdm for progress bar
try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False
    def tqdm(iterable, **kwargs):
        return iterable

print("="*70)
print("STEP 7: Optimal Departure Time for a Flight")
print("="*70)

# Configuration
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

MONGO_URI = os.getenv('MONGODB_URI', os.getenv('MONGO_ATLAS_URI'))
if not MONGO_URI:
    MONGO_URI = 'mongodb://localhost:27017/'

DB_NAME = os.getenv('MONGODB_DB_NAME', 'flights')
NODES_COLLECTION = 'flight_nodes'

# Formation flight parameters
MAX_FORMATION_DISTANCE_KM = 50  # Maximum distance for formation (km)
MAX_TIME_DIFF_MINUTES = 20  # Maximum time difference for formation (minutes)
FORMATION_EFFICIENCY_GAIN = 0.05  # 5% efficiency gain when connected (0.95 cost multiplier)

# Flight following parameters
MAX_DETOUR_DISTANCE_KM = 200  # Maximum detour distance to intercept a flight (km)
MAX_DIVERGENCE_KM = 100  # Maximum distance flight can diverge before we leave it (km)
CANDIDATE_SEARCH_RADIUS_KM = 500  # Search radius for finding candidate flights to follow (km)

# Flight path synthesis parameters
FLIGHT_SPEED_KMH = 800  # Average commercial aircraft speed (km/h)
TIME_STEP_MINUTES = 5  # Time step for flight node generation (minutes)

# Departure time search parameters
# Evaluate at specific offsets: -60, -40, -20, 0, +20, +40, +60 minutes from scheduled time
DEPARTURE_TIME_OFFSETS = [-60, -40, -20, 0, 20, 40, 60]  # Specific offsets in minutes
SEARCH_TOLERANCE_MINUTES = 1  # Final search precision (for future refinement if needed)

# Earth radius for calculations
EARTH_RADIUS_KM = 6371.0

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great circle distance between two points (Haversine formula)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = (math.sin(delta_phi / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return EARTH_RADIUS_KM * c

def interpolate_point(origin_lat: float, origin_lon: float,
                     dest_lat: float, dest_lon: float,
                     fraction: float) -> Tuple[float, float]:
    """Interpolate a point along the great circle path from origin to destination."""
    lat = origin_lat + (dest_lat - origin_lat) * fraction
    lon = origin_lon + (dest_lon - origin_lon) * fraction
    return lat, lon

def synthesize_flight_nodes(origin_lat: float, origin_lon: float,
                           dest_lat: float, dest_lon: float,
                           departure_time: datetime,
                           flight_duration_minutes: float) -> List[Dict]:
    """
    Synthesize flight nodes along the path from origin to destination.
    
    Returns list of node dictionaries with: lat, lon, timestamp, time_index, segment_distance
    """
    nodes = []
    total_time_steps = int(flight_duration_minutes / TIME_STEP_MINUTES)
    
    for i in range(total_time_steps + 1):
        fraction = i / total_time_steps if total_time_steps > 0 else 0
        lat, lon = interpolate_point(origin_lat, origin_lon, dest_lat, dest_lon, fraction)
        
        timestamp = departure_time + timedelta(minutes=i * TIME_STEP_MINUTES)
        
        # Calculate segment distance to next node
        segment_distance = 0
        if i < total_time_steps:
            next_fraction = (i + 1) / total_time_steps if total_time_steps > 0 else 1
            next_lat, next_lon = interpolate_point(origin_lat, origin_lon, dest_lat, dest_lon, next_fraction)
            segment_distance = haversine_distance(lat, lon, next_lat, next_lon)
        
        node = {
            'lat': lat,
            'lon': lon,
            'timestamp': timestamp,
            'time_index': i,
            'fraction': fraction,
            'segment_distance_km': segment_distance
        }
        nodes.append(node)
    
    return nodes

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate bearing (direction) from point 1 to point 2 in degrees (0-360)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)
    
    y = math.sin(delta_lambda) * math.cos(phi2)
    x = (math.cos(phi1) * math.sin(phi2) -
         math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda))
    
    bearing = math.atan2(y, x)
    bearing_deg = math.degrees(bearing)
    return (bearing_deg + 360) % 360

def find_candidate_flights_to_follow(nodes_collection, origin_lat: float, origin_lon: float,
                                     dest_lat: float, dest_lon: float,
                                     scheduled_departure: datetime,
                                     flight_duration_minutes: float) -> List[Dict]:
    """
    Find candidate flights that started at/near the scheduled departure time.
    
    Strategy: Find flights that started at the same time (within 10 minutes), 
    then check if we can intercept them along their path (not at origin).
    """
    # Find flights that started at/near the scheduled departure time
    # Use a tighter window (10 minutes) to only get flights that started very close to scheduled time
    departure_window_start = scheduled_departure - timedelta(minutes=10)
    departure_window_end = scheduled_departure + timedelta(minutes=10)
    
    # Find all nodes in the departure time window
    query = {
        'timestamp': {
            '$gte': departure_window_start,
            '$lte': departure_window_end
        }
    }
    
    nodes_in_window = list(nodes_collection.find(query, {'flight_id': 1, 'timestamp': 1}).limit(2000))
    
    # Group by flight_id and find the earliest timestamp for each flight (this is the flight start time)
    flight_start_times = {}
    for node in nodes_in_window:
        flight_id = node.get('flight_id')
        if not flight_id:
            continue
        
        timestamp = node['timestamp']
        if flight_id not in flight_start_times:
            flight_start_times[flight_id] = timestamp
        else:
            if timestamp < flight_start_times[flight_id]:
                flight_start_times[flight_id] = timestamp
    
    # Filter flights that started within 10 minutes of scheduled departure (tight window)
    candidate_flight_ids = []
    for flight_id, start_time in flight_start_times.items():
        time_diff_minutes = abs((start_time - scheduled_departure).total_seconds() / 60)
        if time_diff_minutes <= 10:  # Only flights that started within 10 minutes
            candidate_flight_ids.append(flight_id)
    
    if not candidate_flight_ids:
        return []
    
    # Fetch complete paths for candidate flights and check if we can intercept them
    route_bearing = calculate_bearing(origin_lat, origin_lon, dest_lat, dest_lon)
    candidates = []
    
    for flight_id in candidate_flight_ids[:50]:  # Limit to 50 candidates for performance
        # Fetch complete flight path
        flight_nodes = list(nodes_collection.find(
            {'flight_id': flight_id},
            {'lat': 1, 'lon': 1, 'timestamp': 1}
        ).sort('timestamp', 1))
        
        if len(flight_nodes) < 2:
            continue
        
        # Calculate flight direction (from first to last node)
        first_node = flight_nodes[0]
        last_node = flight_nodes[-1]
        flight_bearing = calculate_bearing(
            first_node['lat'], first_node['lon'],
            last_node['lat'], last_node['lon']
        )
        
        # Check if flight direction is similar to our route (within 45 degrees)
        bearing_diff = abs((flight_bearing - route_bearing + 180) % 360 - 180)
        if bearing_diff <= 45:  # Similar direction
            candidates.append({
                'flight_id': flight_id,
                'flight_nodes': flight_nodes,
                'bearing': flight_bearing,
                'bearing_diff': bearing_diff,
                'start_time': flight_start_times[flight_id]
            })
    
    return candidates

def find_intercept_point(origin_lat: float, origin_lon: float,
                        flight_nodes: List[Dict],
                        departure_time: datetime) -> Optional[Tuple[Dict, int]]:
    """
    Find the best point to intercept a flight path along its route (not at origin).
    
    Strategy: Find a node along the flight path where we can intercept it directly
    from our origin (no detour to the flight's origin airport).
    
    Returns: (intercept_node, intercept_index) or None if no good intercept point found
    """
    # Skip the first node (flight's origin) - we want to intercept later along the path
    # Start from index 1 to avoid intercepting at the flight's origin airport
    best_intercept = None
    best_intercept_score = float('inf')
    
    for i in range(1, len(flight_nodes)):  # Start from index 1
        flight_node = flight_nodes[i]
        intercept_lat = flight_node['lat']
        intercept_lon = flight_node['lon']
        intercept_time = flight_node['timestamp']
        
        # Calculate direct distance from our origin to this intercept point
        intercept_distance = haversine_distance(origin_lat, origin_lon, intercept_lat, intercept_lon)
        
        # Check if distance is reasonable (not too far)
        if intercept_distance > MAX_DETOUR_DISTANCE_KM * 2:  # Allow larger range for direct path
            continue
        
        # Calculate time to reach intercept point
        time_to_intercept = (intercept_time - departure_time).total_seconds() / 60
        
        # Check if we can reach it in time (must be positive, reasonable)
        if time_to_intercept < 0 or time_to_intercept > 240:  # Max 4 hours to intercept
            continue
        
        # Score: prefer closer intercept points that we can reach in reasonable time
        # Lower score is better
        score = intercept_distance + abs(time_to_intercept - intercept_distance / FLIGHT_SPEED_KMH * 60) * 0.1
        
        if score < best_intercept_score:
            best_intercept_score = score
            best_intercept = (flight_node, i)
    
    return best_intercept

def find_departure_point(flight_nodes: List[Dict], intercept_index: int,
                        dest_lat: float, dest_lon: float) -> Optional[Tuple[Dict, int]]:
    """
    Find when to leave the flight (when it diverges too much from destination).
    
    Returns: (departure_node, departure_index) or None if we should follow to end
    """
    # Start from intercept point and follow the flight
    for i in range(intercept_index, len(flight_nodes)):
        flight_node = flight_nodes[i]
        flight_lat = flight_node['lat']
        flight_lon = flight_node['lon']
        
        # Calculate distance from this point to our destination
        distance_to_dest = haversine_distance(flight_lat, flight_lon, dest_lat, dest_lon)
        
        # If we've passed the destination or diverged too much, this is where we leave
        if i > intercept_index:
            prev_node = flight_nodes[i - 1]
            prev_distance = haversine_distance(
                prev_node['lat'], prev_node['lon'], dest_lat, dest_lon
            )
            
            # If distance is increasing (diverging), leave at previous point
            if distance_to_dest > prev_distance + MAX_DIVERGENCE_KM:
                return (flight_nodes[i - 1], i - 1)
    
    # If we never diverged too much, follow to the end
    return (flight_nodes[-1], len(flight_nodes) - 1)

def calculate_path_with_following(origin_lat: float, origin_lon: float,
                                  dest_lat: float, dest_lon: float,
                                  departure_time: datetime,
                                  flight_nodes: List[Dict]) -> Optional[Dict]:
    """
    Calculate a path that intercepts a flight, follows it, then continues to destination.
    
    Returns: Path information dict or None if no valid path
    """
    # Find intercept point
    intercept_result = find_intercept_point(origin_lat, origin_lon, flight_nodes, departure_time)
    if not intercept_result:
        return None
    
    intercept_node, intercept_index = intercept_result
    intercept_lat = intercept_node['lat']
    intercept_lon = intercept_node['lon']
    intercept_time = intercept_node['timestamp']
    
    # Find departure point (where to leave the flight)
    departure_result = find_departure_point(flight_nodes, intercept_index, dest_lat, dest_lon)
    if not departure_result:
        return None
    
    departure_node, departure_index = departure_result
    departure_lat = departure_node['lat']
    departure_lon = departure_node['lon']
    
    # Calculate path segments
    # 1. Detour: origin -> intercept (solo)
    detour_distance = haversine_distance(origin_lat, origin_lon, intercept_lat, intercept_lon)
    detour_cost = detour_distance
    
    # 2. Following: intercept -> departure (formation, 5% savings)
    following_distance = 0
    for i in range(intercept_index, departure_index):
        node1 = flight_nodes[i]
        node2 = flight_nodes[i + 1] if i + 1 < len(flight_nodes) else flight_nodes[i]
        segment_dist = haversine_distance(
            node1['lat'], node1['lon'],
            node2['lat'], node2['lon']
        )
        following_distance += segment_dist
    
    following_cost = following_distance * (1 - FORMATION_EFFICIENCY_GAIN)  # 5% savings
    
    # 3. Continuation: departure -> destination (solo)
    continuation_distance = haversine_distance(departure_lat, departure_lon, dest_lat, dest_lon)
    continuation_cost = continuation_distance
    
    total_cost = detour_cost + following_cost + continuation_cost
    total_distance = detour_distance + following_distance + continuation_distance
    solo_cost = total_distance  # Cost if we went direct
    
    savings = solo_cost - total_cost
    savings_percent = (savings / solo_cost * 100) if solo_cost > 0 else 0
    
    # Build complete path nodes
    path_nodes = []
    
    # Detour nodes (from origin to intercept)
    detour_nodes = synthesize_flight_nodes(
        origin_lat, origin_lon, intercept_lat, intercept_lon,
        departure_time, (intercept_time - departure_time).total_seconds() / 60
    )
    path_nodes.extend(detour_nodes[:-1])  # Exclude last node (intercept) to avoid duplicate
    
    # Following nodes (intercept to departure, use flight path)
    for i in range(intercept_index, departure_index + 1):
        node = flight_nodes[i]
        path_nodes.append({
            'lat': node['lat'],
            'lon': node['lon'],
            'timestamp': node['timestamp'],
            'time_index': len(path_nodes),
            'segment_distance_km': 0,  # Will be calculated
            'following': True  # Mark as following segment
        })
    
    # Calculate segment distances
    for i in range(len(path_nodes) - 1):
        node1 = path_nodes[i]
        node2 = path_nodes[i + 1]
        path_nodes[i]['segment_distance_km'] = haversine_distance(
            node1['lat'], node1['lon'],
            node2['lat'], node2['lon']
        )
    
    # Continuation nodes (from departure to destination)
    departure_time_actual = flight_nodes[departure_index]['timestamp']
    continuation_duration = (continuation_distance / FLIGHT_SPEED_KMH) * 60  # minutes
    continuation_nodes = synthesize_flight_nodes(
        departure_lat, departure_lon, dest_lat, dest_lon,
        departure_time_actual, continuation_duration
    )
    path_nodes.extend(continuation_nodes[1:])  # Skip first node (departure) to avoid duplicate
    
    return {
        'path_nodes': path_nodes,
        'intercept_node': intercept_node,
        'intercept_index': intercept_index,
        'departure_node': departure_node,
        'departure_index': departure_index,
        'detour_distance': detour_distance,
        'following_distance': following_distance,
        'continuation_distance': continuation_distance,
        'total_cost': total_cost,
        'solo_cost': solo_cost,
        'savings': savings,
        'savings_percent': savings_percent
    }

def evaluate_departure_time_with_following(nodes_collection, origin_lat: float, origin_lon: float,
                                          dest_lat: float, dest_lon: float,
                                          departure_time: datetime,
                                          flight_duration_minutes: float) -> Dict:
    """
    Evaluate a departure time by finding the best flight to follow.
    
    Algorithm:
    1. Find candidate flights to follow
    2. For each candidate, calculate path cost
    3. Return the best candidate (minimum cost)
    """
    # Find candidate flights
    candidates = find_candidate_flights_to_follow(
        nodes_collection, origin_lat, origin_lon, dest_lat, dest_lon,
        departure_time, flight_duration_minutes
    )
    
    if not candidates:
        # No candidates found, use direct path
        flight_nodes = synthesize_flight_nodes(
            origin_lat, origin_lon, dest_lat, dest_lon,
            departure_time, flight_duration_minutes
        )
        total_distance = haversine_distance(origin_lat, origin_lon, dest_lat, dest_lon)
        return {
            'departure_time': departure_time,
            'flight_nodes': flight_nodes,
            'followed_flight_id': None,
            'cost_analysis': {
                'total_cost': total_distance,
                'solo_cost': total_distance,
                'savings': 0,
                'savings_percent': 0,
                'total_segments': len(flight_nodes) - 1,
                'connected_segments': 0,
                'overlap_details': []
            },
            'num_partners': 0,
            'num_overlap_nodes': 0
        }
    
    # Evaluate each candidate
    best_path = None
    best_cost = float('inf')
    best_flight_id = None
    
    for candidate in candidates:
        path_result = calculate_path_with_following(
            origin_lat, origin_lon, dest_lat, dest_lon,
            departure_time, candidate['flight_nodes']
        )
        
        if path_result:
            # Only consider paths with positive savings (savings > 0)
            savings_percent = path_result.get('savings_percent', 0)
            if savings_percent > 0 and path_result['total_cost'] < best_cost:
                best_cost = path_result['total_cost']
                best_path = path_result
                best_flight_id = candidate['flight_id']
    
    if not best_path:
        # No valid path found, use direct
        flight_nodes = synthesize_flight_nodes(
            origin_lat, origin_lon, dest_lat, dest_lon,
            departure_time, flight_duration_minutes
        )
        total_distance = haversine_distance(origin_lat, origin_lon, dest_lat, dest_lon)
        return {
            'departure_time': departure_time,
            'flight_nodes': flight_nodes,
            'followed_flight_id': None,
            'cost_analysis': {
                'total_cost': total_distance,
                'solo_cost': total_distance,
                'savings': 0,
                'savings_percent': 0,
                'total_segments': len(flight_nodes) - 1,
                'connected_segments': 0,
                'overlap_details': []
            },
            'num_partners': 0,
            'num_overlap_nodes': 0
        }
    
    # Calculate cost analysis
    connected_segments = best_path['departure_index'] - best_path['intercept_index']
    total_segments = len(best_path['path_nodes']) - 1
    
    cost_analysis = {
        'total_cost': best_path['total_cost'],
        'solo_cost': best_path['solo_cost'],
        'savings': best_path['savings'],
        'savings_percent': best_path['savings_percent'],
        'total_segments': total_segments,
        'connected_segments': connected_segments,
        'overlap_details': [{
            'node_index': best_path['intercept_index'],
            'lat': best_path['intercept_node']['lat'],
            'lon': best_path['intercept_node']['lon'],
            'timestamp': best_path['intercept_node']['timestamp'],
            'partner_flight_id': best_flight_id,
            'partner_timestamp': best_path['intercept_node']['timestamp'],
            'distance_km': 0,
            'segment_cost_solo': best_path['following_distance'],
            'segment_cost_connected': best_path['following_distance'] * (1 - FORMATION_EFFICIENCY_GAIN),
            'savings': best_path['following_distance'] * FORMATION_EFFICIENCY_GAIN
        }]
    }
    
    return {
        'departure_time': departure_time,
        'flight_nodes': best_path['path_nodes'],
        'followed_flight_id': best_flight_id,
        'cost_analysis': cost_analysis,
        'num_partners': 1 if best_flight_id else 0,
        'num_overlap_nodes': connected_segments
    }

def find_optimal_departure_time_binary_search(nodes_collection, origin_lat: float, origin_lon: float,
                                              dest_lat: float, dest_lon: float,
                                              scheduled_departure: datetime,
                                              flight_duration_minutes: float) -> Dict:
    """
    Find optimal departure time by evaluating specific offset times.
    
    Algorithm:
    1. Evaluate candidate times at offsets: -60, -40, -20, 0, +20, +40, +60 minutes from scheduled
    2. Calculate path cost (with flight following) for each candidate
    3. Select the candidate with minimum cost
    """
    
    # Helper function to evaluate a time
    def evaluate_time(dep_time):
        result = evaluate_departure_time_with_following(
            nodes_collection, origin_lat, origin_lon, dest_lat, dest_lon,
            dep_time, flight_duration_minutes
        )
        return result['cost_analysis']['total_cost'], result
    
    # Evaluate at specific offsets
    best_time = scheduled_departure
    best_result = None
    best_cost = float('inf')
    
    search_times = []
    for offset in DEPARTURE_TIME_OFFSETS:
        candidate_time = scheduled_departure + timedelta(minutes=offset)
        search_times.append(candidate_time)
    
    print(f"\nEvaluating {len(search_times)} candidate times at offsets: {', '.join(f'{o:+d}' if o != 0 else '0' for o in DEPARTURE_TIME_OFFSETS)} minutes")
    print("  (This may take 30-60 seconds...)")
    
    evaluations = {}
    for candidate_time in tqdm(search_times, desc="Finding optimal path"):
        cost, result = evaluate_time(candidate_time)
        evaluations[candidate_time] = result
        
        # Only update best if this candidate has positive savings
        savings_percent = result['cost_analysis'].get('savings_percent', 0)
        if savings_percent > 0 and cost < best_cost:
            best_cost = cost
            best_time = candidate_time
            best_result = result
    
    # If no candidate had positive savings (or best has 0% savings), use scheduled departure time
    if best_result is None or best_result['cost_analysis'].get('savings_percent', 0) <= 0:
        # Use scheduled departure time (offset 0 is always in DEPARTURE_TIME_OFFSETS)
        best_time = scheduled_departure
        best_result = evaluations.get(scheduled_departure)
    
    return {
        'optimal_departure_time': best_time,
        'scheduled_departure_time': scheduled_departure,
        'time_offset_minutes': (best_time - scheduled_departure).total_seconds() / 60,
        'optimal_result': best_result,
        'all_evaluations': evaluations
    }

def fetch_partner_flight_paths(nodes_collection, flight_ids: List[str]) -> Dict[str, List[Dict]]:
    """
    Fetch complete flight paths for partner flight IDs.
    
    Returns: Dictionary mapping flight_id to list of flight nodes (sorted by timestamp)
    """
    partner_paths = {}
    
    for flight_id in flight_ids:
        # Fetch all nodes for this flight, sorted by timestamp
        nodes = list(nodes_collection.find(
            {'flight_id': flight_id},
            {'lat': 1, 'lon': 1, 'timestamp': 1, 'time_index': 1}
        ).sort('timestamp', 1))
        
        # Format nodes for JSON serialization
        formatted_nodes = []
        for node in nodes:
            formatted_nodes.append({
                'lat': node.get('lat'),
                'lon': node.get('lon'),
                'timestamp': node['timestamp'].isoformat() if isinstance(node['timestamp'], datetime) else node['timestamp'],
                'time_index': node.get('time_index', 0)
            })
        
        if formatted_nodes:
            partner_paths[flight_id] = formatted_nodes
    
    return partner_paths

def format_for_ui(result: Dict, origin: str, dest: str, origin_lat: float, origin_lon: float, dest_lat: float, dest_lon: float, scheduled_departure: datetime, flight_duration_minutes: float, nodes_collection=None) -> Dict:
    """
    Format the result as JSON for UI consumption.
    
    Structure optimized for frontend display with:
    - Optimal departure time recommendation
    - Path visualization data
    - Flight following information
    - Cost comparison (solo vs following)
    - Statistics
    """
    optimal_result = result['optimal_result']
    cost_analysis = optimal_result['cost_analysis']
    followed_flight_id = optimal_result.get('followed_flight_id')
    
    # Generate original/scheduled flight path (straight line from origin to destination)
    original_flight_nodes = synthesize_flight_nodes(
        origin_lat, origin_lon, dest_lat, dest_lon,
        scheduled_departure, flight_duration_minutes
    )
    
    # Format original/scheduled flight path for visualization
    original_flight_path = []
    for node in original_flight_nodes:
        original_flight_path.append({
            'lat': node['lat'],
            'lon': node['lon'],
            'timestamp': node['timestamp'].isoformat() if isinstance(node['timestamp'], datetime) else node['timestamp'],
            'time_index': node['time_index'],
            'segment_distance_km': node.get('segment_distance_km', 0)
        })
    
    # Format optimal flight path for visualization
    flight_path = []
    for node in optimal_result['flight_nodes']:
        flight_path.append({
            'lat': node['lat'],
            'lon': node['lon'],
            'timestamp': node['timestamp'].isoformat() if isinstance(node['timestamp'], datetime) else node['timestamp'],
            'time_index': node['time_index'],
            'segment_distance_km': node.get('segment_distance_km', 0)
        })
    
    # Format connections (only one flight followed)
    connections = []
    unique_partner_flight_ids = set()
    if followed_flight_id:
        unique_partner_flight_ids.add(followed_flight_id)
        for overlap_detail in cost_analysis.get('overlap_details', []):
            connections.append({
                'node_index': overlap_detail.get('node_index', 0),
                'position': {
                    'lat': overlap_detail['lat'],
                    'lon': overlap_detail['lon'],
                    'timestamp': overlap_detail['timestamp']
                },
                'partner': {
                    'flight_id': overlap_detail['partner_flight_id'],
                    'timestamp': overlap_detail['partner_timestamp'].isoformat() if isinstance(overlap_detail['partner_timestamp'], datetime) else overlap_detail['partner_timestamp']
                },
                'distance_km': overlap_detail.get('distance_km', 0),
                'efficiency_gain': FORMATION_EFFICIENCY_GAIN * 100,
                'segment_savings': overlap_detail.get('savings', 0)
            })
    
    # Calculate statistics from all evaluations
    all_costs = []
    all_savings = []
    for eval_time, eval_result in result['all_evaluations'].items():
        cost_info = eval_result['cost_analysis']
        all_costs.append(cost_info['total_cost'])
        all_savings.append(cost_info['savings'])
    
    avg_cost = sum(all_costs) / len(all_costs) if all_costs else 0
    avg_savings = sum(all_savings) / len(all_savings) if all_savings else 0
    
    # Fetch partner flight path if followed
    partner_flight_paths = {}
    if nodes_collection is not None and unique_partner_flight_ids:
        try:
            partner_flight_paths = fetch_partner_flight_paths(nodes_collection, list(unique_partner_flight_ids))
        except Exception as e:
            print(f"Warning: Could not fetch partner flight paths: {e}", file=sys.stderr)
    
    return {
        'route': {
            'origin': origin.upper(),
            'destination': dest.upper(),
            'scheduled_departure': result['scheduled_departure_time'].isoformat(),
            'optimal_departure': result['optimal_departure_time'].isoformat(),
            'time_offset_minutes': result['time_offset_minutes']
        },
        'path': {
            'optimal_flight_path': flight_path,
            'original_flight_path': original_flight_path,
            'total_segments': cost_analysis['total_segments'],
            'connected_segments': cost_analysis['connected_segments'],
            'connection_rate': (cost_analysis['connected_segments'] / cost_analysis['total_segments'] * 100) if cost_analysis['total_segments'] > 0 else 0
        },
        'cost_analysis': {
            'solo_cost': cost_analysis['solo_cost'],
            'total_cost': cost_analysis['total_cost'],
            'total_savings': cost_analysis['savings'],
            'savings_percent': cost_analysis['savings_percent'],
            'efficiency_gain_per_connection': FORMATION_EFFICIENCY_GAIN * 100
        },
        'connections': {
            'total_partners': optimal_result['num_partners'],
            'total_connections': len(connections),
            'connection_details': connections,
            'partner_flight_paths': partner_flight_paths,
            'followed_flight_id': followed_flight_id
        },
        'statistics': {
            'average_cost_all_times': avg_cost,
            'average_savings_all_times': avg_savings,
            'optimal_cost': cost_analysis['total_cost'],
            'optimal_savings': cost_analysis['savings'],
            'cost_reduction_vs_average': ((avg_cost - cost_analysis['total_cost']) / avg_cost * 100) if avg_cost > 0 else 0
        },
        'algorithm_info': {
            'method': 'flight_following_with_detour',
            'formation_efficiency_gain': FORMATION_EFFICIENCY_GAIN * 100,
            'max_detour_distance_km': MAX_DETOUR_DISTANCE_KM,
            'max_divergence_km': MAX_DIVERGENCE_KM,
            'evaluation_offsets_minutes': DEPARTURE_TIME_OFFSETS,
            'search_window_minutes': max(abs(o) for o in DEPARTURE_TIME_OFFSETS)
        }
    }

def load_airports_data(airports_file: str = 'data/airports.csv') -> Dict[str, Tuple[float, float]]:
    """Load airport coordinates from CSV file."""
    if not os.path.exists(airports_file):
        raise FileNotFoundError(f"Airports file not found: {airports_file}")
    airports = {}

    # Expected columns: IATA, latitude, longitude
    # (Avoids requiring pandas at runtime.)
    with open(airports_file, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = (row.get("IATA") or "").upper().strip()
            if not code:
                continue
            try:
                lat = float(row["latitude"])
                lon = float(row["longitude"])
            except Exception:
                continue
            airports[code] = (lat, lon)
    
    return airports


def resolve_airport_coords_from_db(nodes_collection, airport_code: str) -> Optional[Tuple[float, float]]:
    """
    Fallback resolver when airports CSV isn't available:
    approximate airport coordinates using flight_nodes.
    """
    code = (airport_code or "").upper().strip()
    if not code:
        return None

    # Prefer origin: earliest node for any flight with this origin.
    doc = (
        nodes_collection.find({"origin": code}, {"lat": 1, "lon": 1, "time_index": 1})
        .sort("time_index", 1)
        .limit(1)
    )
    doc = next(iter(doc), None)
    if doc and doc.get("lat") is not None and doc.get("lon") is not None:
        return float(doc["lat"]), float(doc["lon"])

    # Fallback to destination: latest node for any flight with this dest.
    doc = (
        nodes_collection.find({"dest": code}, {"lat": 1, "lon": 1, "time_index": 1})
        .sort("time_index", -1)
        .limit(1)
    )
    doc = next(iter(doc), None)
    if doc and doc.get("lat") is not None and doc.get("lon") is not None:
        return float(doc["lat"]), float(doc["lon"])

    return None

def main():
    """Main function to run optimal departure time analysis."""
    parser = argparse.ArgumentParser(
        description='Find optimal departure time for a flight route using flight-following optimization',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic usage
  python optimal_departure_time.py --origin JFK --dest LAX --scheduled "2013-01-01 08:00:00"
  
  # Output JSON for UI
  python optimal_departure_time.py --origin ATL --dest SFO --scheduled "2013-01-01 10:00:00" --json
        """
    )
    
    parser.add_argument('--origin', required=True, help='Origin airport code (IATA, e.g., JFK)')
    parser.add_argument('--dest', required=True, help='Destination airport code (IATA, e.g., LAX)')
    parser.add_argument('--scheduled', required=True, help='Scheduled departure time (YYYY-MM-DD HH:MM:SS)')
    parser.add_argument('--duration', type=float, help='Flight duration in minutes (estimated if not provided)')
    parser.add_argument('--distance', type=float, help='Flight distance in km (estimated if not provided)')
    parser.add_argument('--json', action='store_true', help='Output JSON format for UI')
    parser.add_argument('--airports', default='data/airports.csv', help='Airports CSV file path')
    parser.add_argument('--output', help='Output file path (for JSON output)')
    
    args = parser.parse_args()
    
    # Parse scheduled departure time
    try:
        scheduled_departure = datetime.strptime(args.scheduled, '%Y-%m-%d %H:%M:%S')
    except ValueError:
        try:
            scheduled_departure = datetime.strptime(args.scheduled, '%Y-%m-%d %H:%M')
        except ValueError:
            print(f"Error: Invalid datetime format. Use YYYY-MM-DD HH:MM:SS or YYYY-MM-DD HH:MM")
            sys.exit(1)
    
    # Load airport data (optional). If missing, we'll fall back to DB-derived coords.
    print("\nLoading airport data...")
    airports_data: Dict[str, Tuple[float, float]] = {}
    try:
        airports_data = load_airports_data(args.airports)
        print(f"✓ Loaded {len(airports_data)} airports from {args.airports}")
    except Exception as e:
        print(f"⚠ Airports CSV unavailable ({e}). Falling back to flight_nodes for coordinates.")

    origin_code = args.origin.upper()
    dest_code = args.dest.upper()
    
    # Connect to MongoDB
    print("\nConnecting to MongoDB...")
    try:
        if 'localhost' in MONGO_URI or '127.0.0.1' in MONGO_URI:
            client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        else:
            # For MongoDB Atlas, allow invalid certificates to handle SSL issues on some systems
            # Note: This is a workaround for SSL certificate verification problems
            client = MongoClient(
                MONGO_URI, 
                serverSelectionTimeoutMS=10000,
                maxPoolSize=50,
                minPoolSize=10,
                tlsAllowInvalidCertificates=True  # Workaround for SSL certificate verification issues
            )
        
        client.admin.command('ping')
        print("✓ Connected to MongoDB")
        
        db = client[DB_NAME]
        nodes_collection = db[NODES_COLLECTION]
        
        # Ensure geospatial index exists
        try:
            nodes_collection.create_index([("location", GEOSPHERE)])
        except Exception:
            pass  # Index might already exist
        
        node_count = nodes_collection.count_documents({})
        print(f"✓ Found {node_count:,} flight nodes in database")
        
    except Exception as e:
        print(f"✗ Error connecting to MongoDB: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # Resolve airport coordinates (CSV first, DB fallback)
    origin_coords = airports_data.get(origin_code) or resolve_airport_coords_from_db(nodes_collection, origin_code)
    dest_coords = airports_data.get(dest_code) or resolve_airport_coords_from_db(nodes_collection, dest_code)

    if not origin_coords or not dest_coords:
        missing = []
        if not origin_coords:
            missing.append(origin_code)
        if not dest_coords:
            missing.append(dest_code)
        print(f"✗ Error: Airport coordinates not found for: {', '.join(missing)}")
        if airports_data:
            print(f"   Available airports (CSV): {len(airports_data)} loaded")
        print("   Please check the airport codes and/or ensure flight_nodes contains data for them.")
        sys.exit(1)

    origin_lat, origin_lon = origin_coords
    dest_lat, dest_lon = dest_coords

    # Estimate flight parameters if not provided
    flight_distance_km = args.distance or haversine_distance(origin_lat, origin_lon, dest_lat, dest_lon)
    flight_duration_minutes = args.duration or (flight_distance_km / FLIGHT_SPEED_KMH * 60)

    print(f"\nFlight Route: {args.origin} → {args.dest}")
    print(f"  Distance: {flight_distance_km:.1f} km")
    print(f"  Estimated duration: {flight_duration_minutes:.1f} minutes ({flight_duration_minutes/60:.1f} hours)")
    
    # Find optimal departure time
    print("\n" + "="*70)
    print("Computing Optimal Departure Time (Flight-Following Optimization)")
    print("="*70)
    
    try:
        result = find_optimal_departure_time_binary_search(
            nodes_collection, origin_lat, origin_lon, dest_lat, dest_lon,
            scheduled_departure, flight_duration_minutes
        )
    except Exception as e:
        print(f"\n✗ Error during optimization: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # Format for UI if requested
    if args.json:
        ui_data = format_for_ui(result, args.origin, args.dest, origin_lat, origin_lon, dest_lat, dest_lon, scheduled_departure, flight_duration_minutes, nodes_collection)
        output_json = json.dumps(ui_data, indent=2, default=str)
        
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output_json)
            print(f"\n✓ Output written to {args.output}", file=sys.stderr)
        # Always output JSON to stdout when --json is used (for API consumption)
        print(output_json)
    else:
        # Display results in human-readable format
        optimal_result = result['optimal_result']
        cost_analysis = optimal_result['cost_analysis']
        
        print("\n" + "="*70)
        print("RESULTS: Optimal Departure Time Analysis")
        print("="*70)
        
        print(f"\nFlight Route: {args.origin} → {args.dest}")
        print(f"Scheduled Departure: {scheduled_departure.strftime('%Y-%m-%d %H:%M:%S')}")
        
        print(f"\n{'='*70}")
        print("OPTIMAL DEPARTURE TIME")
        print(f"{'='*70}")
        print(f"Recommended Departure: {result['optimal_departure_time'].strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Time Offset: {result['time_offset_minutes']:+.1f} minutes from scheduled")
        
        followed_flight = optimal_result.get('followed_flight_id')
        if followed_flight:
            print(f"\nFollowed Flight: {followed_flight}")
        
        print(f"\n{'='*70}")
        print("PATH ANALYSIS")
        print(f"{'='*70}")
        print(f"Total Segments: {cost_analysis['total_segments']}")
        print(f"Following Segments: {cost_analysis['connected_segments']}")
        print(f"Following Rate: {cost_analysis['connected_segments']/cost_analysis['total_segments']*100:.1f}%")
        
        print(f"\n{'='*70}")
        print("COST COMPARISON")
        print(f"{'='*70}")
        print(f"Base Case (Solo Flight Cost): {cost_analysis['solo_cost']:.2f}")
        print(f"Optimal Path Cost (with following): {cost_analysis['total_cost']:.2f}")
        print(f"Total Savings: {cost_analysis['savings']:.2f} ({cost_analysis['savings_percent']:.2f}%)")
        print(f"Efficiency Gain from Following: {FORMATION_EFFICIENCY_GAIN*100:.1f}%")
    
    # Close MongoDB connection
    client.close()
    print("\n✓ Analysis complete!")

if __name__ == '__main__':
    main()
