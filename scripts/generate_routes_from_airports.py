"""
Generate flight routes from airport pairs in CSV data.

Takes flight metadata CSV with airport codes and generates estimated
flight paths with positions, headings, and timestamps.
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import argparse
from pathlib import Path
import json

# Common airport coordinates (ICAO codes)
AIRPORT_COORDS = {
    # US airports
    'KSFO': (37.6213, -122.3790),  # San Francisco
    'KLAX': (33.9425, -118.4081),  # Los Angeles
    'KJFK': (40.6413, -73.7781),   # New York JFK
    'KORD': (41.9742, -87.9073),   # Chicago O'Hare
    'KDFW': (32.8998, -97.0403),   # Dallas/Fort Worth
    'KATL': (33.6407, -84.4277),   # Atlanta
    'KMIA': (25.7959, -80.2870),   # Miami
    'KSEA': (47.4502, -122.3088),  # Seattle
    'KDEN': (39.8561, -104.6737),  # Denver
    'KBOS': (42.3656, -71.0096),   # Boston
    'KSAN': (32.7338, -117.1933),  # San Diego
    'KSAT': (29.5337, -98.4698),  # San Antonio
    'KPHX': (33.4342, -112.0116),  # Phoenix
    'KLAS': (36.0840, -115.1537),  # Las Vegas
    'KMSP': (44.8831, -93.2218),   # Minneapolis
    'KDTW': (42.2162, -83.3554),   # Detroit
    'KPHL': (39.8719, -75.2411),    # Philadelphia
    'KIAD': (38.9531, -77.4565),   # Washington Dulles
    'KCLT': (35.2144, -80.9473),   # Charlotte
    'KHOU': (29.6454, -95.2789),   # Houston
    'KMCO': (28.4312, -81.3083),   # Orlando
    'KBWI': (39.1774, -76.6684),   # Baltimore
    'KSLC': (40.7899, -111.9791),  # Salt Lake City
    'KPIT': (40.4915, -80.2329),   # Pittsburgh
    'KSTL': (38.7487, -90.3700),   # St. Louis
    'KCLE': (41.4117, -81.8498),   # Cleveland
    'KIND': (39.7173, -86.2944),   # Indianapolis
    'KBNA': (36.1245, -86.6782),   # Nashville
    'KAUS': (30.1945, -97.6699),   # Austin
    'KRDU': (35.8776, -78.7875),   # Raleigh-Durham
    'KPDX': (45.5898, -122.5951),  # Portland
    'KSJC': (37.3626, -121.9290),  # San Jose
    'KOAK': (37.7213, -122.2207),  # Oakland
    'KSNA': (33.6757, -117.8682),  # Orange County
    'KBUR': (34.2006, -118.3587),  # Burbank
    'KONT': (34.0560, -117.6012),   # Ontario
    'KSBA': (34.4262, -119.8404),   # Santa Barbara
    'KSMF': (38.6954, -121.5908),   # Sacramento
    'KFAT': (36.7762, -119.7181),   # Fresno
    'KBFL': (35.4336, -119.0567),   # Bakersfield
    
    # International airports
    'EBBR': (50.9014, 4.4844),     # Brussels
    'EGLL': (51.4700, -0.4543),     # London Heathrow
    'LFPG': (49.0097, 2.5479),      # Paris CDG
    'EDDF': (50.0379, 8.5622),      # Frankfurt
    'EHAM': (52.3105, 4.7683),      # Amsterdam
    'LIRF': (41.8003, 12.2389),     # Rome Fiumicino
    'LEMD': (40.4839, -3.5680),     # Madrid
    'LFPG': (49.0097, 2.5479),      # Paris CDG
    'CYVR': (49.1947, -123.1792),   # Vancouver
    'CYYZ': (43.6772, -79.6306),    # Toronto
    'CYMX': (45.4577, -73.7497),    # Montreal
    'MMMX': (19.4363, -99.0721),    # Mexico City
    'SBGR': (-23.4321, -46.4692),   # São Paulo
    'EGKK': (51.1537, -0.1821),     # London Gatwick
    'LHR': (51.4700, -0.4543),      # London Heathrow (IATA)
    'CDG': (49.0097, 2.5479),       # Paris CDG (IATA)
    'FRA': (50.0379, 8.5622),       # Frankfurt (IATA)
    'AMS': (52.3105, 4.7683),       # Amsterdam (IATA)
    'JFK': (40.6413, -73.7781),     # JFK (IATA)
    'LAX': (33.9425, -118.4081),    # LAX (IATA)
    'SFO': (37.6213, -122.3790),    # SFO (IATA)
}


def get_airport_coords(airport_code):
    """Get airport coordinates, handling both ICAO and IATA codes."""
    if not airport_code or pd.isna(airport_code):
        return None
    
    airport_code = str(airport_code).strip().upper()
    
    # Try direct lookup
    if airport_code in AIRPORT_COORDS:
        return AIRPORT_COORDS[airport_code]
    
    # Try with K prefix (US airports)
    if len(airport_code) == 3:
        k_code = 'K' + airport_code
        if k_code in AIRPORT_COORDS:
            return AIRPORT_COORDS[k_code]
    
    return None


def calculate_heading(lat1, lon1, lat2, lon2):
    """Calculate heading (bearing) from point 1 to point 2 in degrees."""
    import math
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lon = math.radians(lon2 - lon1)
    
    y = math.sin(delta_lon) * math.cos(lat2_rad)
    x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(delta_lon)
    
    heading = math.atan2(y, x)
    heading = math.degrees(heading)
    heading = (heading + 360) % 360
    
    return heading


def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate great circle distance in kilometers."""
    import math
    
    R = 6371  # Earth radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c


