from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Tuple
import numpy as np
from scipy.optimize import minimize
import math
from collections import defaultdict
from datetime import datetime

app = FastAPI(title="Flight Path Optimization Service")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class Coordinate(BaseModel):
    lat: float
    lon: float
    airport: Optional[str] = None
    time: Optional[str] = None

class Flight(BaseModel):
    id: int
    number: str
    dep: Coordinate
    arr: Coordinate

class RawFlightData(BaseModel):
    """Raw flight data from database"""
    flight_id: int
    flight_no: str
    departure_airport: str
    arrival_airport: str
    scheduled_departure: str
    scheduled_arrival: str
    dep_lat: float
    dep_lon: float
    arr_lat: float
    arr_lon: float

class FlightPair(BaseModel):
    type: str  # 'similar' or 'intersecting'
    flight1: Flight
    flight2: Flight
    angle: float
    intersection: Optional[Dict[str, float]] = None

class OptimizedPath(BaseModel):
    flight_number: str
    departure_airport: str
    arrival_airport: str
    original_distance: float
    optimized_distance: float
    time_savings: float
    boost_paths_used: int
    waypoints: List[Dict[str, float]]
    boost_segments: List[Dict]

# Helper functions
def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in kilometers using Haversine formula"""
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate bearing from point 1 to point 2"""
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    
    y = math.sin(dlon) * math.cos(lat2_rad)
    x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(dlon)
    
    bearing = math.atan2(y, x)
    return (math.degrees(bearing) + 360) % 360

def calculate_bisector_direction(lat1: float, lon1: float, lat2: float, lon2: float,
                                 lat3: float, lon3: float, lat4: float, lon4: float) -> float:
    """Calculate the bisector angle between two flight paths"""
    bearing1 = calculate_bearing(lat1, lon1, lat2, lon2)
    bearing2 = calculate_bearing(lat3, lon3, lat4, lon4)
    
    # Calculate bisector (halfway between the two bearings)
    diff = (bearing2 - bearing1 + 360) % 360
    bisector = (bearing1 + diff / 2) % 360
    
    return bisector

def destination_point(lat: float, lon: float, bearing: float, distance: float) -> Tuple[float, float]:
    """Calculate destination point given start point, bearing and distance"""
    R = 6371  # Earth's radius in km
    
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    bearing_rad = math.radians(bearing)
    
    lat2_rad = math.asin(math.sin(lat_rad) * math.cos(distance/R) +
                         math.cos(lat_rad) * math.sin(distance/R) * math.cos(bearing_rad))
    
    lon2_rad = lon_rad + math.atan2(math.sin(bearing_rad) * math.sin(distance/R) * math.cos(lat_rad),
                                     math.cos(distance/R) - math.sin(lat_rad) * math.sin(lat2_rad))
    
    return math.degrees(lat2_rad), math.degrees(lon2_rad)

def calculate_angle_between_paths(dep1_lat: float, dep1_lon: float, arr1_lat: float, arr1_lon: float,
                                   dep2_lat: float, dep2_lon: float, arr2_lat: float, arr2_lon: float) -> Optional[float]:
    """Calculate angle between two flight paths"""
    # Calculate direction vectors
    vector1_lat = arr1_lat - dep1_lat
    vector1_lon = arr1_lon - dep1_lon
    vector2_lat = arr2_lat - dep2_lat
    vector2_lon = arr2_lon - dep2_lon
    
    # Calculate dot product and magnitudes
    dot_product = vector1_lat * vector2_lat + vector1_lon * vector2_lon
    magnitude1 = math.sqrt(vector1_lat ** 2 + vector1_lon ** 2)
    magnitude2 = math.sqrt(vector2_lat ** 2 + vector2_lon ** 2)
    
    if magnitude1 == 0 or magnitude2 == 0:
        return None
    
    # Check if vectors are pointing in the same direction
    if dot_product < 0:
        return None
    
    # Calculate angle in degrees
    cos_angle = dot_product / (magnitude1 * magnitude2)
    angle_rad = math.acos(max(-1, min(1, cos_angle)))
    angle_deg = math.degrees(angle_rad)
    
    return angle_deg

