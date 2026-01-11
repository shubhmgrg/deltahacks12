import pymongo
from pymongo import MongoClient
from datetime import datetime, timedelta
import os
import sys
import json
import math
from collections import defaultdict

# Try to import tqdm for progress bar, but make it optional
try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False
    def tqdm(iterable, **kwargs):
        return iterable

print("="*60)
print("STEP 6: Compute Heatmap")
print("="*60)

# Configuration - Try to load from .env file first
try:
    from dotenv import load_dotenv
    load_dotenv()  # Load .env file if it exists
except ImportError:
    pass  # python-dotenv not installed, will use environment variables only

MONGO_URI = os.getenv('MONGODB_URI', os.getenv('MONGO_ATLAS_URI'))
if not MONGO_URI:
    MONGO_URI = 'mongodb://localhost:27017/'  # Default to local if not found

DB_NAME = os.getenv('MONGODB_DB_NAME', 'flights')
NODES_COLLECTION = 'flight_nodes'
EDGES_COLLECTION = 'formation_edges'

# Grid cell resolution (degrees)
# Smaller = finer grid (more cells, more detailed)
# Larger = coarser grid (fewer cells, less detailed)
# Common values: 0.1° (~11 km), 0.05° (~5.5 km), 0.2° (~22 km)
GRID_RESOLUTION = float(os.getenv('GRID_RESOLUTION', '0.1'))  # Default: 0.1 degrees

# Time step for aggregation (minutes)
# Groups nodes into time buckets
TIME_STEP_MINUTES = int(os.getenv('TIME_STEP_MINUTES', '20'))  # Default: 20 minutes

# Whether to weight by formation candidates
WEIGHT_BY_FORMATION = os.getenv('WEIGHT_BY_FORMATION', 'true').lower() == 'true'

# Output file
OUTPUT_FILE = os.getenv('HEATMAP_OUTPUT', 'data/heatmap.json')

print(f"\nConfiguration:")
print(f"  Grid resolution: {GRID_RESOLUTION}° (~{GRID_RESOLUTION * 111:.1f} km per cell)")
print(f"  Time step: {TIME_STEP_MINUTES} minutes")
print(f"  Weight by formation candidates: {WEIGHT_BY_FORMATION}")
print(f"  Output file: {OUTPUT_FILE}")

# Connect to MongoDB
print(f"\nConnecting to MongoDB...")
try:
    if 'localhost' in MONGO_URI or '127.0.0.1' in MONGO_URI:
        client = MongoClient(
            MONGO_URI, 
            serverSelectionTimeoutMS=3000,
            maxPoolSize=50,
            minPoolSize=10
        )
        connection_type = "local MongoDB"
    else:
        client = MongoClient(
            MONGO_URI, 
            serverSelectionTimeoutMS=10000,
            maxPoolSize=50,
            minPoolSize=10
        )
        connection_type = "MongoDB Atlas"
    
    client.admin.command('ping')
    print(f"✓ Connected to {connection_type}")
    
    db = client[DB_NAME]
    nodes_collection = db[NODES_COLLECTION]
    edges_collection = db[EDGES_COLLECTION]
    
    # Check if collections exist
    node_count = nodes_collection.count_documents({})
    if node_count == 0:
        print("\n✗ ERROR: No nodes found in flight_nodes collection!")
        print("  Please run load_mongodb.py first to load flight nodes.")
        sys.exit(1)
    
    print(f"✓ Found {node_count:,} flight nodes")
    
    if WEIGHT_BY_FORMATION:
        edge_count = edges_collection.count_documents({})
        if edge_count == 0:
            print(f"\n⚠ WARNING: No formation edges found (found {edge_count:,} edges)")
            print("  Formation weighting will be skipped.")
            print("  Run generate_formation_edges.py first to generate edges.")
            WEIGHT_BY_FORMATION = False
        else:
            print(f"✓ Found {edge_count:,} formation edges for weighting")
    
except Exception as e:
    print(f"\n✗ ERROR: Failed to connect to MongoDB: {e}")
    sys.exit(1)


def get_grid_cell(lat, lon, resolution):
    """Convert lat/lon to grid cell indices."""
    # Round to nearest grid cell
    cell_lat = round(lat / resolution) * resolution
    cell_lon = round(lon / resolution) * resolution
    return (cell_lat, cell_lon)


