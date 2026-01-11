"""
Flask backend to serve flight data for timelapse visualization.

Generates flight positions on-demand from flights.csv data.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import math
from pathlib import Path
import json

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

# Global data storage
flights_df = None
airport_coords = {}

# Airport coordinates
AIRPORT_COORDS = {
    'KSFO': (37.6213, -122.3790), 'KLAX': (33.9425, -118.4081),
    'KJFK': (40.6413, -73.7781), 'KORD': (41.9742, -87.9073),
    'KDFW': (32.8998, -97.0403), 'KATL': (33.6407, -84.4277),
    'KMIA': (25.7959, -80.2870), 'KSEA': (47.4502, -122.3088),
    'KDEN': (39.8561, -104.6737), 'KBOS': (42.3656, -71.0096),
    'KSAN': (32.7338, -117.1933), 'KSAT': (29.5337, -98.4698),
    'KPHX': (33.4342, -112.0116), 'KLAS': (36.0840, -115.1537),
    'KMSP': (44.8831, -93.2218), 'KDTW': (42.2162, -83.3554),
    'KPHL': (39.8719, -75.2411), 'KIAD': (38.9531, -77.4565),
    'KCLT': (35.2144, -80.9473), 'KHOU': (29.6454, -95.2789),
    'KMCO': (28.4312, -81.3083), 'KBWI': (39.1774, -76.6684),
    'KSLC': (40.7899, -111.9791), 'KPIT': (40.4915, -80.2329),
    'KSTL': (38.7487, -90.3700), 'KCLE': (41.4117, -81.8498),
    'KIND': (39.7173, -86.2944), 'KBNA': (36.1245, -86.6782),
    'KAUS': (30.1945, -97.6699), 'KRDU': (35.8776, -78.7875),
    'KPDX': (45.5898, -122.5951), 'KSJC': (37.3626, -121.9290),
    'KOAK': (37.7213, -122.2207), 'KSNA': (33.6757, -117.8682),
    'KBUR': (34.2006, -118.3587), 'KONT': (34.0560, -117.6012),
    'KSBA': (34.4262, -119.8404), 'KSMF': (38.6954, -121.5908),
    'KFAT': (36.7762, -119.7181), 'KBFL': (35.4336, -119.0567),
    'EBBR': (50.9014, 4.4844), 'EGLL': (51.4700, -0.4543),
    'LFPG': (49.0097, 2.5479), 'EDDF': (50.0379, 8.5622),
    'EHAM': (52.3105, 4.7683), 'LIRF': (41.8003, 12.2389),
    'LEMD': (40.4839, -3.5680), 'CYVR': (49.1947, -123.1792),
    'CYYZ': (43.6772, -79.6306), 'CYMX': (45.4577, -73.7497),
    'MMMX': (19.4363, -99.0721), 'SBGR': (-23.4321, -46.4692),
    'EGKK': (51.1537, -0.1821),
    # IATA codes
    'SFO': (37.6213, -122.3790), 'LAX': (33.9425, -118.4081),
    'JFK': (40.6413, -73.7781), 'ORD': (41.9742, -87.9073),
    'DFW': (32.8998, -97.0403), 'ATL': (33.6407, -84.4277),
    'MIA': (25.7959, -80.2870), 'SEA': (47.4502, -122.3088),
    'DEN': (39.8561, -104.6737), 'BOS': (42.3656, -71.0096),
    'SAN': (32.7338, -117.1933), 'SAT': (29.5337, -98.4698),
    'PHX': (33.4342, -112.0116), 'LAS': (36.0840, -115.1537),
}


def get_airport_coords(code):
    """Get airport coordinates."""
    if not code or pd.isna(code):
        return None
    code = str(code).strip().upper()
    if code in AIRPORT_COORDS:
        return AIRPORT_COORDS[code]
    if len(code) == 3:
        k_code = 'K' + code
        if k_code in AIRPORT_COORDS:
            return AIRPORT_COORDS[k_code]
    return None


def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate great circle distance in kilometers."""
    R = 6371
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def interpolate_position(lat1, lon1, lat2, lon2, ratio):
    """Interpolate position between two points."""
    lat = lat1 + (lat2 - lat1) * ratio
    lon = lon1 + (lon2 - lon1) * ratio
    return lat, lon


def calculate_heading(lat1, lon1, lat2, lon2):
    """Calculate heading between two points."""
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lon = math.radians(lon2 - lon1)
    y = math.sin(delta_lon) * math.cos(lat2_rad)
    x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(delta_lon)
    heading = math.atan2(y, x)
    return (math.degrees(heading) + 360) % 360