def within_three_hours(time1_str: str, time2_str: str) -> bool:
    """Check if times are within 3 hours (ignoring date)"""
    try:
        date1 = datetime.fromisoformat(time1_str.replace('Z', '+00:00'))
        date2 = datetime.fromisoformat(time2_str.replace('Z', '+00:00'))
        
        # Extract time in minutes from midnight
        minutes1 = date1.hour * 60 + date1.minute
        minutes2 = date2.hour * 60 + date2.minute
        
        # Calculate difference (handle wrap-around at midnight)
        diff_minutes = abs(minutes1 - minutes2)
        diff_minutes = min(diff_minutes, 1440 - diff_minutes)
        
        diff_hours = diff_minutes / 60
        return diff_hours <= 3
    except:
        return False

def find_line_intersection(p1_lat: float, p1_lon: float, p2_lat: float, p2_lon: float,
                           p3_lat: float, p3_lon: float, p4_lat: float, p4_lon: float) -> Optional[Dict]:
    """Find intersection of two line segments"""
    x1, y1 = p1_lon, p1_lat
    x2, y2 = p2_lon, p2_lat
    x3, y3 = p3_lon, p3_lat
    x4, y4 = p4_lon, p4_lat
    
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    
    if abs(denom) < 1e-10:
        return None  # Lines are parallel
    
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
    
    # Check if intersection is within both line segments
    if 0 <= t <= 1 and 0 <= u <= 1:
        return {
            'lat': y1 + t * (y2 - y1),
            'lon': x1 + t * (x2 - x1),
            't1': t,
            't2': u
        }
    
    return None

def calculate_time_at_intersection(departure_time: str, arrival_time: str, proportion: float) -> datetime:
    """Calculate time at intersection point"""
    dep_time = datetime.fromisoformat(departure_time.replace('Z', '+00:00'))
    arr_time = datetime.fromisoformat(arrival_time.replace('Z', '+00:00'))
    
    dep_timestamp = dep_time.timestamp()
    arr_timestamp = arr_time.timestamp()
    flight_duration = arr_timestamp - dep_timestamp
    
    intersection_timestamp = dep_timestamp + (flight_duration * proportion)
    return datetime.fromtimestamp(intersection_timestamp, tz=dep_time.tzinfo)

def within_hours(time1: datetime, time2: datetime, hours: float) -> bool:
    """Check if two times are within specified hours"""
    diff = abs((time1 - time2).total_seconds())
    return diff <= hours * 3600

def find_similar_flight_pairs(flights: List[RawFlightData]) -> List[FlightPair]:
    """Find similar flight pairs that share departure or arrival airports"""
    pairs = []
    
    for i in range(len(flights)):
        for j in range(i + 1, len(flights)):
            flight1 = flights[i]
            flight2 = flights[j]
            
            # Skip if same route
            if (flight1.departure_airport == flight2.departure_airport and 
                flight1.arrival_airport == flight2.arrival_airport):
                continue
            
            # Skip if not sharing departure or arrival
            if not (flight1.departure_airport == flight2.departure_airport or 
                    flight1.arrival_airport == flight2.arrival_airport):
                continue
            
            # Calculate angle between paths
            angle = calculate_angle_between_paths(
                flight1.dep_lat, flight1.dep_lon, flight1.arr_lat, flight1.arr_lon,
                flight2.dep_lat, flight2.dep_lon, flight2.arr_lat, flight2.arr_lon
            )
            
            if angle is None or angle > 45:
                continue
            
            # Check time constraints
            same_departure = flight1.departure_airport == flight2.departure_airport
            same_arrival = flight1.arrival_airport == flight2.arrival_airport
            
            time_valid = False
            if same_departure and within_three_hours(flight1.scheduled_departure, flight2.scheduled_departure):
                time_valid = True
            if same_arrival and within_three_hours(flight1.scheduled_arrival, flight2.scheduled_arrival):
                time_valid = True
            
            if time_valid:
                pairs.append(FlightPair(
                    type='similar',
                    flight1=Flight(
                        id=flight1.flight_id,
                        number=flight1.flight_no,
                        dep=Coordinate(lat=flight1.dep_lat, lon=flight1.dep_lon, 
                                      airport=flight1.departure_airport, time=flight1.scheduled_departure),
                        arr=Coordinate(lat=flight1.arr_lat, lon=flight1.arr_lon,
                                      airport=flight1.arrival_airport, time=flight1.scheduled_arrival)
                    ),
                    flight2=Flight(
                        id=flight2.flight_id,
                        number=flight2.flight_no,
                        dep=Coordinate(lat=flight2.dep_lat, lon=flight2.dep_lon,
                                      airport=flight2.departure_airport, time=flight2.scheduled_departure),
                        arr=Coordinate(lat=flight2.arr_lat, lon=flight2.arr_lon,
                                      airport=flight2.arrival_airport, time=flight2.scheduled_arrival)
                    ),
                    angle=angle
                ))
    
    return pairs