def get_time_bucket(timestamp, step_minutes):
    """Convert timestamp to time bucket."""
    if isinstance(timestamp, str):
        timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    
    # Round down to nearest time step
    minutes = timestamp.hour * 60 + timestamp.minute
    bucket_minutes = (minutes // step_minutes) * step_minutes
    
    bucket_hour = bucket_minutes // 60
    bucket_min = bucket_minutes % 60
    
    # Return as time string for grouping
    return f"{bucket_hour:02d}:{bucket_min:02d}"


def load_formation_edges_by_cell(edges_collection, nodes_collection, time_step_minutes, grid_resolution):
    """Load formation edges and map them to grid cells by looking up node locations."""
    if not WEIGHT_BY_FORMATION:
        return defaultdict(int)
    
    print("\nLoading nodes for formation edge lookup...")
    
    # First, load all nodes and create a lookup dictionary
    # Key: (flight_id, timestamp) -> (lat, lon)
    # Use string keys for timestamp to avoid datetime comparison issues
    node_lookup = {}
    
    nodes_cursor = nodes_collection.find({}, {'flight_id': 1, 'timestamp': 1, 'lat': 1, 'lon': 1})
    total_nodes = nodes_collection.count_documents({})
    
    if HAS_TQDM:
        nodes_cursor = tqdm(nodes_cursor, total=total_nodes, desc="Loading nodes")
    
    nodes_loaded = 0
    for node in nodes_cursor:
        flight_id = node.get('flight_id')
        timestamp = node.get('timestamp')
        lat = node.get('lat')
        lon = node.get('lon')
        
        if flight_id is not None and timestamp is not None and lat is not None and lon is not None:
            # Normalize timestamp to datetime for consistent lookup
            if isinstance(timestamp, str):
                try:
                    timestamp_dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                except:
                    continue
            elif isinstance(timestamp, datetime):
                timestamp_dt = timestamp
            else:
                continue
            
            # Round to seconds for matching (MongoDB timestamps might have microseconds that don't match exactly)
            timestamp_key = timestamp_dt.replace(microsecond=0)
            
            # Store in lookup dictionary (rounded timestamp is more reliable for matching)
            node_lookup[(flight_id, timestamp_key)] = (lat, lon)
            nodes_loaded += 1
    
    print(f"✓ Loaded {nodes_loaded:,} nodes for lookup")
    
    print("\nLoading formation edges for weighting...")
    
    # Dictionary: (time_bucket, cell_lat, cell_lon) -> count
    edge_counts = defaultdict(int)
    
    # Query all edges
    edges_cursor = edges_collection.find({})
    total_edges = edges_collection.count_documents({})
    
    if HAS_TQDM:
        edges_cursor = tqdm(edges_cursor, total=total_edges, desc="Processing edges")
    
    edges_processed = 0
    edges_mapped = 0
    
    for edge in edges_cursor:
        edges_processed += 1
        
        # Get flight IDs and timestamps
        flight1_id = edge.get('flight1_id')
        flight2_id = edge.get('flight2_id')
        timestamp1 = edge.get('timestamp1')
        timestamp2 = edge.get('timestamp2')
        
        if not all([flight1_id is not None, flight2_id is not None, timestamp1, timestamp2]):
            continue
        
        # Normalize timestamps to datetime for lookup
        if isinstance(timestamp1, str):
            try:
                timestamp1_dt = datetime.fromisoformat(timestamp1.replace('Z', '+00:00'))
            except:
                continue
        elif isinstance(timestamp1, datetime):
            timestamp1_dt = timestamp1
        else:
            continue
        
        if isinstance(timestamp2, str):
            try:
                timestamp2_dt = datetime.fromisoformat(timestamp2.replace('Z', '+00:00'))
            except:
                continue
        elif isinstance(timestamp2, datetime):
            timestamp2_dt = timestamp2
        else:
            continue
        
        # Round timestamps to seconds for lookup (matches how we stored nodes)
        timestamp1_key = timestamp1_dt.replace(microsecond=0)
        timestamp2_key = timestamp2_dt.replace(microsecond=0)
        
        # Look up node locations from our dictionary
        node1_loc = node_lookup.get((flight1_id, timestamp1_key))
        node2_loc = node_lookup.get((flight2_id, timestamp2_key))
        
        if node1_loc and node2_loc:
            lat1, lon1 = node1_loc
            lat2, lon2 = node2_loc
            
            # Get grid cells for both nodes
            cell1_lat, cell1_lon = get_grid_cell(lat1, lon1, grid_resolution)
            cell2_lat, cell2_lon = get_grid_cell(lat2, lon2, grid_resolution)
            
            # Get time buckets
            time_bucket1 = get_time_bucket(timestamp1_dt, time_step_minutes)
            time_bucket2 = get_time_bucket(timestamp2_dt, time_step_minutes)
            
            # Count edge in both cells (both nodes contribute to formation)
            edge_counts[(time_bucket1, cell1_lat, cell1_lon)] += 1
            edge_counts[(time_bucket2, cell2_lat, cell2_lon)] += 1
            edges_mapped += 1
    
    print(f"✓ Processed {edges_processed:,} formation edges")
    print(f"✓ Mapped {edges_mapped:,} edges to grid cells ({edges_mapped*2:,} cell counts)")
    return edge_counts


def compute_heatmap():
    """Compute heatmap by aggregating nodes into grid cells per time step."""
    print("\nComputing heatmap...")
    print("  This may take a few minutes depending on node count...")
    
    # Dictionary structure: (time_bucket, cell_lat, cell_lon) -> {
    #     'flight_count': int,
    #     'node_count': int,
    #     'formation_count': int (if weighted)
    # }
    heatmap_data = defaultdict(lambda: {
        'flight_count': 0,
        'node_count': 0,
        'formation_count': 0,
        'cell_lat': None,
        'cell_lon': None
    })
    
    # Track unique flights per cell to avoid double-counting
    flights_per_cell = defaultdict(set)
    
    # Load formation edge counts by cell (if weighting enabled)
    # This maps edges to grid cells by looking up node locations
    edge_counts_by_cell = {}
    if WEIGHT_BY_FORMATION:
        edge_counts_by_cell = load_formation_edges_by_cell(
            edges_collection, nodes_collection, TIME_STEP_MINUTES, GRID_RESOLUTION
        )
    
    # Process all nodes
    print("\nProcessing flight nodes...")
    nodes_cursor = nodes_collection.find({})
    total_nodes = nodes_collection.count_documents({})
    
    if HAS_TQDM:
        nodes_cursor = tqdm(nodes_cursor, total=total_nodes, desc="Processing nodes")
    
    nodes_processed = 0
    for node in nodes_cursor:
        nodes_processed += 1
        
        lat = node.get('lat')
        lon = node.get('lon')
        timestamp = node.get('timestamp')
        flight_id = node.get('flight_id')
        
        if lat is None or lon is None or timestamp is None:
            continue
        
        # Convert timestamp if needed
        if isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        
        # Get grid cell
        cell_lat, cell_lon = get_grid_cell(lat, lon, GRID_RESOLUTION)
        
        # Get time bucket
        time_bucket = get_time_bucket(timestamp, TIME_STEP_MINUTES)
        
        # Create key for this cell and time
        key = (time_bucket, cell_lat, cell_lon)
        
        # Update heatmap data
        heatmap_data[key]['node_count'] += 1
        heatmap_data[key]['cell_lat'] = cell_lat
        heatmap_data[key]['cell_lon'] = cell_lon
        
        # Track unique flights (avoid counting same flight multiple times in same cell)
        if flight_id not in flights_per_cell[key]:
            heatmap_data[key]['flight_count'] += 1
            flights_per_cell[key].add(flight_id)
        
        # Weight by formation edges if enabled
        # Count formation edges that involve nodes in this cell
        if WEIGHT_BY_FORMATION and key in edge_counts_by_cell:
            heatmap_data[key]['formation_count'] = edge_counts_by_cell[key]
    
    print(f"\n✓ Processed {nodes_processed:,} nodes")
    print(f"✓ Generated {len(heatmap_data):,} grid cells")
    
    # Formation counts are already mapped to cells, no normalization needed
    if WEIGHT_BY_FORMATION:
        cells_with_formation = sum(1 for data in heatmap_data.values() if data['formation_count'] > 0)
        print(f"✓ {cells_with_formation:,} cells have formation edges")
    
    return heatmap_data


def output_heatmap_json(heatmap_data, output_file):
    """Output heatmap data in JSON format for Mapbox."""
    print(f"\nOutputting heatmap to {output_file}...")
    
    # Convert to list format for JSON output
    heatmap_list = []
    
    for (time_bucket, cell_lat, cell_lon), data in heatmap_data.items():
        item = {
            'time_bucket': time_bucket,
            'lat': cell_lat,
            'lon': cell_lon,
            'flight_count': data['flight_count'],
            'node_count': data['node_count'],
            'intensity': data['flight_count']  # Primary intensity metric
        }
        
        if WEIGHT_BY_FORMATION:
            item['formation_count'] = data['formation_count']
            # Combined intensity: flights + formation weight
            item['weighted_intensity'] = data['flight_count'] + data['formation_count'] * 0.5
        
        heatmap_list.append(item)
    
    # Sort by time bucket, then by lat/lon for easier processing
    heatmap_list.sort(key=lambda x: (x['time_bucket'], x['lat'], x['lon']))
    
    # Create output structure
    output_data = {
        'metadata': {
            'grid_resolution_degrees': GRID_RESOLUTION,
            'grid_resolution_km': round(GRID_RESOLUTION * 111, 2),
            'time_step_minutes': TIME_STEP_MINUTES,
            'weight_by_formation': WEIGHT_BY_FORMATION,
            'total_cells': len(heatmap_list),
            'time_buckets': sorted(set(item['time_bucket'] for item in heatmap_list)),
            'generated_at': datetime.now().isoformat()
        },
        'data': heatmap_list
    }
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_file) if os.path.dirname(output_file) else '.', exist_ok=True)
    
    # Write to file
    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"✓ Saved {len(heatmap_list):,} grid cells to {output_file}")
    
    # Print statistics
    if heatmap_list:
        max_intensity = max(item['intensity'] for item in heatmap_list)
        total_flights = sum(item['flight_count'] for item in heatmap_list)
        
        print(f"\nHeatmap Statistics:")
        print(f"  Total grid cells: {len(heatmap_list):,}")
        print(f"  Time buckets: {len(output_data['metadata']['time_buckets'])}")
        print(f"  Max flights per cell: {max_intensity}")
        print(f"  Total flight count (sum): {total_flights:,}")
        
        if WEIGHT_BY_FORMATION:
            max_weighted = max(item.get('weighted_intensity', 0) for item in heatmap_list)
            print(f"  Max weighted intensity: {max_weighted:.1f}")


