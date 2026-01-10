import pymongo
from pymongo import MongoClient
from datetime import datetime, timedelta
import os
import sys
import math
import time
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
print("STEP 5: Generate Candidate Formation Edges")
print("="*60)

# Configuration
MONGO_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/')
DB_NAME = os.getenv('MONGODB_DB_NAME', 'flights')
NODES_COLLECTION = 'flight_nodes'
EDGES_COLLECTION = 'formation_edges'  # Where to store edges

# Formation detection parameters
MAX_DISTANCE_KM = 50  # Maximum distance in kilometers
MAX_TIME_DIFF_MINUTES = 10  # Maximum time difference in minutes (±10 min)
MAX_CANDIDATES_PER_NODE = 100  # Limit candidates per node to avoid processing too many
COMPUTE_HEADING = True  # Whether to compute heading similarity

# Optional: Limit number of nodes to process (for testing)
# Set to None to process all nodes
MAX_NODES_TO_PROCESS = os.getenv('MAX_NODES_TO_PROCESS')
if MAX_NODES_TO_PROCESS:
    MAX_NODES_TO_PROCESS = int(MAX_NODES_TO_PROCESS)
else:
    MAX_NODES_TO_PROCESS = None

print(f"\nConfiguration:")
print(f"  Max distance: {MAX_DISTANCE_KM} km")
print(f"  Max time difference: ±{MAX_TIME_DIFF_MINUTES} minutes")
print(f"  Max candidates per node: {MAX_CANDIDATES_PER_NODE}")
print(f"  Compute heading similarity: {COMPUTE_HEADING}")
if MAX_NODES_TO_PROCESS:
    print(f"  ⚠ LIMIT: Processing only first {MAX_NODES_TO_PROCESS:,} nodes (TEST MODE)")
else:
    print(f"  Processing all nodes")

# Connect to MongoDB
print(f"\nConnecting to MongoDB...")
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    client.admin.command('ping')
    print(f"✓ Connected to MongoDB")
    
    db = client[DB_NAME]
    nodes_collection = db[NODES_COLLECTION]
    edges_collection = db[EDGES_COLLECTION]
    
    # Check if nodes collection exists
    node_count = nodes_collection.count_documents({})
    if node_count == 0:
        print(f"\n✗ Error: Collection '{NODES_COLLECTION}' is empty or doesn't exist.")
        print("Please run STEP 4 (load_mongodb.py) first to load flight nodes.")
        sys.exit(1)
    
    print(f"  Found {node_count:,} nodes in collection '{NODES_COLLECTION}'")
    
except Exception as e:
    print(f"\n✗ Error connecting to MongoDB: {e}")
    sys.exit(1)

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points on Earth (in km).
    Uses Haversine formula.
    """
    R = 6371  # Earth radius in kilometers
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = (math.sin(delta_phi / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

def calculate_heading(lat1, lon1, lat2, lon2):
    """
    Calculate the initial bearing (heading) from point 1 to point 2 in degrees.
    Returns heading in degrees (0-360), where 0 is North.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)
    
    y = math.sin(delta_lambda) * math.cos(phi2)
    x = (math.cos(phi1) * math.sin(phi2) -
         math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda))
    
    theta = math.atan2(y, x)
    heading = math.degrees(theta)
    
    # Normalize to 0-360
    return (heading + 360) % 360

def heading_similarity(heading1, heading2):
    """
    Calculate similarity between two headings (0-1, where 1 is identical).
    Takes into account circular nature of headings (360° = 0°).
    """
    if heading1 is None or heading2 is None:
        return 0.0
    
    diff = abs(heading1 - heading2)
    if diff > 180:
        diff = 360 - diff
    
    # Convert to similarity (0-1 scale)
    # Same heading = 1.0, opposite (180°) = 0.0
    similarity = 1.0 - (diff / 180.0)
    return max(0.0, similarity)

def compute_feasibility_score(node1, node2, distance_km, time_diff_seconds, heading_sim=None):
    """
    Compute a feasibility score (0-1) for formation between two nodes.
    
    Factors:
    - Distance (closer = better)
    - Time difference (closer in time = better)
    - Heading similarity (optional, similar = better)
    """
    # Distance score (0-1): closer is better
    max_dist = MAX_DISTANCE_KM * 1000  # Convert to meters for calculation
    distance_m = distance_km * 1000
    distance_score = max(0.0, 1.0 - (distance_m / max_dist))
    
    # Time score (0-1): closer in time is better
    max_time_sec = MAX_TIME_DIFF_MINUTES * 60
    time_score = max(0.0, 1.0 - (abs(time_diff_seconds) / max_time_sec))
    
    # Combined base score
    if heading_sim is not None and COMPUTE_HEADING:
        # Weighted average: distance (40%), time (40%), heading (20%)
        score = (0.4 * distance_score + 0.4 * time_score + 0.2 * heading_sim)
    else:
        # Weighted average: distance (50%), time (50%)
        score = (0.5 * distance_score + 0.5 * time_score)
    
    return score