def find_intersecting_flight_pairs(flights: List[RawFlightData]) -> List[FlightPair]:
    """Find intersecting flight pairs"""
    pairs = []
    
    for i in range(len(flights)):
        for j in range(i + 1, len(flights)):
            flight1 = flights[i]
            flight2 = flights[j]
            
            # Skip if sharing airports
            if (flight1.departure_airport == flight2.departure_airport or
                flight1.arrival_airport == flight2.arrival_airport):
                continue
            
            # Calculate angle
            angle = calculate_angle_between_paths(
                flight1.dep_lat, flight1.dep_lon, flight1.arr_lat, flight1.arr_lon,
                flight2.dep_lat, flight2.dep_lon, flight2.arr_lat, flight2.arr_lon
            )
            
            if angle is None or angle > 10:
                continue
            
            # Find intersection
            intersection = find_line_intersection(
                flight1.dep_lat, flight1.dep_lon, flight1.arr_lat, flight1.arr_lon,
                flight2.dep_lat, flight2.dep_lon, flight2.arr_lat, flight2.arr_lon
            )
            
            if not intersection:
                continue
            
            # Calculate time at intersection
            time1 = calculate_time_at_intersection(
                flight1.scheduled_departure, flight1.scheduled_arrival, intersection['t1']
            )
            time2 = calculate_time_at_intersection(
                flight2.scheduled_departure, flight2.scheduled_arrival, intersection['t2']
            )
            
            # Check if within 1 hour
            if within_hours(time1, time2, 1):
                pairs.append(FlightPair(
                    type='intersecting',
                    flight1=Flight(
                        id=flight1.flight_id,
                        number=flight1.flight_no,
                        dep=Coordinate(lat=flight1.dep_lat, lon=flight1.dep_lon,
                                      airport=flight1.departure_airport, time=flight1.scheduled_departure),
                        arr=Coordinate(lat=flight1.arr_lat, lon=flight1.arr_lon,
                                      airport=flight1.arrival_airport, time=flight1.scheduled_arrival)
                    ),
                    flight2=Flight(
                        id=flight2.flight_id,
                        number=flight2.flight_no,
                        dep=Coordinate(lat=flight2.dep_lat, lon=flight2.dep_lon,
                                      airport=flight2.departure_airport, time=flight2.scheduled_departure),
                        arr=Coordinate(lat=flight2.arr_lat, lon=flight2.arr_lon,
                                      airport=flight2.arrival_airport, time=flight2.scheduled_arrival)
                    ),
                    angle=angle,
                    intersection={'lat': intersection['lat'], 'lon': intersection['lon']}
                ))
    
    return pairs

