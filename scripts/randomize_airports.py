"""
Randomize airports in flights.csv by replacing origin and dest with random airports.
Saves the original file as backup_1.csv before making changes.
"""

import pandas as pd
import numpy as np
from pathlib import Path
import shutil

def randomize_airports_in_flights(
    flights_file='data/flights.csv',
    airports_file='data/airports.csv',
    backup_suffix='_1'
):
    """
    Randomize origin and dest airports in flights.csv.
    
    Args:
        flights_file: Path to flights.csv
        airports_file: Path to airports.csv with IATA codes
        backup_suffix: Suffix for backup file (e.g., '_1' for backup_1.csv)
    """
    np.random.seed(42)  # For reproducibility
    
    flights_path = Path(flights_file)
    airports_path = Path(airports_file)
    
    # Check if files exist
    if not flights_path.exists():
        print(f"Error: {flights_file} not found")
        return
    
    if not airports_path.exists():
        print(f"Error: {airports_file} not found")
        return
    
    # Create backup
    backup_path = flights_path.parent / f"flights_backup{backup_suffix}.csv"
    if backup_path.exists():
        response = input(f"Backup file {backup_path} already exists. Overwrite? (y/n): ")
        if response.lower() != 'y':
            print("Aborted.")
            return
    
    print(f"Creating backup: {backup_path}")
    shutil.copy2(flights_path, backup_path)
    print(f"✓ Backup created")
    
    # Load airports
    print(f"\nLoading airports from {airports_file}...")
    airports_df = pd.read_csv(airports_path)
    airport_codes = airports_df['IATA'].dropna().unique().tolist()
    print(f"✓ Loaded {len(airport_codes)} airports")
    
    # Load flights
    print(f"\nLoading flights from {flights_file}...")
    flights_df = pd.read_csv(flights_path)
    print(f"✓ Loaded {len(flights_df)} flights")
    
    # Check if origin and dest columns exist
    if 'origin' not in flights_df.columns or 'dest' not in flights_df.columns:
        print(f"Error: 'origin' and/or 'dest' columns not found in flights.csv")
        print(f"Available columns: {list(flights_df.columns)}")
        return
    
    # Randomize airports
    print(f"\nRandomizing airports...")
    flights_df['origin'] = np.random.choice(airport_codes, size=len(flights_df))
    flights_df['dest'] = np.random.choice(airport_codes, size=len(flights_df))
    
    # Ensure origin != dest (avoid same airport for origin and dest)
    same_airport = flights_df['origin'] == flights_df['dest']
    num_same = same_airport.sum()
    if num_same > 0:
        print(f"  Fixing {num_same} flights where origin == dest...")
        for idx in flights_df[same_airport].index:
            # Pick a different random airport for dest
            current_origin = flights_df.loc[idx, 'origin']
            other_airports = [code for code in airport_codes if code != current_origin]
            flights_df.loc[idx, 'dest'] = np.random.choice(other_airports)
        print(f"✓ Fixed")
    
    # Save modified flights
    print(f"\nSaving modified flights to {flights_file}...")
    flights_df.to_csv(flights_path, index=False)
    print(f"✓ Saved {len(flights_df)} flights with randomized airports")
    
    # Summary
    print(f"\nSummary:")
    print(f"  Original file backed up to: {backup_path}")
    print(f"  Modified file: {flights_file}")
    print(f"  Unique origins: {flights_df['origin'].nunique()}")
    print(f"  Unique destinations: {flights_df['dest'].nunique()}")
    print(f"  Total flights: {len(flights_df)}")


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Randomize airports in flights.csv')
    parser.add_argument('--flights', default='data/flights.csv', help='Path to flights.csv')
    parser.add_argument('--airports', default='data/airports.csv', help='Path to airports.csv')
    parser.add_argument('--backup-suffix', default='_1', help='Suffix for backup file (e.g., _1 for backup_1.csv)')
    
    args = parser.parse_args()
    
    randomize_airports_in_flights(args.flights, args.airports, args.backup_suffix)

