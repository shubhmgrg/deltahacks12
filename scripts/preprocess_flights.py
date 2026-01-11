"""
Preprocess flight CSV to show actual flight positions and paths over time.

Exports flight positions as points and paths as lines, organized by time bins.
"""

import pandas as pd
import numpy as np
import json
import argparse
from pathlib import Path
from collections import defaultdict


def preprocess_flight_positions(input_csv, output_geojson, time_bin_minutes=5):
    """
    Preprocess flight CSV into GeoJSON with actual flight positions and paths.
    
    Args:
        input_csv: Path to input CSV file
        output_geojson: Path to output GeoJSON file
        time_bin_minutes: Time window size for binning flights
    """
    print(f"Loading CSV from {input_csv}...")
    df = pd.read_csv(input_csv)
    
    # Handle different column name variations
    lat_col = next((c for c in df.columns if 'lat' in c.lower()), 'latitude')
    lon_col = next((c for c in df.columns if 'lon' in c.lower()), 'longitude')
    time_col = next((c for c in df.columns if 'time' in c.lower() or 'timestamp' in c.lower()), 'time')
    heading_col = next((c for c in df.columns if 'heading' in c.lower() or 'track' in c.lower()), 'heading')
    callsign_col = next((c for c in df.columns if 'callsign' in c.lower() or 'icao24' in c.lower()), 'callsign')
    
    print(f"Using columns: lat={lat_col}, lon={lon_col}, time={time_col}, heading={heading_col}")
    
    # Filter out invalid coordinates
    df = df.dropna(subset=[lat_col, lon_col])
    df = df[(df[lat_col] >= -90) & (df[lat_col] <= 90)]
    df = df[(df[lon_col] >= -180) & (df[lon_col] <= 180)]
    
    if len(df) == 0:
        raise ValueError("No valid flight data found after filtering coordinates")
    
    # Convert time to datetime if needed
    if df[time_col].dtype == 'object':
        df[time_col] = pd.to_datetime(df[time_col], errors='coerce')
    
    # Drop rows with invalid timestamps
    df = df.dropna(subset=[time_col])
    
    if len(df) == 0:
        raise ValueError("No valid timestamps found in data")
    
    # Group by time bins
    if time_bin_minutes > 0:
        df['time_bin'] = pd.to_datetime(df[time_col]).dt.floor(f'{time_bin_minutes}min')
    else:
        df['time_bin'] = df[time_col]
    
    # Group flights by callsign to create paths
    flight_paths = defaultdict(list)
    
    print("Organizing flights by callsign...")
    for _, row in df.iterrows():
        callsign = str(row.get(callsign_col, 'UNKNOWN')).strip()
        flight_paths[callsign].append({
            'time': row[time_col],
            'time_bin': row['time_bin'],
            'lat': row[lat_col],
            'lon': row[lon_col],
            'heading': row.get(heading_col, 0),
            'altitude': row.get('altitude', 0) if 'altitude' in df.columns else 0
        })
    
    # Sort each flight's positions by time
    for callsign in flight_paths:
        flight_paths[callsign].sort(key=lambda x: x['time'])
    
    # Create GeoJSON features
    point_features = []
    line_features = []
    
    # Group points by time bin for heatmap
    points_by_time = defaultdict(list)
    
    print("Creating GeoJSON features...")
    for callsign, positions in flight_paths.items():
        if len(positions) < 2:
            continue
        
        # Create line feature for flight path
        coordinates = [[pos['lon'], pos['lat']] for pos in positions]
        
        # Get time range
        times = [pos['time'] for pos in positions]
        time_bins = [pos['time_bin'] for pos in positions]
        
        line_feature = {
            'type': 'Feature',
            'geometry': {
                'type': 'LineString',
                'coordinates': coordinates
            },
            'properties': {
                'callsign': callsign,
                'start_time': str(min(times)),
                'end_time': str(max(times)),
                'num_points': len(positions)
            }
        }
        line_features.append(line_feature)
        
        # Create point features for each position
        for pos in positions:
            point_feature = {
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [pos['lon'], pos['lat']]
                },
                'properties': {
                    'callsign': callsign,
                    'time': str(pos['time']),
                    'time_bin': str(pos['time_bin']),
                    'heading': float(pos['heading']),
                    'altitude': float(pos['altitude'])
                }
            }
            point_features.append(point_feature)
            points_by_time[pos['time_bin']].append(point_feature)
    
    # Create GeoJSON with separate collections for points and lines
    geojson = {
        'type': 'FeatureCollection',
        'features': point_features,
        'metadata': {
            'total_points': len(point_features),
            'total_paths': len(line_features),
            'time_bins': sorted([str(tb) for tb in set(df['time_bin'])])
        }
    }
    
    # Also create a separate file for paths
    paths_geojson = {
        'type': 'FeatureCollection',
        'features': line_features
    }
    
    # Save GeoJSON files
    output_path = Path(output_geojson)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    # Save paths file
    paths_path = output_path.parent / (output_path.stem + '_paths.geojson')
    with open(paths_path, 'w') as f:
        json.dump(paths_geojson, f, indent=2)
    
    print(f"\nExported {len(point_features)} flight positions to {output_path}")
    print(f"Exported {len(line_features)} flight paths to {paths_path}")
    print(f"Time bins: {len(set(df['time_bin']))}")
    
    return geojson, paths_geojson


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Preprocess flight CSV to GeoJSON with positions and paths')
    parser.add_argument('--input', required=True, help='Input CSV file path')
    parser.add_argument('--output', default='data/flights.geojson', help='Output GeoJSON file path')
    parser.add_argument('--time-bin', type=int, default=5, help='Time bin size in minutes')
    
    args = parser.parse_args()
    
    preprocess_flight_positions(args.input, args.output, args.time_bin)


