"""
Generate synthetic flight data for MVP demo.

Creates a realistic dataset of flights in a corridor (e.g., SFO → LAX)
with proper headings, timestamps, and formation opportunities.
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import argparse
from pathlib import Path


def generate_sample_flights(num_flights=300, duration_hours=2, output_file='data/sample_flights.csv'):
    """
    Generate synthetic flight data for demo.
    
    Creates flights along SFO → LAX corridor with realistic headings and timestamps.
    """
    np.random.seed(42)  # For reproducibility
    
    # SFO → LAX corridor coordinates
    sfo_lat, sfo_lon = 37.6213, -122.3790
    lax_lat, lax_lon = 33.9425, -118.4081
    
    # Generate flights
    flights = []
    start_time = datetime.now() - timedelta(hours=duration_hours)
    
    for i in range(num_flights):
        # Random position along corridor
        progress = np.random.uniform(0, 1)
        lat = sfo_lat + (lax_lat - sfo_lat) * progress + np.random.normal(0, 0.5)
        lon = sfo_lon + (lax_lon - sfo_lon) * progress + np.random.normal(0, 0.5)
        
        # Heading roughly southeast (SFO → LAX)
        base_heading = 135  # Southeast
        heading = base_heading + np.random.normal(0, 15)
        heading = heading % 360
        
        # Random timestamp within duration
        time_offset = np.random.uniform(0, duration_hours * 3600)
        timestamp = start_time + timedelta(seconds=time_offset)
        
        # Random altitude (flattened for 2D demo, but keep for realism)
        altitude = np.random.uniform(30000, 40000)
        
        # Callsign
        callsign = f"DEMO{1000 + i}"
        
        flights.append({
            'time': timestamp.isoformat(),
            'latitude': lat,
            'longitude': lon,
            'heading': heading,
            'altitude': altitude,
            'callsign': callsign,
            'speed': np.random.uniform(450, 550)  # knots
        })
    
    # Add some formation clusters (flights close together with similar headings)
    num_clusters = num_flights // 20
    for _ in range(num_clusters):
        # Pick a random flight as cluster center
        center_idx = np.random.randint(0, len(flights))
        center = flights[center_idx]
        
        # Add 2-4 nearby flights with similar headings
        cluster_size = np.random.randint(2, 5)
        for j in range(cluster_size):
            lat = center['latitude'] + np.random.normal(0, 0.05)
            lon = center['longitude'] + np.random.normal(0, 0.05)
            heading = center['heading'] + np.random.normal(0, 5)
            heading = heading % 360
            
            timestamp = pd.to_datetime(center['time']) + timedelta(minutes=np.random.randint(-2, 2))
            
            flights.append({
                'time': timestamp.isoformat(),
                'latitude': lat,
                'longitude': lon,
                'heading': heading,
                'altitude': center['altitude'] + np.random.normal(0, 1000),
                'callsign': f"DEMO{2000 + len(flights)}",
                'speed': center['speed'] + np.random.normal(0, 20)
            })
    
    # Create DataFrame
    df = pd.DataFrame(flights)
    
    # Save to CSV
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    
    print(f"Generated {len(df)} flights saved to {output_file}")
    print(f"Time range: {df['time'].min()} to {df['time'].max()}")
    print(f"Lat range: {df['latitude'].min():.2f} to {df['latitude'].max():.2f}")
    print(f"Lon range: {df['longitude'].min():.2f} to {df['longitude'].max():.2f}")
    
    return df


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate synthetic flight data')
    parser.add_argument('--num-flights', type=int, default=300, help='Number of flights to generate')
    parser.add_argument('--duration-hours', type=float, default=2, help='Time window duration in hours')
    parser.add_argument('--output', default='data/sample_flights.csv', help='Output CSV file')
    
    args = parser.parse_args()
    
    generate_sample_flights(args.num_flights, args.duration_hours, args.output)