def find_boost_zone_entry_exit(dep_lat: float, dep_lon: float, arr_lat: float, arr_lon: float,
                               boost_start_lat: float, boost_start_lon: float,
                               boost_bearing: float, boost_length: float) -> Optional[Tuple[Dict, Dict]]:
    """
    Use Snell's theorem to find optimal entry and exit points for boost zone.
    The boost zone acts like a medium with different refractive index (n1/n2 = v2/v1 = 1.1)
    since boost is 10% faster.
    """
    
    # Refractive indices: normal speed = 1, boost speed = 1.1 (10% faster)
    n1 = 1.0  # normal airspace
    n2 = 1.0 / 1.1  # boost zone (inversely proportional to speed)
    
    # Objective function: minimize total time
    def objective(params):
        entry_dist, exit_dist = params
        
        # Entry point on boost path
        entry_lat, entry_lon = destination_point(boost_start_lat, boost_start_lon, 
                                                 boost_bearing, entry_dist)
        
        # Exit point on boost path
        exit_lat, exit_lon = destination_point(boost_start_lat, boost_start_lon,
                                               boost_bearing, exit_dist)
        
        # Calculate distances
        d1 = haversine_distance(dep_lat, dep_lon, entry_lat, entry_lon)  # before boost
        d2 = haversine_distance(entry_lat, entry_lon, exit_lat, exit_lon)  # in boost
        d3 = haversine_distance(exit_lat, exit_lon, arr_lat, arr_lon)  # after boost
        
        # Time = distance / speed (assuming unit speed for normal, 1.1 for boost)
        time = d1 / 1.0 + d2 / 1.1 + d3 / 1.0
        
        return time
    
    # Constraints: entry_dist < exit_dist, both within boost zone
    def constraint_order(params):
        return params[1] - params[0] - 10  # exit must be at least 10km after entry
    
    def constraint_entry_positive(params):
        return params[0]
    
    def constraint_exit_max(params):
        return boost_length - params[1]
    
    constraints = [
        {'type': 'ineq', 'fun': constraint_order},
        {'type': 'ineq', 'fun': constraint_entry_positive},
        {'type': 'ineq', 'fun': constraint_exit_max}
    ]
    
    # Initial guess: enter at 1/3, exit at 2/3 of boost zone
    x0 = [boost_length * 0.33, boost_length * 0.66]
    
    # Bounds
    bounds = [(0, boost_length), (0, boost_length)]
    
    try:
        result = minimize(objective, x0, method='SLSQP', bounds=bounds, constraints=constraints)
        
        if result.success:
            entry_dist, exit_dist = result.x
            
            entry_lat, entry_lon = destination_point(boost_start_lat, boost_start_lon,
                                                     boost_bearing, entry_dist)
            exit_lat, exit_lon = destination_point(boost_start_lat, boost_start_lon,
                                                   boost_bearing, exit_dist)
            
            # Verify Snell's law at entry and exit points
            # sin(theta1) / sin(theta2) = n2 / n1
            
            entry_point = {'lat': entry_lat, 'lon': entry_lon, 'distance_along_boost': entry_dist}
            exit_point = {'lat': exit_lat, 'lon': exit_lon, 'distance_along_boost': exit_dist}
            
            return entry_point, exit_point
        else:
            return None
    except:
        return None

def group_overlapping_pairs(pairs: List[FlightPair]) -> Dict[str, List[FlightPair]]:
    """Group pairs by flights involved, handling flights in multiple pairs"""
    flight_pairs_map = defaultdict(list)
    
    for pair in pairs:
        flight_pairs_map[pair.flight1.number].append(pair)
        flight_pairs_map[pair.flight2.number].append(pair)
    
    return flight_pairs_map

def calculate_boost_path_efficiency(pair: FlightPair, flight_num: str) -> float:
    """Calculate efficiency score for a boost path"""
    # Lower angle = better alignment = higher efficiency
    angle_score = 1.0 - (pair.angle / 45.0)  # Normalized to 0-1
    
    # Consider the type of pair
    type_score = 1.2 if pair.type == 'intersecting' else 1.0
    
    return angle_score * type_score

