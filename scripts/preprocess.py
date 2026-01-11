"""
Preprocess flight CSV data into GeoJSON heatmap for formation potential.

Converts flight state vectors into a 2D grid, computes formation opportunity
scores per cell, and exports as GeoJSON for Mapbox visualization.
"""

import pandas as pd
import numpy as np
import json
import argparse
from pathlib import Path
from collections import defaultdict
import math


def calculate_heading_alignment(heading1, heading2):
    """Calculate alignment factor between two headings (0-1, 1 = perfectly aligned)."""
    diff = abs(heading1 - heading2)
    # Normalize to 0-180 degrees
    diff = min(diff, 360 - diff)
    # Convert to alignment score (0 = opposite, 1 = same direction)
    alignment = 1 - (diff / 180.0)
    return max(0, alignment)


def grid_cell(lat, lon, grid_size=0.1):
    """Round lat/lon to grid cell coordinates."""
    return (round(lat / grid_size) * grid_size, round(lon / grid_size) * grid_size)


def compute_formation_score(flights_in_cell):
    """
    Compute formation opportunity score for a grid cell.
    
    Score = (# flights) × (heading alignment factor)
    """
    if len(flights_in_cell) < 2:
        return 0.0
    
    # Count flights
    flight_count = len(flights_in_cell)
    
    # Calculate average heading alignment
    alignments = []
    headings = [f['heading'] for f in flights_in_cell if not pd.isna(f['heading'])]
    
    if len(headings) < 2:
        return flight_count * 0.5  # Default moderate alignment
    
    # Calculate pairwise alignments
    for i in range(len(headings)):
        for j in range(i + 1, len(headings)):
            alignment = calculate_heading_alignment(headings[i], headings[j])
            alignments.append(alignment)
    
    avg_alignment = np.mean(alignments) if alignments else 0.5
    
    # Score = count × alignment (normalized later)
    score = flight_count * avg_alignment
    
    return score


def preprocess_flights(input_csv, output_geojson, grid_size=0.1, time_bin_minutes=5):
    """
    Preprocess flight CSV into GeoJSON heatmap.
    
    Args:
        input_csv: Path to input CSV file
        output_geojson: Path to output GeoJSON file
        grid_size: Grid cell size in degrees (default 0.1 ≈ 11km)
        time_bin_minutes: Time window size for binning flights
    """
    print(f"Loading CSV from {input_csv}...")
    df = pd.read_csv(input_csv)
    
    # Expected columns: time, latitude, longitude, heading, callsign (or similar)
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
    
    # Group flights by grid cell and time bin
    cell_data = defaultdict(lambda: defaultdict(list))
    
    print("Processing flights into grid cells...")
    for _, row in df.iterrows():
        lat, lon = row[lat_col], row[lon_col]
        cell = grid_cell(lat, lon, grid_size)
        time_bin = row['time_bin']
        
        flight_data = {
            'lat': lat,
            'lon': lon,
            'heading': row.get(heading_col, 0),
            'callsign': row.get(callsign_col, 'UNKNOWN'),
            'altitude': row.get('altitude', 0) if 'altitude' in df.columns else 0
        }
        
        cell_data[cell][time_bin].append(flight_data)
    
    # Compute scores for each cell/time combination
    features = []
    all_scores = []
    
    for cell, time_bins in cell_data.items():
        for time_bin, flights in time_bins.items():
            score = compute_formation_score(flights)
            all_scores.append(score)
            
            # Calculate average heading
            headings = [f['heading'] for f in flights if not pd.isna(f['heading'])]
            avg_heading = np.mean(headings) if headings else 0
            
            feature = {
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [cell[1], cell[0]]  # GeoJSON: [lon, lat]
                },
                'properties': {
                    'score': float(score),
                    'num_flights': len(flights),
                    'avg_heading': float(avg_heading),
                    'time_bin': str(time_bin),
                    'flights': flights  # Store individual flight data for single-flight view
                }
            }
            features.append(feature)
    
    # Normalize scores to 0-1
    if all_scores:
        max_score = max(all_scores)
        min_score = min(all_scores)
        score_range = max_score - min_score if max_score > min_score else 1
        
        for feature in features:
            if score_range > 0:
                normalized = (feature['properties']['score'] - min_score) / score_range
            else:
                normalized = 0.5  # Default if all scores are the same
            feature['properties']['score_normalized'] = float(normalized)
    else:
        print("Warning: No scores computed. Check your data.")
    
    # Create GeoJSON
    geojson = {
        'type': 'FeatureCollection',
        'features': features
    }
    
    # Save GeoJSON
    output_path = Path(output_geojson)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    print(f"Exported {len(features)} grid cells to {output_geojson}")
    print(f"Score range: {min(all_scores):.2f} - {max(all_scores):.2f}")
    
    return geojson


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Preprocess flight CSV to GeoJSON heatmap')
    parser.add_argument('--input', required=True, help='Input CSV file path')
    parser.add_argument('--output', default='data/heatmap.geojson', help='Output GeoJSON file path')
    parser.add_argument('--grid-size', type=float, default=0.1, help='Grid cell size in degrees')
    parser.add_argument('--time-bin', type=int, default=5, help='Time bin size in minutes')
    
    args = parser.parse_args()
    
    preprocess_flights(args.input, args.output, args.grid_size, args.time_bin)