def get_flight_trajectory_info(collection, flight_id, timestamp):
    """
    Get previous and next nodes for the same flight to calculate heading.
    Returns (prev_node, next_node) or (None, None) if not available.
    """
    # Get previous node
    prev_node = collection.find_one(
        {
            'flight_id': flight_id,
            'timestamp': {'$lt': timestamp}
        },
        sort=[('timestamp', -1)]  # Most recent before current
    )
    
    # Get next node
    next_node = collection.find_one(
        {
            'flight_id': flight_id,
            'timestamp': {'$gt': timestamp}
        },
        sort=[('timestamp', 1)]  # Earliest after current
    )
    
    return prev_node, next_node

def calculate_node_heading(collection, node):
    """
    Calculate the heading of a flight at a given node based on trajectory.
    """
    flight_id = node['flight_id']
    timestamp = node['timestamp']
    lat = node['lat']
    lon = node['lon']
    
    prev_node, next_node = get_flight_trajectory_info(collection, flight_id, timestamp)
    
    # Use next node if available, otherwise previous node
    if next_node:
        return calculate_heading(lat, lon, next_node['lat'], next_node['lon'])
    elif prev_node:
        return calculate_heading(prev_node['lat'], prev_node['lon'], lat, lon)
    else:
        return None

# Generate formation edges
print(f"\nGenerating candidate formation edges...")
print("This may take a while for large datasets...")

# Check if edges collection already exists
existing_edges = edges_collection.count_documents({})
if existing_edges > 0:
    response = input(f"\nCollection '{EDGES_COLLECTION}' already has {existing_edges:,} edges. Clear it? (y/n): ")
    if response.lower() == 'y':
        print("Clearing existing edges...")
        edges_collection.delete_many({})
        print("✓ Collection cleared")

# Get all unique timestamps to process in time windows
print("\nAnalyzing time distribution...")
pipeline = [
    {'$group': {'_id': None, 'min_time': {'$min': '$timestamp'}, 'max_time': {'$max': '$timestamp'}}}
]
time_range = list(nodes_collection.aggregate(pipeline))
if time_range:
    min_time = time_range[0]['min_time']
    max_time = time_range[0]['max_time']
    print(f"  Time range: {min_time} to {max_time}")
else:
    print("  Could not determine time range")
    sys.exit(1)

# Process nodes in time windows to optimize queries
# Group nodes into time windows of MAX_TIME_DIFF_MINUTES
time_window_minutes = MAX_TIME_DIFF_MINUTES * 2  # Overlapping windows
time_step = timedelta(minutes=MAX_TIME_DIFF_MINUTES)

edges_generated = 0
edges_stored = 0
batch_edges = []
batch_size = 1000
processed_nodes = 0

start_time = time.time()

# Strategy: Iterate through nodes and for each, find nearby nodes using geospatial query
print("\nProcessing nodes to find formation candidates...")

# Get cursor for all nodes (or limited subset for testing)
if MAX_NODES_TO_PROCESS:
    nodes_cursor = nodes_collection.find().sort([('timestamp', 1), ('flight_id', 1)]).limit(MAX_NODES_TO_PROCESS)
    total_nodes = min(MAX_NODES_TO_PROCESS, nodes_collection.count_documents({}))
else:
    nodes_cursor = nodes_collection.find().sort([('timestamp', 1), ('flight_id', 1)])
    total_nodes = nodes_collection.count_documents({})

if HAS_TQDM:
    nodes_cursor = tqdm(nodes_cursor, total=total_nodes, desc="Processing nodes")

current_time_window = None
window_nodes = []  # Cache nodes in current time window

