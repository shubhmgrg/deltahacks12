"""
Preprocess OpenSky state vector CSV to show actual flight positions over time.

Filters and processes state vector data to create flight positions and paths.
"""

import pandas as pd
import numpy as np
import json
import argparse
from pathlib import Path
from collections import defaultdict
from datetime import datetime


def preprocess_states(input_csv, output_geojson, time_bin_minutes=5, 
                     sample_rate=1, max_rows=None, region=None):
    """
    Preprocess state vector CSV into GeoJSON with flight positions.
    
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
    
    # Create point features grouped by time bin
    features_by_time = defaultdict(list)
    
    print("Creating GeoJSON features...")
    for idx, row in df.iterrows():
        if idx % 10000 == 0 and idx > 0:
            print(f"  Processed {idx} positions...")
        
        time_bin = row['time_bin']
        
        feature = {
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [float(row['lon']), float(row['lat'])]
            },
            'properties': {
                'callsign': str(row.get('callsign', 'UNKNOWN')).strip(),
                'icao24': str(row.get('icao24', 'UNKNOWN')),
                'time': str(row['datetime']),
                'time_bin': str(time_bin),
                'heading': float(row.get('heading', 0)) if pd.notna(row.get('heading')) else 0,
                'velocity': float(row.get('velocity', 0)) if pd.notna(row.get('velocity')) else 0,
                'altitude': float(row.get('geoaltitude', 0)) if pd.notna(row.get('geoaltitude')) else 0
            }
        }
        features_by_time[time_bin].append(feature)
    
    # Create GeoJSON structure
    all_features = []
    for time_bin in time_bins:
        all_features.extend(features_by_time[time_bin])
    
    geojson = {
        'type': 'FeatureCollection',
        'features': all_features,
        'metadata': {
            'total_points': len(all_features),
            'time_bins': [str(tb) for tb in time_bins],
            'time_range': {
                'start': str(time_bins[0]),
                'end': str(time_bins[-1])
            }
        }
    }
    
    # Save GeoJSON
    output_path = Path(output_geojson)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"\nSaving to {output_path}...")
    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    print(f"✓ Exported {len(all_features)} flight positions")
    print(f"✓ Time bins: {len(time_bins)}")
    
    return geojson


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Preprocess OpenSky state vector CSV')
    parser.add_argument('--input', required=True, help='Input CSV file path')
    parser.add_argument('--output', default='data/flights.geojson', help='Output GeoJSON file path')
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
    
    preprocess_states(args.input, args.output, args.time_bin, 
                     args.sample, args.max_rows, region)