def generate_flight_path(dep_airport, arr_airport, start_time, duration_seconds, num_points=10):
    """
    Generate flight path points between two airports.
    
    Returns list of (lat, lon, heading, timestamp) tuples.
    """
    dep_coords = get_airport_coords(dep_airport)
    arr_coords = get_airport_coords(arr_airport)
    
    if not dep_coords or not arr_coords:
        return []
    
    dep_lat, dep_lon = dep_coords
    arr_lat, arr_lon = arr_coords
    
    # Calculate initial heading
    heading = calculate_heading(dep_lat, dep_lon, arr_lat, arr_lon)
    
    # Generate points along the route
    points = []
    for i in range(num_points):
        # Interpolate position
        progress = i / (num_points - 1) if num_points > 1 else 0
        
        # Simple linear interpolation (could use great circle for more accuracy)
        lat = dep_lat + (arr_lat - dep_lat) * progress
        lon = dep_lon + (arr_lon - dep_lon) * progress
        
        # Add some realistic variation (aircraft don't fly perfectly straight)
        if 0 < progress < 1:
            # Add slight random variation
            lat += np.random.normal(0, 0.1)
            lon += np.random.normal(0, 0.1)
        
        # Calculate heading at this point (toward destination)
        if i < num_points - 1:
            point_heading = calculate_heading(lat, lon, arr_lat, arr_lon)
        else:
            point_heading = heading
        
        # Calculate timestamp
        timestamp = start_time + timedelta(seconds=duration_seconds * progress)
        
        points.append({
            'latitude': lat,
            'longitude': lon,
            'heading': point_heading,
            'time': timestamp.isoformat(),
            'altitude': 35000 + np.random.normal(0, 2000),  # Typical cruise altitude
            'speed': 450 + np.random.normal(0, 50)  # Typical cruise speed in knots
        })
    
    return points


