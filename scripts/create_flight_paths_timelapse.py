"""
Create flight paths from airport pairs and generate smooth timelapse data.

Takes flights.csv with airport pairs and creates interpolated flight paths
with positions that show planes moving from point A to point B.
All flights are mapped to a single day while preserving their hour/minute.
"""

import pandas as pd
import numpy as np
import json
import argparse
from pathlib import Path
from datetime import datetime, timedelta
import math

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
    """Get airport coordinates, handling both ICAO and IATA codes."""
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
    R = 6371  # Earth radius in km
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def interpolate_great_circle(lat1, lon1, lat2, lon2, num_points=20):
    """Interpolate points along a great circle path."""
    if num_points < 2:
        return [(lat1, lon1), (lat2, lon2)]
    
    points = []
    for i in range(num_points):
        f = i / (num_points - 1)
        # Simple linear interpolation (for short distances this is fine)
        # For longer distances, would use great circle interpolation
        lat = lat1 + (lat2 - lat1) * f
        lon = lon1 + (lon2 - lon1) * f
        points.append((lat, lon))
    return points

def create_flight_paths(input_csv, output_geojson, base_date="2024-01-01"):
    """
    Create flight paths from airport pairs and map all flights to a single day.
    
    Args:
        input_csv: Input CSV with airport pairs and timestamps
        output_geojson: Output GeoJSON with flight positions
        base_date: Base date to map all flights to (default: 2024-01-01)
    """
    print(f"Loading flights from {input_csv}...")
    df = pd.read_csv(input_csv)
    
    # Find relevant columns
    dep_col = next((c for c in df.columns if 'departure' in c.lower() or 'depart' in c.lower()), 'estdepartureairport')
    arr_col = next((c for c in df.columns if 'arrival' in c.lower() or 'arrive' in c.lower()), 'estarrivalairport')
    time_col = next((c for c in df.columns if 'firstseen' in c.lower() or 'first' in c.lower()), 'firstseen')
    callsign_col = next((c for c in df.columns if 'callsign' in c.lower()), 'callsign')
    
    print(f"Using columns: departure={dep_col}, arrival={arr_col}, time={time_col}")
    
    # Filter valid flights with both airports
    valid_flights = df.dropna(subset=[dep_col, arr_col])
    valid_flights = valid_flights[(valid_flights[dep_col] != '') & (valid_flights[arr_col] != '')]
    
    print(f"Found {len(valid_flights)} valid flights")
    
    # Convert base date
    base_dt = datetime.strptime(base_date, "%Y-%m-%d")
    
    all_positions = []
    flights_processed = 0
    
    print("Creating flight paths...")
    for idx, row in valid_flights.iterrows():
        dep_airport = str(row[dep_col]).strip()
        arr_airport = str(row[arr_col]).strip()
        callsign = str(row.get(callsign_col, f'FLIGHT{idx}')).strip()
        
        dep_coords = get_airport_coords(dep_airport)
        arr_coords = get_airport_coords(arr_airport)
        
        if not dep_coords or not arr_coords:
            continue
        
        # Get original timestamp
        original_time = row.get(time_col)
        if pd.isna(original_time):
            continue
            
        try:
            if isinstance(original_time, (int, float)):
                original_dt = datetime.fromtimestamp(float(original_time))
            else:
                original_dt = pd.to_datetime(original_time)
        except:
            continue
        
        # Map to base date preserving hour/minute/second
        flight_date = base_dt.replace(
            hour=original_dt.hour,
            minute=original_dt.minute,
            second=original_dt.second if hasattr(original_dt, 'second') else 0
        )
        
        # Calculate flight duration based on distance
        distance_km = calculate_distance(dep_coords[0], dep_coords[1], arr_coords[0], arr_coords[1])
        # Assume average speed of 800 km/h
        duration_hours = distance_km / 800
        duration_seconds = int(duration_hours * 3600)
        
        # Number of points along path (one per 30 seconds of flight time)
        num_points = max(10, min(100, int(duration_seconds / 30)))
        
        # Generate path points
        path_points = interpolate_great_circle(
            dep_coords[0], dep_coords[1],
            arr_coords[0], arr_coords[1],
            num_points
        )
        
        # Calculate heading for each segment
        def calculate_heading(lat1, lon1, lat2, lon2):
            lat1_rad = math.radians(lat1)
            lat2_rad = math.radians(lat2)
            delta_lon = math.radians(lon2 - lon1)
            y = math.sin(delta_lon) * math.cos(lat2_rad)
            x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(delta_lon)
            heading = math.atan2(y, x)
            heading = math.degrees(heading)
            return (heading + 360) % 360
        
        # Create positions along the path with timestamps
        for i, (lat, lon) in enumerate(path_points):
            # Time along flight path
            progress = i / (num_points - 1) if num_points > 1 else 0
            position_time = flight_date + timedelta(seconds=int(duration_seconds * progress))
            
            # Calculate heading (toward next point or destination)
            if i < len(path_points) - 1:
                next_lat, next_lon = path_points[i + 1]
                heading = calculate_heading(lat, lon, next_lat, next_lon)
            else:
                heading = calculate_heading(path_points[-2][0], path_points[-2][1], lat, lon)
            
            # Create feature
            feature = {
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [lon, lat]
                },
                'properties': {
                    'callsign': callsign,
                    'icao24': callsign,  # Use callsign as ID
                    'time': position_time.isoformat(),
                    'timestamp': int(position_time.timestamp()),
                    'heading': heading,
                    'velocity': 220,  # m/s (~800 km/h)
                    'altitude': 35000 + np.random.normal(0, 2000),  # feet
                    'departure': dep_airport,
                    'arrival': arr_airport,
                    'progress': progress
                }
            }
            all_positions.append(feature)
        
        flights_processed += 1
        if flights_processed % 100 == 0:
            print(f"  Processed {flights_processed} flights...")
    
    # Sort by timestamp
    all_positions.sort(key=lambda x: x['properties']['timestamp'])
    
    # Create GeoJSON
    geojson = {
        'type': 'FeatureCollection',
        'features': all_positions,
        'metadata': {
            'total_positions': len(all_positions),
            'total_flights': flights_processed,
            'base_date': base_date,
            'min_timestamp': min(p['properties']['timestamp'] for p in all_positions),
            'max_timestamp': max(p['properties']['timestamp'] for p in all_positions)
        }
    }
    
    # Save
    output_path = Path(output_geojson)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"\nSaving to {output_path}...")
    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    print(f"✓ Exported {len(all_positions)} positions from {flights_processed} flights")
    print(f"✓ Time range: {datetime.fromtimestamp(geojson['metadata']['min_timestamp'])} to {datetime.fromtimestamp(geojson['metadata']['max_timestamp'])}")
    
    return geojson

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Create flight paths timelapse from airport pairs')
    parser.add_argument('--input', required=True, help='Input CSV file with airport pairs')
    parser.add_argument('--output', default='data/flight_paths_timelapse.geojson', help='Output GeoJSON file')
    parser.add_argument('--base-date', default='2024-01-01', help='Base date to map all flights to (YYYY-MM-DD)')
    
    args = parser.parse_args()
    create_flight_paths(args.input, args.output, args.base_date)