for node in nodes_cursor:
    processed_nodes += 1
    
    # Extract node data
    node_id = node.get('_id')
    node_lat = node['lat']
    node_lon = node['lon']
    node_timestamp = node['timestamp']
    node_flight_id = node['flight_id']
    
    # Convert timestamp if it's a string
    if isinstance(node_timestamp, str):
        node_timestamp = datetime.fromisoformat(node_timestamp.replace('Z', '+00:00'))
    
    # Calculate heading for this node if enabled
    node_heading = None
    if COMPUTE_HEADING:
        node_heading = calculate_node_heading(nodes_collection, node)
    
    # Use geospatial query to find nearby nodes
    # Query for nodes within MAX_DISTANCE_KM (convert to meters for $near)
    max_distance_m = MAX_DISTANCE_KM * 1000
    
    # Time window for filtering
    time_window_start = node_timestamp - timedelta(minutes=MAX_TIME_DIFF_MINUTES)
    time_window_end = node_timestamp + timedelta(minutes=MAX_TIME_DIFF_MINUTES)
    
    nearby_nodes = nodes_collection.find({
        'location': {
            '$near': {
                '$geometry': {
                    'type': 'Point',
                    'coordinates': [node_lon, node_lat]
                },
                '$maxDistance': max_distance_m
            }
        },
        'flight_id': {'$ne': node_flight_id},  # Exclude same flight
        'timestamp': {
            '$gte': time_window_start,
            '$lte': time_window_end
        }
    }).limit(MAX_CANDIDATES_PER_NODE)  # Limit candidates to avoid processing too many
    
        # Process each nearby node
    for candidate in nearby_nodes:
        candidate_id = candidate.get('_id')
        candidate_lat = candidate['lat']
        candidate_lon = candidate['lon']
        candidate_timestamp = candidate['timestamp']
        candidate_flight_id = candidate['flight_id']
        
        # Skip if we've already processed this pair (avoid duplicates)
        # Only process when node_flight_id < candidate_flight_id to process each pair once
        if node_flight_id >= candidate_flight_id:
            # If flight IDs are equal (shouldn't happen due to filter), skip
            if node_flight_id == candidate_flight_id:
                continue
            # If candidate's flight_id is smaller, skip (it will process us when it's the node)
            continue
        
        # Convert timestamp if needed
        if isinstance(candidate_timestamp, str):
            candidate_timestamp = datetime.fromisoformat(candidate_timestamp.replace('Z', '+00:00'))
        
        # Calculate distance
        distance_km = haversine_distance(node_lat, node_lon, candidate_lat, candidate_lon)
        
        # Calculate time difference
        time_diff = (candidate_timestamp - node_timestamp).total_seconds()
        
        # Filter by distance and time (geospatial query may have slight inaccuracies)
        if distance_km > MAX_DISTANCE_KM:
            continue
        if abs(time_diff) > MAX_TIME_DIFF_MINUTES * 60:
            continue
        
        # Calculate heading for candidate if enabled
        candidate_heading = None
        heading_sim = None
        if COMPUTE_HEADING:
            candidate_heading = calculate_node_heading(nodes_collection, candidate)
            if node_heading is not None and candidate_heading is not None:
                heading_sim = heading_similarity(node_heading, candidate_heading)
        
        # Compute feasibility score
        feasibility_score = compute_feasibility_score(
            node, candidate, distance_km, time_diff, heading_sim
        )
        
        # Create edge (we already ensure node_flight_id < candidate_flight_id above)
        flight1 = node_flight_id
        flight2 = candidate_flight_id
        
        # Create edge document
        edge = {
            'node1_id': str(node_id),
            'node2_id': str(candidate_id),
            'flight1_id': flight1,
            'flight2_id': flight2,
            'timestamp1': node_timestamp,
            'timestamp2': candidate_timestamp,
            'time_diff_seconds': time_diff,
            'distance_km': distance_km,
            'feasibility_score': feasibility_score,
            'heading1': node_heading,
            'heading2': candidate_heading,
            'heading_similarity': heading_sim,
            'created_at': datetime.now()
        }
        
        edges_generated += 1
        
        # Store edge in batch
        batch_edges.append(edge)
        
        # Insert batch when full
        if len(batch_edges) >= batch_size:
            try:
                edges_collection.insert_many(batch_edges, ordered=False)
                edges_stored += len(batch_edges)
                batch_edges = []
            except Exception as e:
                print(f"\nWarning: Error inserting batch: {e}")
                batch_edges = []
    
    # Progress update
    if processed_nodes % 1000 == 0:
        elapsed = time.time() - start_time
        rate = processed_nodes / elapsed if elapsed > 0 else 0
        remaining = (total_nodes - processed_nodes) / rate if rate > 0 else 0
        print(f"  Processed {processed_nodes:,}/{total_nodes:,} nodes "
              f"({edges_generated:,} edges found, ~{remaining/60:.1f} min remaining)")

# Insert remaining edges
if batch_edges:
    try:
        edges_collection.insert_many(batch_edges, ordered=False)
        edges_stored += len(batch_edges)
    except Exception as e:
        print(f"\nWarning: Error inserting final batch: {e}")