def create_boost_path_from_pair(pair: FlightPair) -> Dict:
    """Create a boost path definition from a pair"""
    
    if pair.type == 'intersecting' and pair.intersection:
        # For intersecting paths, boost zone is centered at intersection
        start_lat = pair.intersection['lat']
        start_lon = pair.intersection['lon']
        
        # Calculate bisector direction
        bisector = calculate_bisector_direction(
            pair.flight1.dep.lat, pair.flight1.dep.lon,
            pair.flight1.arr.lat, pair.flight1.arr.lon,
            pair.flight2.dep.lat, pair.flight2.dep.lon,
            pair.flight2.arr.lat, pair.flight2.arr.lon
        )
        
        # Boost zone extends 200km in each direction from intersection
        boost_length = 400
        
    else:  # similar type
        # For similar paths, boost zone starts at common point
        if pair.flight1.dep.airport == pair.flight2.dep.airport:
            start_lat = pair.flight1.dep.lat
            start_lon = pair.flight1.dep.lon
        else:
            start_lat = pair.flight1.arr.lat
            start_lon = pair.flight1.arr.lon
        
        # Bisector of the two paths
        bisector = calculate_bisector_direction(
            pair.flight1.dep.lat, pair.flight1.dep.lon,
            pair.flight1.arr.lat, pair.flight1.arr.lon,
            pair.flight2.dep.lat, pair.flight2.dep.lon,
            pair.flight2.arr.lat, pair.flight2.arr.lon
        )
        
        # Average distance of the two flights
        dist1 = haversine_distance(pair.flight1.dep.lat, pair.flight1.dep.lon,
                                   pair.flight1.arr.lat, pair.flight1.arr.lon)
        dist2 = haversine_distance(pair.flight2.dep.lat, pair.flight2.dep.lon,
                                   pair.flight2.arr.lat, pair.flight2.arr.lon)
        boost_length = min(dist1, dist2) * 0.8
    
    return {
        'start_lat': start_lat,
        'start_lon': start_lon,
        'bearing': bisector,
        'length_km': boost_length,
        'pair': pair,
        'efficiency': calculate_boost_path_efficiency(pair, pair.flight1.number)
    }