def generate_routes_from_csv(input_csv, output_csv, points_per_flight=8):
    """
    Generate flight routes from airport pairs in CSV.
    
    Args:
        input_csv: Input CSV with airport codes
        output_csv: Output CSV with flight positions
        points_per_flight: Number of position points to generate per flight
    """
    print(f"Loading flight data from {input_csv}...")
    df = pd.read_csv(input_csv)
    
    # Find airport columns
    dep_col = None
    arr_col = None
    time_col = None
    
    for col in df.columns:
        col_lower = col.lower().strip()
        if 'departure' in col_lower or 'depart' in col_lower:
            dep_col = col
        elif 'arrival' in col_lower or 'arrive' in col_lower:
            arr_col = col
        elif 'firstseen' in col_lower or 'lastseen' in col_lower:
            if time_col is None or 'firstseen' in col_lower:
                time_col = col
    
    if not dep_col or not arr_col:
        # Try alternative column names
        dep_col = next((c for c in df.columns if 'departure' in c.lower() or 'depart' in c.lower()), None)
        arr_col = next((c for c in df.columns if 'arrival' in c.lower() or 'arrive' in c.lower()), None)
    
    if not dep_col:
        dep_col = 'estdepartureairport'
    if not arr_col:
        arr_col = 'estarrivalairport'
    if not time_col:
        time_col = 'firstseen'
    
    print(f"Using columns: departure={dep_col}, arrival={arr_col}, time={time_col}")
    
    # Find callsign column
    callsign_col = next((c for c in df.columns if 'callsign' in c.lower()), 'callsign')
    
    all_flight_points = []
    flights_processed = 0
    flights_skipped = 0
    
    for idx, row in df.iterrows():
        dep_airport = row.get(dep_col)
        arr_airport = row.get(arr_col)
        callsign = row.get(callsign_col, f'FLIGHT{idx}')
        
        # Skip if missing airports
        if pd.isna(dep_airport) or pd.isna(arr_airport):
            flights_skipped += 1
            continue
        
        # Get coordinates
        dep_coords = get_airport_coords(dep_airport)
        arr_coords = get_airport_coords(arr_airport)
        
        if not dep_coords or not arr_coords:
            flights_skipped += 1
            continue
        
        # Calculate flight duration
        start_time_val = row.get(time_col)
        if pd.isna(start_time_val):
            start_time = datetime.now() - timedelta(hours=2)
        else:
            try:
                start_time = datetime.fromtimestamp(float(start_time_val))
            except:
                start_time = datetime.now() - timedelta(hours=2)
        
        # Estimate flight duration based on distance
        distance_km = calculate_distance(dep_coords[0], dep_coords[1], arr_coords[0], arr_coords[1])
        # Assume average speed of 800 km/h
        duration_hours = distance_km / 800
        duration_seconds = duration_hours * 3600
        
        # Generate flight path
        flight_points = generate_flight_path(
            dep_airport, arr_airport, start_time, duration_seconds, points_per_flight
        )
        
        # Add callsign to each point
        for point in flight_points:
            point['callsign'] = str(callsign).strip()
            all_flight_points.append(point)
        
        flights_processed += 1
        
        if (idx + 1) % 1000 == 0:
            print(f"Processed {idx + 1} flights...")
    
    # Create DataFrame
    if not all_flight_points:
        raise ValueError("No valid flight routes generated. Check airport codes.")
    
    result_df = pd.DataFrame(all_flight_points)
    
    # Save to CSV
    output_path = Path(output_csv)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result_df.to_csv(output_path, index=False)
    
    print(f"\nGenerated {len(result_df)} flight position points from {flights_processed} flights")
    print(f"Skipped {flights_skipped} flights (missing airports or coordinates)")
    print(f"Saved to {output_csv}")
    print(f"Time range: {result_df['time'].min()} to {result_df['time'].max()}")
    
    return result_df


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate flight routes from airport pairs')
    parser.add_argument('--input', required=True, help='Input CSV with airport codes')
    parser.add_argument('--output', default='data/flight_routes.csv', help='Output CSV with flight positions')
    parser.add_argument('--points', type=int, default=8, help='Number of position points per flight')
    
    args = parser.parse_args()
    
    generate_routes_from_csv(args.input, args.output, args.points)