elapsed_time = time.time() - start_time

print(f"\n✓ Edge generation complete!")
print(f"  Nodes processed: {processed_nodes:,}")
print(f"  Candidate edges generated: {edges_generated:,}")
print(f"  Edges stored in MongoDB: {edges_stored:,}")
print(f"  Time elapsed: {elapsed_time/60:.2f} minutes")
print(f"  Processing rate: {processed_nodes/elapsed_time:.0f} nodes/second")

# Create indexes on edges collection
print("\n" + "="*60)
print("Creating indexes on edges collection...")
print("="*60)

try:
    # Index on flight pairs for fast lookups
    print("\nCreating index on flight1_id + flight2_id...")
    edges_collection.create_index([('flight1_id', 1), ('flight2_id', 1)])
    print("✓ Index created")
    
    # Unique index to prevent duplicate edges (same flight pair, similar timestamps)
    # We allow some tolerance for timestamp differences
    print("\nCreating compound index on flight pairs + timestamps...")
    edges_collection.create_index([
        ('flight1_id', 1),
        ('flight2_id', 1),
        ('timestamp1', 1),
        ('timestamp2', 1)
    ], name='flight_pair_timestamps')
    print("✓ Index created")
    
    # Index on feasibility score for filtering
    print("\nCreating index on feasibility_score...")
    edges_collection.create_index([('feasibility_score', -1)])  # Descending for top scores
    print("✓ Index created")
    
    # Index on distance for filtering
    print("\nCreating index on distance_km...")
    edges_collection.create_index([('distance_km', 1)])
    print("✓ Index created")
    
    # Index on timestamps
    print("\nCreating index on timestamp1 + timestamp2...")
    edges_collection.create_index([('timestamp1', 1), ('timestamp2', 1)])
    print("✓ Index created")
    
    print("\n✓ All indexes created successfully")
    
except Exception as e:
    print(f"\n⚠ Warning: Error creating indexes: {e}")

# Statistics
print("\n" + "="*60)
print("Edge Statistics")
print("="*60)

try:
    total_edges = edges_collection.count_documents({})
    print(f"\nTotal edges in collection: {total_edges:,}")
    
    # Average feasibility score
    pipeline = [
        {'$group': {
            '_id': None,
            'avg_score': {'$avg': '$feasibility_score'},
            'min_score': {'$min': '$feasibility_score'},
            'max_score': {'$max': '$feasibility_score'}
        }}
    ]
    stats = list(edges_collection.aggregate(pipeline))
    if stats:
        print(f"\nFeasibility Score Statistics:")
        print(f"  Average: {stats[0]['avg_score']:.4f}")
        print(f"  Minimum: {stats[0]['min_score']:.4f}")
        print(f"  Maximum: {stats[0]['max_score']:.4f}")
    
    # Average distance
    pipeline = [
        {'$group': {
            '_id': None,
            'avg_distance': {'$avg': '$distance_km'},
            'min_distance': {'$min': '$distance_km'},
            'max_distance': {'$max': '$distance_km'}
        }}
    ]
    stats = list(edges_collection.aggregate(pipeline))
    if stats:
        print(f"\nDistance Statistics:")
        print(f"  Average: {stats[0]['avg_distance']:.2f} km")
        print(f"  Minimum: {stats[0]['min_distance']:.2f} km")
        print(f"  Maximum: {stats[0]['max_distance']:.2f} km")
    
    # Sample edges
    print(f"\nSample edges (top 10 by feasibility score):")
    sample_edges = edges_collection.find().sort([('feasibility_score', -1)]).limit(10)
    for i, edge in enumerate(sample_edges, 1):
        print(f"\n  {i}. Flight {edge['flight1_id']} <-> Flight {edge['flight2_id']}")
        print(f"     Distance: {edge['distance_km']:.2f} km")
        print(f"     Time diff: {edge['time_diff_seconds']:.1f} seconds")
        print(f"     Feasibility score: {edge['feasibility_score']:.4f}")
        if edge.get('heading_similarity') is not None:
            print(f"     Heading similarity: {edge['heading_similarity']:.4f}")
    
except Exception as e:
    print(f"\n⚠ Warning: Error calculating statistics: {e}")

print("\n" + "="*60)
print("STEP 5 Complete!")
print("="*60)
print(f"\nEdges are stored in collection '{EDGES_COLLECTION}' in database '{DB_NAME}'")
print("\nExample query to find high-quality formation candidates:")
print("  edges_collection.find({'feasibility_score': {'$gt': 0.8}})")

client.close()
print("\nConnection closed.")