def get_flight_positions_at_time(timestamp, base_date_str="2024-01-01"):
    """Get all flight positions at a specific timestamp (allows fractional seconds for interpolation)."""
    if flights_df is None or len(flights_df) == 0:
        return []
    
    base_date = datetime.strptime(base_date_str, "%Y-%m-%d")
    target_dt = datetime.fromtimestamp(timestamp)
    
    # Find flights active at this time
    active_flights = []
    
    # Limit to reasonable number for performance (can increase if needed)
    sample_size = min(10000, len(flights_df))  # Process up to 10k flights at a time
    
    for _, row in flights_df.head(sample_size).iterrows():
        dep_airport = str(row.get('estdepartureairport', '')).strip()
        arr_airport = str(row.get('estarrivalairport', '')).strip()
        callsign = str(row.get('callsign', 'UNKNOWN')).strip()
        firstseen = row.get('firstseen')
        
        if not dep_airport or not arr_airport or pd.isna(firstseen):
            continue
        
        dep_coords = get_airport_coords(dep_airport)
        arr_coords = get_airport_coords(arr_airport)
        
        if not dep_coords or not arr_coords:
            continue
        
        # Calculate flight schedule
        try:
            if isinstance(firstseen, (int, float)):
                flight_start = datetime.fromtimestamp(float(firstseen))
            else:
                flight_start = pd.to_datetime(firstseen)
        except:
            continue
        
        # Map to base date
        flight_date = base_date.replace(
            hour=flight_start.hour,
            minute=flight_start.minute,
            second=flight_start.second if hasattr(flight_start, 'second') else 0
        )
        
        # Calculate flight duration
        distance_km = calculate_distance(dep_coords[0], dep_coords[1], arr_coords[0], arr_coords[1])
        duration_hours = distance_km / 800  # 800 km/h average
        duration_seconds = int(duration_hours * 3600)
        flight_end = flight_date + timedelta(seconds=duration_seconds)
        
        # Check if flight is active at target time (with small buffer for smooth transitions)
        flight_start_ts = flight_date.timestamp()
        flight_end_ts = flight_end.timestamp()
        target_ts = target_dt.timestamp()
        
        if flight_start_ts <= target_ts <= flight_end_ts:
            # Calculate progress (0.0 to 1.0)
            elapsed = target_ts - flight_start_ts
            progress = elapsed / duration_seconds if duration_seconds > 0 else 0
            progress = max(0.0, min(1.0, progress))
            
            # Get position along path
            lat, lon = interpolate_position(
                dep_coords[0], dep_coords[1],
                arr_coords[0], arr_coords[1],
                progress
            )
            
            # Calculate heading toward destination
            if progress < 0.99:  # Heading toward destination
                heading = calculate_heading(lat, lon, arr_coords[0], arr_coords[1])
            else:  # At destination, use departure heading
                heading = calculate_heading(dep_coords[0], dep_coords[1], arr_coords[0], arr_coords[1])
            
            active_flights.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [lon, lat]
                },
                'properties': {
                    'callsign': callsign,
                    'icao24': callsign,
                    'timestamp': timestamp,
                    'heading': heading,
                    'velocity': 220,  # m/s
                    'altitude': 35000,
                    'departure': dep_airport,
                    'arrival': arr_airport,
                    'progress': float(progress)
                }
            })
    
    return active_flights


def get_flight_trails(timestamp, trail_minutes=30, base_date_str="2024-01-01"):
    """Get flight trails (last N minutes) for a timestamp."""
    if flights_df is None or len(flights_df) == 0:
        return []
    
    base_date = datetime.strptime(base_date_str, "%Y-%m-%d")
    target_dt = datetime.fromtimestamp(timestamp)
    trail_start = target_dt - timedelta(minutes=trail_minutes)
    
    # Group positions by flight
    flight_paths = {}
    sample_interval = timedelta(seconds=30)  # Sample every 30 seconds
    
    current_time = trail_start
    while current_time <= target_dt:
        current_ts = int(current_time.timestamp())
        positions = get_flight_positions_at_time(current_ts, base_date_str)
        
        for pos in positions:
            callsign = pos['properties']['callsign']
            if callsign not in flight_paths:
                flight_paths[callsign] = []
            flight_paths[callsign].append(pos['geometry']['coordinates'])
        
        current_time += sample_interval
    
    # Create trail LineStrings
    trails = []
    for callsign, coords in flight_paths.items():
        if len(coords) < 2:
            continue
        trails.append({
            'type': 'Feature',
            'geometry': {
                'type': 'LineString',
                'coordinates': coords
            },
            'properties': {
                'callsign': callsign
            }
        })
    
    return trails