def optimize_flight_path(flight: Flight, available_boost_paths: List[Dict]) -> OptimizedPath:
    """Optimize a single flight path using available boost zones"""
    
    dep_lat, dep_lon = flight.dep.lat, flight.dep.lon
    arr_lat, arr_lon = flight.arr.lat, flight.arr.lon
    
    # Calculate original distance
    original_distance = haversine_distance(dep_lat, dep_lon, arr_lat, arr_lon)
    
    # Try each boost path and find the best combination
    best_path = None
    best_time = original_distance  # time = distance with unit speed
    
    # Try no boost (baseline)
    waypoints = [
        {'lat': dep_lat, 'lon': dep_lon, 'type': 'departure'},
        {'lat': arr_lat, 'lon': arr_lon, 'type': 'arrival'}
    ]
    
    used_boosts = []
    
    # Try single boost paths
    for boost in available_boost_paths:
        result = find_boost_zone_entry_exit(
            dep_lat, dep_lon, arr_lat, arr_lon,
            boost['start_lat'], boost['start_lon'],
            boost['bearing'], boost['length_km']
        )
        
        if result:
            entry, exit = result
            
            d1 = haversine_distance(dep_lat, dep_lon, entry['lat'], entry['lon'])
            d2 = haversine_distance(entry['lat'], entry['lon'], exit['lat'], exit['lon'])
            d3 = haversine_distance(exit['lat'], exit['lon'], arr_lat, arr_lon)
            
            total_time = d1 / 1.0 + d2 / 1.1 + d3 / 1.0
            
            if total_time < best_time:
                best_time = total_time
                best_path = [
                    {'lat': dep_lat, 'lon': dep_lon, 'type': 'departure'},
                    {'lat': entry['lat'], 'lon': entry['lon'], 'type': 'boost_entry'},
                    {'lat': exit['lat'], 'lon': exit['lon'], 'type': 'boost_exit'},
                    {'lat': arr_lat, 'lon': arr_lon, 'type': 'arrival'}
                ]
                used_boosts = [{
                    'boost_id': available_boost_paths.index(boost),
                    'entry': entry,
                    'exit': exit,
                    'distance_in_boost': d2,
                    'bearing': boost['bearing']
                }]
    
    # Try multiple boost paths (simplified: sequential boosts)
    # Sort boosts by distance from departure
    sorted_boosts = sorted(available_boost_paths, 
                          key=lambda b: haversine_distance(dep_lat, dep_lon, b['start_lat'], b['start_lon']))
    
    # Try combinations of 2 boosts
    for i in range(len(sorted_boosts)):
        for j in range(i+1, len(sorted_boosts)):
            boost1 = sorted_boosts[i]
            boost2 = sorted_boosts[j]
            
            # First boost
            result1 = find_boost_zone_entry_exit(
                dep_lat, dep_lon, arr_lat, arr_lon,
                boost1['start_lat'], boost1['start_lon'],
                boost1['bearing'], boost1['length_km']
            )
            
            if not result1:
                continue
                
            entry1, exit1 = result1
            
            # Second boost (from exit1 to arrival)
            result2 = find_boost_zone_entry_exit(
                exit1['lat'], exit1['lon'], arr_lat, arr_lon,
                boost2['start_lat'], boost2['start_lon'],
                boost2['bearing'], boost2['length_km']
            )
            
            if not result2:
                continue
                
            entry2, exit2 = result2
            
            # Calculate total time
            d1 = haversine_distance(dep_lat, dep_lon, entry1['lat'], entry1['lon'])
            d2 = haversine_distance(entry1['lat'], entry1['lon'], exit1['lat'], exit1['lon'])
            d3 = haversine_distance(exit1['lat'], exit1['lon'], entry2['lat'], entry2['lon'])
            d4 = haversine_distance(entry2['lat'], entry2['lon'], exit2['lat'], exit2['lon'])
            d5 = haversine_distance(exit2['lat'], exit2['lon'], arr_lat, arr_lon)
            
            total_time = d1/1.0 + d2/1.1 + d3/1.0 + d4/1.1 + d5/1.0
            
            if total_time < best_time:
                best_time = total_time
                best_path = [
                    {'lat': dep_lat, 'lon': dep_lon, 'type': 'departure'},
                    {'lat': entry1['lat'], 'lon': entry1['lon'], 'type': 'boost_entry'},
                    {'lat': exit1['lat'], 'lon': exit1['lon'], 'type': 'boost_exit'},
                    {'lat': entry2['lat'], 'lon': entry2['lon'], 'type': 'boost_entry'},
                    {'lat': exit2['lat'], 'lon': exit2['lon'], 'type': 'boost_exit'},
                    {'lat': arr_lat, 'lon': arr_lon, 'type': 'arrival'}
                ]
                used_boosts = [
                    {
                        'boost_id': available_boost_paths.index(boost1),
                        'entry': entry1,
                        'exit': exit1,
                        'distance_in_boost': d2,
                        'bearing': boost1['bearing']
                    },
                    {
                        'boost_id': available_boost_paths.index(boost2),
                        'entry': entry2,
                        'exit': exit2,
                        'distance_in_boost': d4,
                        'bearing': boost2['bearing']
                    }
                ]
    
    if best_path is None:
        best_path = waypoints
    
    # Calculate optimized distance (actual path length)
    optimized_distance = 0
    for i in range(len(best_path) - 1):
        optimized_distance += haversine_distance(
            best_path[i]['lat'], best_path[i]['lon'],
            best_path[i+1]['lat'], best_path[i+1]['lon']
        )
    
    # Time savings (in minutes, assuming 800 km/h normal speed)
    time_savings = (original_distance - best_time) / 800 * 60
    
    return OptimizedPath(
        flight_number=flight.number,
        departure_airport=flight.dep.airport or "Unknown",
        arrival_airport=flight.arr.airport or "Unknown",
        original_distance=original_distance,
        optimized_distance=optimized_distance,
        time_savings=max(0, time_savings),
        boost_paths_used=len(used_boosts),
        waypoints=best_path,
        boost_segments=used_boosts
    )