def output_heatmap_geojson(heatmap_data, output_file):
    """Output heatmap data in GeoJSON format for Mapbox."""
    geojson_file = output_file.replace('.json', '.geojson')
    print(f"\nOutputting GeoJSON to {geojson_file}...")
    
    features = []
    
    for (time_bucket, cell_lat, cell_lon), data in heatmap_data.items():
        feature = {
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [cell_lon, cell_lat]  # GeoJSON: [lon, lat]
            },
            'properties': {
                'time_bucket': time_bucket,
                'flight_count': data['flight_count'],
                'node_count': data['node_count'],
                'intensity': data['flight_count']
            }
        }
        
        if WEIGHT_BY_FORMATION:
            feature['properties']['formation_count'] = data['formation_count']
            feature['properties']['weighted_intensity'] = data['flight_count'] + data['formation_count'] * 0.5
        
        features.append(feature)
    
    geojson = {
        'type': 'FeatureCollection',
        'metadata': {
            'grid_resolution_degrees': GRID_RESOLUTION,
            'time_step_minutes': TIME_STEP_MINUTES,
            'weight_by_formation': WEIGHT_BY_FORMATION,
            'generated_at': datetime.now().isoformat()
        },
        'features': features
    }
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(geojson_file) if os.path.dirname(geojson_file) else '.', exist_ok=True)
    
    with open(geojson_file, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    print(f"✓ Saved {len(features):,} features to {geojson_file}")


# Main execution
if __name__ == '__main__':
    try:
        # Compute heatmap
        heatmap_data = compute_heatmap()
        
        if not heatmap_data:
            print("\n✗ ERROR: No heatmap data generated!")
            sys.exit(1)
        
        # Output JSON format
        output_heatmap_json(heatmap_data, OUTPUT_FILE)
        
        # Also output GeoJSON format
        output_heatmap_geojson(heatmap_data, OUTPUT_FILE)
        
        print("\n" + "="*60)
        print("✓ Heatmap computation complete!")
        print("="*60)
        print(f"\nOutput files:")
        print(f"  • {OUTPUT_FILE} (JSON format)")
        print(f"  • {OUTPUT_FILE.replace('.json', '.geojson')} (GeoJSON format)")
        print(f"\nYou can now use these files with Mapbox for visualization.")
        
    except KeyboardInterrupt:
        print("\n\n⚠ Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        client.close()

