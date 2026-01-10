import pandas as pd
from datetime import datetime, timedelta
import numpy as np
import math

# Load the CSV file
print("Loading flights CSV...")
df = pd.read_csv('data/flights.csv')

print(f"Loaded {len(df)} flights")
print(f"Columns: {list(df.columns)}")
print(f"\nFirst few rows:")
print(df.head())

# Convert numeric time columns to datetime (treating all as single day)
# Times are in format like 517.0 (5:17 AM), 1400.0 (2:00 PM), etc.
# We'll use a base date of 2013-01-01 and add time to it

def convert_time_to_datetime(time_value, base_date):
    """Convert numeric time (e.g., 517.0 or 517) to datetime object
    Times are in HHMM format: 517 = 5:17 AM, 830 = 8:30 AM, 1400 = 2:00 PM
    """
    if pd.isna(time_value):
        return pd.NaT
    
    # Convert to integer to remove decimal (handles both int and float)
    time_int = int(float(time_value))
    
    # Extract hours and minutes from HHMM format
    hours = time_int // 100
    minutes = time_int % 100
    
    # Handle cases where minutes >= 60 (shouldn't happen in valid data, but safety check)
    if minutes >= 60:
        hours += minutes // 60
        minutes = minutes % 60
    
    # Handle times that go past midnight (hours >= 24)
    # Since we're treating everything as single day, cap at 23:59
    if hours >= 24:
        hours = 23
        minutes = 59
    
    # Create datetime by adding time to base date
    return base_date + timedelta(hours=hours, minutes=minutes)

# Set base date (treating all flights as if they're on this day)
base_date = datetime(2013, 1, 1)

print("\nConverting time columns to datetime objects...")

# Convert dep_time
df['dep_time_dt'] = df['dep_time'].apply(lambda x: convert_time_to_datetime(x, base_date))

# Convert sched_dep_time
df['sched_dep_time_dt'] = df['sched_dep_time'].apply(lambda x: convert_time_to_datetime(x, base_date))

# Convert arr_time
df['arr_time_dt'] = df['arr_time'].apply(lambda x: convert_time_to_datetime(x, base_date))

# Convert sched_arr_time
df['sched_arr_time_dt'] = df['sched_arr_time'].apply(lambda x: convert_time_to_datetime(x, base_date))

# Parse time_hour if it exists (already a datetime string)
if 'time_hour' in df.columns:
    df['time_hour_dt'] = pd.to_datetime(df['time_hour'], errors='coerce')

# Create a combined datetime from year, month, day, hour, minute (but all on same day)
# Since we're treating as single day, we'll just use hour and minute with base_date
df['datetime_from_hour_min'] = df.apply(
    lambda row: base_date + timedelta(hours=int(row['hour']), minutes=int(row['minute'])) 
    if pd.notna(row['hour']) and pd.notna(row['minute']) 
    else pd.NaT, 
    axis=1
)

print("\nTime conversion complete!")
print("\nSample of converted times:")
print(df[['dep_time', 'dep_time_dt', 'sched_dep_time', 'sched_dep_time_dt', 
          'arr_time', 'arr_time_dt', 'time_hour_dt']].head(10))

# STEP 2: Load airport database and merge lat/lon
print("\n" + "="*60)
print("STEP 2: Mapping Airports to Lat/Lon")
print("="*60)

# Load airport database CSV
print("\nLoading airport database...")
airports_df = pd.read_csv('data/airports.csv')

print(f"Loaded {len(airports_df)} airports")
print(f"Airport columns: {list(airports_df.columns)}")
print("\nSample airports:")
print(airports_df.head(10))

# Merge origin airport lat/lon
print("\nMerging origin airport coordinates...")
df = df.merge(
    airports_df[['IATA', 'latitude', 'longitude']], 
    left_on='origin', 
    right_on='IATA', 
    how='left',
    suffixes=('', '_origin')
)
df.rename(columns={'latitude': 'origin_lat', 'longitude': 'origin_lon'}, inplace=True)
df.drop(columns=['IATA'], inplace=True)

# Merge destination airport lat/lon
print("Merging destination airport coordinates...")
df = df.merge(
    airports_df[['IATA', 'latitude', 'longitude']], 
    left_on='dest', 
    right_on='IATA', 
    how='left',
    suffixes=('', '_dest')
)
df.rename(columns={'latitude': 'dest_lat', 'longitude': 'dest_lon'}, inplace=True)
df.drop(columns=['IATA'], inplace=True)

# Check for missing coordinates
missing_origin = df['origin_lat'].isna().sum()
missing_dest = df['dest_lat'].isna().sum()

print(f"\nMerge complete!")
print(f"Missing origin coordinates: {missing_origin} flights")
print(f"Missing destination coordinates: {missing_dest} flights")

if missing_origin > 0:
    print("\nFlights with missing origin coordinates:")
    print(df[df['origin_lat'].isna()][['origin', 'dest']].value_counts().head(10))