@app.route('/api/flights', methods=['GET'])
def get_flights():
    """Get flight positions at a specific timestamp (accepts float for interpolation)."""
    timestamp_str = request.args.get('timestamp', type=str)
    base_date = request.args.get('base_date', default='2024-01-01')
    
    if not timestamp_str:
        return jsonify({'error': 'timestamp parameter required'}), 400
    
    try:
        timestamp = float(timestamp_str)
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid timestamp format'}), 400
    
    positions = get_flight_positions_at_time(timestamp, base_date)
    
    return jsonify({
        'type': 'FeatureCollection',
        'features': positions,
        'timestamp': timestamp,
        'count': len(positions)
    })


@app.route('/api/trails', methods=['GET'])
def get_trails():
    """Get flight trails for a timestamp (accepts float for interpolation)."""
    timestamp_str = request.args.get('timestamp', type=str)
    trail_minutes = request.args.get('trail_minutes', default=30, type=int)
    base_date = request.args.get('base_date', default='2024-01-01')
    
    if not timestamp_str:
        return jsonify({'error': 'timestamp parameter required'}), 400
    
    try:
        timestamp = float(timestamp_str)
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid timestamp format'}), 400
    
    trails = get_flight_trails(timestamp, trail_minutes, base_date)
    
    return jsonify({
        'type': 'FeatureCollection',
        'features': trails,
        'timestamp': timestamp,
        'count': len(trails)
    })


@app.route('/api/metadata', methods=['GET'])
def get_metadata():
    """Get metadata about available flight data."""
    if flights_df is None or len(flights_df) == 0:
        return jsonify({'error': 'No flight data loaded'}), 404
    
    # Calculate time range (mapped to base date)
    base_date_str = request.args.get('base_date', default='2024-01-01')
    base_date = datetime.strptime(base_date_str, "%Y-%m-%d")
    
    # Find earliest and latest firstseen times
    firstseen_col = None
    for col in flights_df.columns:
        if 'firstseen' in col.lower():
            firstseen_col = col
            break
    
    if firstseen_col:
        valid_times = flights_df[firstseen_col].dropna()
        if len(valid_times) > 0:
            earliest = pd.to_datetime(valid_times.min(), unit='s', errors='coerce')
            latest = pd.to_datetime(valid_times.max(), unit='s', errors='coerce')
            
            if pd.notna(earliest) and pd.notna(latest):
                # Map to base date
                day_start = base_date.replace(hour=0, minute=0, second=0)
                day_end = base_date.replace(hour=23, minute=59, second=59)
                
                min_ts = int(day_start.timestamp())
                max_ts = int(day_end.timestamp())
            else:
                min_ts = int(base_date.timestamp())
                max_ts = int((base_date + timedelta(hours=24)).timestamp())
        else:
            min_ts = int(base_date.timestamp())
            max_ts = int((base_date + timedelta(hours=24)).timestamp())
    else:
        min_ts = int(base_date.timestamp())
        max_ts = int((base_date + timedelta(hours=24)).timestamp())
    
    return jsonify({
        'total_flights': len(flights_df),
        'min_timestamp': min_ts,
        'max_timestamp': max_ts,
        'base_date': base_date_str
    })


def load_flight_data(csv_path):
    """Load flight data from CSV."""
    global flights_df
    
    print(f"Loading flight data from {csv_path}...")
    flights_df = pd.read_csv(csv_path)
    
    # Filter to valid flights
    dep_col = next((c for c in flights_df.columns if 'departure' in c.lower()), 'estdepartureairport')
    arr_col = next((c for c in flights_df.columns if 'arrival' in c.lower()), 'estarrivalairport')
    
    flights_df = flights_df.dropna(subset=[dep_col, arr_col])
    flights_df = flights_df[(flights_df[dep_col] != '') & (flights_df[arr_col] != '')]
    
    print(f"Loaded {len(flights_df)} valid flights")
    return flights_df


if __name__ == '__main__':
    import sys
    
    # Load flight data
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'data/flight_sample_2022-09-01 (1).csv'
    load_flight_data(csv_path)
    
    print("\nStarting Flask server...")
    print("API endpoints:")
    print("  GET /api/flights?timestamp=<unix_timestamp>")
    print("  GET /api/trails?timestamp=<unix_timestamp>&trail_minutes=30")
    print("  GET /api/metadata")
    print("\nServer running on http://localhost:5001")
    
    app.run(debug=True, port=5001, host='0.0.0.0')

