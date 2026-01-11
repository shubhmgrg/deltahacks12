"""
Update airports.csv based on airports used in flights.csv.
Creates a backup of the original airports.csv and updates it with only airports found in flights.
"""

import pandas as pd
import numpy as np
from pathlib import Path
import shutil

def update_airports_from_flights(
    flights_file='data/flights.csv',
    airports_file='data/airports.csv',
    backup_suffix='_1'
):
    """
    Update airports.csv to include only airports used in flights.csv.
    Creates backup of original airports.csv.
    
    For airports not in the current airports.csv, you'll need to provide coordinates
    or they will be skipped with a warning.
    """
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
    backup_path = airports_path.parent / f"airports_backup{backup_suffix}.csv"
    if backup_path.exists():
        response = input(f"Backup file {backup_path} already exists. Overwrite? (y/n): ")
        if response.lower() != 'y':
            print("Aborted.")
            return
    
    print(f"Creating backup: {backup_path}")
    shutil.copy2(airports_path, backup_path)
    print(f"✓ Backup created")
    
    # Load flights and get unique airports
    print(f"\nLoading flights from {flights_file}...")
    flights_df = pd.read_csv(flights_path)
    all_airports_in_flights = set(flights_df['origin'].unique()) | set(flights_df['dest'].unique())
    print(f"✓ Found {len(all_airports_in_flights)} unique airports in flights")
    
    # Load current airports
    print(f"\nLoading airports from {airports_file}...")
    airports_df = pd.read_csv(airports_path)
    print(f"✓ Loaded {len(airports_df)} airports")
    
    # Filter airports to only those used in flights
    airports_in_flights_df = airports_df[airports_df['IATA'].isin(all_airports_in_flights)].copy()
    
    # Find missing airports
    airports_in_csv = set(airports_df['IATA'].unique())
    missing_airports = all_airports_in_flights - airports_in_csv
    
    if missing_airports:
        print(f"\n⚠ Warning: {len(missing_airports)} airports in flights.csv are not in airports.csv:")
        print(f"  {sorted(list(missing_airports))}")
        print(f"  These airports will be skipped.")
        print(f"  You may need to add them manually with coordinates.")
    
    # Save updated airports
    print(f"\nSaving updated airports to {airports_file}...")
    airports_in_flights_df = airports_in_flights_df.sort_values('IATA')
    airports_in_flights_df.to_csv(airports_path, index=False)
    print(f"✓ Saved {len(airports_in_flights_df)} airports")
    
    # Summary
    print(f"\nSummary:")
    print(f"  Original file backed up to: {backup_path}")
    print(f"  Modified file: {airports_file}")
    print(f"  Airports in flights.csv: {len(all_airports_in_flights)}")
    print(f"  Airports in updated airports.csv: {len(airports_in_flights_df)}")
    if missing_airports:
        print(f"  Missing airports (not in original airports.csv): {len(missing_airports)}")
    
    return airports_in_flights_df, missing_airports


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Update airports.csv based on flights.csv')
    parser.add_argument('--flights', default='data/flights.csv', help='Path to flights.csv')
    parser.add_argument('--airports', default='data/airports.csv', help='Path to airports.csv')
    parser.add_argument('--backup-suffix', default='_1', help='Suffix for backup file')
    
    args = parser.parse_args()
    
    update_airports_from_flights(args.flights, args.airports, args.backup_suffix)

