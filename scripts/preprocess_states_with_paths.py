"""
Preprocess OpenSky state vector CSV to show flight paths (lines) over time.

Creates LineString features connecting sequential positions for each flight.
"""

import pandas as pd
import numpy as np
import json
import argparse
from pathlib import Path
from collections import defaultdict
from datetime import datetime


def preprocess_states_with_paths(input_csv, output_geojson, time_bin_minutes=5, 
                                 sample_rate=1, max_rows=None, region=None):
    """
    Preprocess state vector CSV into GeoJSON with flight paths (lines).
    
    Args:
        input_csv: Path to input CSV file
        output_geojson: Path to output GeoJSON file
        time_bin_minutes: Time window size for binning flights
        sample_rate: Sample every Nth row (1 = all, 10 = every 10th row)
        max_rows: Maximum rows to process (None = all)
        region: Dict with 'lat_min', 'lat_max', 'lon_min', 'lon_max' to filter region
    """
    print(f"Loading CSV from {input_csv}...")
    
    # Read in chunks to handle large files
    chunk_size = 50000
    chunks = []
    rows_read = 0
    
    for chunk in pd.read_csv(input_csv, chunksize=chunk_size):
        if max_rows and rows_read >= max_rows:
            break
        
        # Filter by region if specified
        if region:
            chunk = chunk[
                (chunk['lat'] >= region['lat_min']) & 
                (chunk['lat'] <= region['lat_max']) &
                (chunk['lon'] >= region['lon_min']) & 
                (chunk['lon'] <= region['lon_max'])
            ]
        
        # Filter out invalid data
        chunk = chunk.dropna(subset=['lat', 'lon', 'time'])
        chunk = chunk[(chunk['lat'] >= -90) & (chunk['lat'] <= 90)]
        chunk = chunk[(chunk['lon'] >= -180) & (chunk['lon'] <= 180)]
        chunk = chunk[chunk['onground'] == False]  # Only airborne flights
        
        # Sample if needed
        if sample_rate > 1:
            chunk = chunk.iloc[::sample_rate]
        
        chunks.append(chunk)
        rows_read += len(chunk)
        
        if max_rows and rows_read >= max_rows:
            break
        
        if len(chunks) % 10 == 0:
            print(f"  Processed {rows_read} rows...")
    
    if not chunks:
        raise ValueError("No data found after filtering")
    
    df = pd.concat(chunks, ignore_index=True)
    print(f"Loaded {len(df)} flight positions")
    
    # Convert time from Unix timestamp to datetime
    df['datetime'] = pd.to_datetime(df['time'], unit='s')
    
    # Group by time bins
    if time_bin_minutes > 0:
        df['time_bin'] = df['datetime'].dt.floor(f'{time_bin_minutes}min')
    else:
        df['time_bin'] = df['datetime']
    
    # Get unique time bins
    time_bins = sorted(df['time_bin'].unique())
    print(f"Time bins: {len(time_bins)}")
    print(f"Time range: {time_bins[0]} to {time_bins[-1]}")
    
    # Group positions by callsign/icao24 to create flight paths
    print("Organizing flights by callsign/icao24...")
    flights_by_id = defaultdict(list)
    
    for idx, row in df.iterrows():
        # Use icao24 as primary identifier, fallback to callsign
        flight_id = str(row.get('icao24', row.get('callsign', 'UNKNOWN'))).strip()
        if flight_id == 'UNKNOWN' or flight_id == '':
            continue
            
        flights_by_id[flight_id].append({
            'time': row['datetime'],
            'time_bin': row['time_bin'],
            'lat': float(row['lat']),
            'lon': float(row['lon']),
            'heading': float(row.get('heading', 0)) if pd.notna(row.get('heading')) else 0,
            'velocity': float(row.get('velocity', 0)) if pd.notna(row.get('velocity')) else 0,
            'altitude': float(row.get('geoaltitude', 0)) if pd.notna(row.get('geoaltitude')) else 0,
            'callsign': str(row.get('callsign', '')).strip(),
            'icao24': str(row.get('icao24', '')).strip()
        })
    
    # Sort each flight's positions by time
    for flight_id in flights_by_id:
        flights_by_id[flight_id].sort(key=lambda x: x['time'])
    
    print(f"Found {len(flights_by_id)} unique flights")
    
    # Create path features (LineStrings) grouped by time bin
    path_features_by_time = defaultdict(list)
    point_features_by_time = defaultdict(list)
    
    print("Creating flight path features...")
    path_count = 0
    
    for flight_id, positions in flights_by_id.items():
        if len(positions) < 2:
            continue
        
        # Create segments between consecutive positions
        for i in range(len(positions) - 1):
            pos1 = positions[i]
            pos2 = positions[i + 1]
            
            # Create line segment
            line_coords = [
                [pos1['lon'], pos1['lat']],
                [pos2['lon'], pos2['lat']]
            ]
            
            # Determine which time bin this segment belongs to
            # Use the later time bin if they differ
            segment_time_bin = max(pos1['time_bin'], pos2['time_bin'])
            
            path_feature = {
                'type': 'Feature',
                'geometry': {
                    'type': 'LineString',
                    'coordinates': line_coords
                },
                'properties': {
                    'callsign': pos1.get('callsign', flight_id),
                    'icao24': pos1.get('icao24', flight_id),
                    'start_time': str(pos1['time']),
                    'end_time': str(pos2['time']),
                    'time_bin': str(segment_time_bin),
                    'heading': pos1['heading'],
                    'velocity': pos1['velocity'],
                    'altitude': pos1['altitude'],
                    'segment_index': i
                }
            }
            path_features_by_time[segment_time_bin].append(path_feature)
            path_count += 1
        
        # Also add point features for start/end of each segment
        for pos in positions:
            point_feature = {
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [pos['lon'], pos['lat']]
                },
                'properties': {
                    'callsign': pos.get('callsign', flight_id),
                    'icao24': pos.get('icao24', flight_id),
                    'time': str(pos['time']),
                    'time_bin': str(pos['time_bin']),
                    'heading': pos['heading'],
                    'velocity': pos['velocity'],
                    'altitude': pos['altitude']
                }
            }
            point_features_by_time[pos['time_bin']].append(point_feature)
    
    # Combine all features by time bin
    all_path_features = []
    all_point_features = []
    
    for time_bin in time_bins:
        all_path_features.extend(path_features_by_time[time_bin])
        all_point_features.extend(point_features_by_time[time_bin])
    
    # Create GeoJSON for paths
    paths_geojson = {
        'type': 'FeatureCollection',
        'features': all_path_features,
        'metadata': {
            'total_segments': len(all_path_features),
            'total_points': len(all_point_features),
            'time_bins': [str(tb) for tb in time_bins],
            'time_range': {
                'start': str(time_bins[0]),
                'end': str(time_bins[-1])
            }
        }
    }
    
    # Create GeoJSON for points (optional, for reference)
    points_geojson = {
        'type': 'FeatureCollection',
        'features': all_point_features
    }
    
    # Save GeoJSON files
    output_path = Path(output_geojson)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"\nSaving paths to {output_path}...")
    with open(output_path, 'w') as f:
        json.dump(paths_geojson, f, indent=2)
    
    # Save points file
    points_path = output_path.parent / (output_path.stem + '_points.geojson')
    print(f"Saving points to {points_path}...")
    with open(points_path, 'w') as f:
        json.dump(points_geojson, f, indent=2)
    
    print(f"✓ Exported {len(all_path_features)} flight path segments")
    print(f"✓ Exported {len(all_point_features)} flight positions")
    print(f"✓ Time bins: {len(time_bins)}")
    
    return paths_geojson, points_geojson


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Preprocess OpenSky state vector CSV with flight paths')
    parser.add_argument('--input', required=True, help='Input CSV file path')
    parser.add_argument('--output', default='data/flight_paths.geojson', help='Output GeoJSON file path')
    parser.add_argument('--time-bin', type=int, default=5, help='Time bin size in minutes')
    parser.add_argument('--sample', type=int, default=10, help='Sample every Nth row (default: 10)')
    parser.add_argument('--max-rows', type=int, help='Maximum rows to process')
    parser.add_argument('--region', help='Region filter: lat_min,lat_max,lon_min,lon_max')
    
    args = parser.parse_args()
    
    region = None
    if args.region:
        parts = args.region.split(',')
        region = {
            'lat_min': float(parts[0]),
            'lat_max': float(parts[1]),
            'lon_min': float(parts[2]),
            'lon_max': float(parts[3])
        }
    
    preprocess_states_with_paths(args.input, args.output, args.time_bin, 
                                 args.sample, args.max_rows, region)