@app.post("/optimize-paths", response_model=List[OptimizedPath])
async def optimize_paths(pairs: List[FlightPair]):
    """
    Optimize flight paths using boost zones from similar/intersecting flight pairs.
    Uses Snell's theorem to find optimal entry/exit points for boost zones.
    """
    
    if not pairs:
        raise HTTPException(status_code=400, detail="No flight pairs provided")
    
    # Create boost paths from all pairs
    boost_paths = []
    for pair in pairs:
        boost_path = create_boost_path_from_pair(pair)
        boost_paths.append(boost_path)
    
    # Collect all unique flights
    flights_map = {}
    for pair in pairs:
        flights_map[pair.flight1.number] = pair.flight1
        flights_map[pair.flight2.number] = pair.flight2
    
    # Group pairs by flight to find which flights have multiple boost options
    flight_pairs_map = group_overlapping_pairs(pairs)
    
    # Optimize each flight
    optimized_paths = []
    for flight_num, flight in flights_map.items():
        # Get boost paths available for this flight
        available_boosts = []
        
        for boost_idx, boost_path in enumerate(boost_paths):
            pair = boost_path['pair']
            if pair.flight1.number == flight_num or pair.flight2.number == flight_num:
                available_boosts.append(boost_path)
        
        # If flight is in multiple pairs, select most efficient boost paths
        if len(available_boosts) > 3:
            available_boosts = sorted(available_boosts, 
                                     key=lambda b: b['efficiency'], 
                                     reverse=True)[:3]
        
        optimized_path = optimize_flight_path(flight, available_boosts)
        optimized_paths.append(optimized_path)
    
    # Sort by time savings
    optimized_paths.sort(key=lambda x: x.time_savings, reverse=True)
    
    return optimized_paths

@app.post("/optimize-from-raw-flights")
async def optimize_from_raw_flights(flights: List[RawFlightData]):
    """
    Main endpoint: Takes raw flight data, finds similar and intersecting pairs,
    then optimizes flight paths using boost zones.
    """
    
    if not flights:
        raise HTTPException(status_code=400, detail="No flight data provided")
    
    print(f"Received {len(flights)} flights for optimization")
    
    # Find similar flight pairs
    print("Finding similar flight pairs...")
    similar_pairs = find_similar_flight_pairs(flights)
    print(f"Found {len(similar_pairs)} similar pairs")
    
    # Find intersecting flight pairs
    print("Finding intersecting flight pairs...")
    intersecting_pairs = find_intersecting_flight_pairs(flights)
    print(f"Found {len(intersecting_pairs)} intersecting pairs")
    
    # Combine all pairs
    all_pairs = similar_pairs + intersecting_pairs
    print(f"Total pairs: {len(all_pairs)}")
    
    if not all_pairs:
        raise HTTPException(status_code=404, detail="No valid flight pairs found")
    
    # Create boost paths from all pairs
    boost_paths = []
    for pair in all_pairs:
        boost_path = create_boost_path_from_pair(pair)
        boost_paths.append(boost_path)
    
    # Collect all unique flights
    flights_map = {}
    for pair in all_pairs:
        flights_map[pair.flight1.number] = pair.flight1
        flights_map[pair.flight2.number] = pair.flight2
    
    print(f"Optimizing {len(flights_map)} unique flights")
    
    # Optimize each flight
    optimized_paths = []
    for flight_num, flight in flights_map.items():
        # Get boost paths available for this flight
        available_boosts = []
        
        for boost_idx, boost_path in enumerate(boost_paths):
            pair = boost_path['pair']
            if pair.flight1.number == flight_num or pair.flight2.number == flight_num:
                available_boosts.append(boost_path)
        
        # If flight is in multiple pairs, select most efficient boost paths
        if len(available_boosts) > 3:
            available_boosts = sorted(available_boosts, 
                                     key=lambda b: b['efficiency'], 
                                     reverse=True)[:3]
        
        optimized_path = optimize_flight_path(flight, available_boosts)
        optimized_paths.append(optimized_path)
    
    # Sort by time savings
    optimized_paths.sort(key=lambda x: x.time_savings, reverse=True)
    
    return {
        "total_flights": len(flights),
        "total_pairs_found": len(all_pairs),
        "similar_pairs": len(similar_pairs),
        "intersecting_pairs": len(intersecting_pairs),
        "flights_optimized": len(optimized_paths),
        "optimized_paths": optimized_paths
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Flight Path Optimization"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