if missing_dest > 0:
    print("\nFlights with missing destination coordinates:")
    print(df[df['dest_lat'].isna()][['origin', 'dest']].value_counts().head(10))

print("\nSample of flights with coordinates:")
sample_cols = ['origin', 'origin_lat', 'origin_lon', 'dest', 'dest_lat', 'dest_lon']
print(df[sample_cols].head(10))

print(f"\nDataset shape: {df.shape}")
print(f"\nNew columns added: origin_lat, origin_lon, dest_lat, dest_lon")

# STEP 3: Synthesize Flight Positions
print("\n" + "="*60)
print("STEP 3: Synthesize Flight Positions")
print("="*60)

def great_circle_interpolate(lat1, lon1, lat2, lon2, fraction):
    """
    Interpolate between two points on a sphere using great circle interpolation.
    
    Args:
        lat1, lon1: Origin coordinates (degrees)
        lat2, lon2: Destination coordinates (degrees)
        fraction: Interpolation fraction (0.0 = origin, 1.0 = destination)
    
    Returns:
        (lat, lon) tuple of interpolated coordinates
    """
    if pd.isna(lat1) or pd.isna(lon1) or pd.isna(lat2) or pd.isna(lon2):
        return (np.nan, np.nan)
    
    # Convert to radians
    phi1 = math.radians(lat1)
    lambda1 = math.radians(lon1)
    phi2 = math.radians(lat2)
    lambda2 = math.radians(lon2)
    
    # Calculate angular distance
    d = math.acos(
        math.sin(phi1) * math.sin(phi2) + 
        math.cos(phi1) * math.cos(phi2) * math.cos(lambda2 - lambda1)
    )
    
    # Handle co-located points or very close points
    if d < 1e-10:
        return (lat1, lon1)
    
    # Interpolate
    a = math.sin((1 - fraction) * d) / math.sin(d)
    b = math.sin(fraction * d) / math.sin(d)
    
    x = a * math.cos(phi1) * math.cos(lambda1) + b * math.cos(phi2) * math.cos(lambda2)
    y = a * math.cos(phi1) * math.sin(lambda1) + b * math.cos(phi2) * math.sin(lambda2)
    z = a * math.sin(phi1) + b * math.sin(phi2)
    
    phi = math.atan2(z, math.sqrt(x*x + y*y))
    lambda_interp = math.atan2(y, x)
    
    # Convert back to degrees
    return (math.degrees(phi), math.degrees(lambda_interp))

def generate_flight_nodes(row, time_step_minutes=20):
    """
    Generate position nodes for a single flight.
    
    Args:
        row: Flight row from dataframe
        time_step_minutes: Time step in minutes (default: 20)
    
    Returns:
        List of dictionaries, each representing a node
    """
    nodes = []
    
    # Skip if missing required data
    if (pd.isna(row['dep_time_dt']) or pd.isna(row['arr_time_dt']) or
        pd.isna(row['origin_lat']) or pd.isna(row['origin_lon']) or
        pd.isna(row['dest_lat']) or pd.isna(row['dest_lon'])):
        return nodes
    
    dep_time = row['dep_time_dt']
    arr_time = row['arr_time_dt']
    
    # Calculate flight duration
    duration = arr_time - dep_time
    
    # Skip if duration is negative or zero (invalid flight)
    if duration.total_seconds() <= 0:
        return nodes
    
    # Generate time steps (every time_step_minutes minutes)
    current_time = dep_time
    time_index = 0
    
    while current_time <= arr_time:
        # Calculate interpolation fraction
        elapsed = (current_time - dep_time).total_seconds()
        total_duration = duration.total_seconds()
        fraction = elapsed / total_duration if total_duration > 0 else 0.0
        
        # Clamp fraction to [0, 1]
        fraction = max(0.0, min(1.0, fraction))
        
        # Interpolate position
        lat, lon = great_circle_interpolate(
            row['origin_lat'], row['origin_lon'],
            row['dest_lat'], row['dest_lon'],
            fraction
        )
        
        # Create node
        node = {
            'flight_id': row['id'],
            'timestamp': current_time,
            'lat': lat,
            'lon': lon,
            'time_index': time_index,
            'carrier': row['carrier'],
            'tailnum': row['tailnum'] if pd.notna(row['tailnum']) else None,
            'origin': row['origin'],
            'dest': row['dest']
        }
        nodes.append(node)
        
        # Move to next time step
        current_time += timedelta(minutes=time_step_minutes)
        time_index += 1
    
    # Always include the final arrival point if not already included
    # Check if we need to add the final point (within 1 minute tolerance to avoid duplicates)
    if nodes:
        last_time_diff = abs((nodes[-1]['timestamp'] - arr_time).total_seconds())
        if last_time_diff > 60:  # More than 1 minute difference, add final point
            lat, lon = great_circle_interpolate(
                row['origin_lat'], row['origin_lon'],
                row['dest_lat'], row['dest_lon'],
                1.0
            )
            node = {
                'flight_id': row['id'],
                'timestamp': arr_time,
                'lat': lat,
                'lon': lon,
                'time_index': time_index,
                'carrier': row['carrier'],
                'tailnum': row['tailnum'] if pd.notna(row['tailnum']) else None,
                'origin': row['origin'],
                'dest': row['dest']
            }
            nodes.append(node)
    elif not nodes:
        # Edge case: if flight duration is very short and we have no nodes yet,
        # add at least origin and destination
        lat_orig, lon_orig = great_circle_interpolate(
            row['origin_lat'], row['origin_lon'],
            row['dest_lat'], row['dest_lon'],
            0.0
        )
        node_orig = {
            'flight_id': row['id'],
            'timestamp': dep_time,
            'lat': lat_orig,
            'lon': lon_orig,
            'time_index': 0,
            'carrier': row['carrier'],
            'tailnum': row['tailnum'] if pd.notna(row['tailnum']) else None,
            'origin': row['origin'],
            'dest': row['dest']
        }
        nodes.append(node_orig)
        
        lat_dest, lon_dest = great_circle_interpolate(
            row['origin_lat'], row['origin_lon'],
            row['dest_lat'], row['dest_lon'],
            1.0
        )
        node_dest = {
            'flight_id': row['id'],
            'timestamp': arr_time,
            'lat': lat_dest,
            'lon': lon_dest,
            'time_index': 1,
            'carrier': row['carrier'],
            'tailnum': row['tailnum'] if pd.notna(row['tailnum']) else None,
            'origin': row['origin'],
            'dest': row['dest']
        }
        nodes.append(node_dest)
    
    return nodes

print("\nGenerating flight position nodes (every 20 minutes)...")
print("This may take a while for large datasets...")

# Generate nodes for all flights and save incrementally to avoid memory issues
total_flights = len(df)
processed = 0
batch_size = 5000  # Process in batches
batch_nodes = []
total_nodes = 0
output_file = 'data/flight_nodes.csv'

# Open output file and write header
node_columns = ['flight_id', 'timestamp', 'lat', 'lon', 'time_index', 'carrier', 'tailnum', 'origin', 'dest']
first_batch = True

print(f"Processing {total_flights} flights in batches of {batch_size}...")

for idx, row in df.iterrows():
    nodes = generate_flight_nodes(row, time_step_minutes=20)
    batch_nodes.extend(nodes)
    processed += 1
    
    # Save batch when it reaches batch_size
    if len(batch_nodes) >= batch_size or processed == total_flights:
        if batch_nodes:
            batch_df = pd.DataFrame(batch_nodes)
            # Write to CSV (append mode after first write)
            if first_batch:
                batch_df.to_csv(output_file, index=False, mode='w')
                first_batch = False
            else:
                batch_df.to_csv(output_file, index=False, mode='a', header=False)
            total_nodes += len(batch_nodes)
            batch_nodes = []  # Clear batch to free memory
    
    # Progress update every 10000 flights
    if processed % 10000 == 0:
        print(f"  Processed {processed}/{total_flights} flights... ({total_nodes:,} nodes written so far)")

print(f"\nCompleted processing {total_flights} flights")
print(f"Generated {total_nodes:,} total nodes")
print(f"Saved to: {output_file}")

# Load a sample to show
print("\nLoading sample from saved file...")
nodes_df = pd.read_csv(output_file, nrows=1000)  # Load first 1000 rows as sample

print(f"\nNodes DataFrame shape: {nodes_df.shape} (showing first 1000 rows)")
print(f"Columns: {list(nodes_df.columns)}")

print("\nSample nodes:")
print(nodes_df.head(10))

# Show statistics from the saved file
print("\nCalculating statistics from saved file...")
nodes_df_full = pd.read_csv(output_file)
nodes_df_full['timestamp'] = pd.to_datetime(nodes_df_full['timestamp'])

print("\nNode statistics:")
print(f"  Total nodes: {len(nodes_df_full):,}")
print(f"  Unique flights: {nodes_df_full['flight_id'].nunique():,}")
print(f"  Average nodes per flight: {len(nodes_df_full) / nodes_df_full['flight_id'].nunique():.2f}")
print(f"  Min nodes per flight: {nodes_df_full.groupby('flight_id').size().min()}")
print(f"  Max nodes per flight: {nodes_df_full.groupby('flight_id').size().max()}")
print(f"  Time range: {nodes_df_full['timestamp'].min()} to {nodes_df_full['timestamp'].max()}")

# Also save as pickle for faster loading later
pickle_file = 'data/flight_nodes.pkl'
print(f"\nSaving to pickle format for faster loading: {pickle_file}")
nodes_df_full.to_pickle(pickle_file)
print("Done!")

print("\n" + "="*60)
print("STEP 3 Complete!")
print("="*60)

