import pandas as pd
import pymongo
from pymongo import MongoClient, GEOSPHERE
from datetime import datetime
import os
import sys
import time

# Try to import tqdm for progress bar, but make it optional
try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False
    # Simple progress replacement
    def tqdm(iterable, **kwargs):
        return iterable

print("="*60)
print("STEP 4: Store Nodes in MongoDB")
print("="*60)

# Get MongoDB connection string from environment variable or config
MONGO_URI = os.getenv('MONGODB_URI', os.getenv('MONGO_ATLAS_URI'))

# Try to load from .env file if it exists
if not MONGO_URI:
    try:
        from dotenv import load_dotenv
        load_dotenv()
        MONGO_URI = os.getenv('MONGODB_URI', os.getenv('MONGO_ATLAS_URI'))
    except ImportError:
        pass

# If still not found, default to local MongoDB
if not MONGO_URI:
    # Default to local MongoDB
    MONGO_URI = 'mongodb://localhost:27017/'
    print("\nMongoDB connection string not found in environment variables.")
    print(f"✓ Defaulting to local MongoDB: {MONGO_URI}")
    print("  (To use MongoDB Atlas, set MONGODB_URI environment variable)")
else:
    # Connection string was provided via environment variable
    if 'localhost' in MONGO_URI or '127.0.0.1' in MONGO_URI:
        print(f"✓ Using local MongoDB: {MONGO_URI}")
    else:
        print(f"✓ Using MongoDB Atlas connection")

# Database and collection names
# Note: If database name is in the connection string path, MongoClient will use it
# Otherwise, we'll use the default or environment variable
DB_NAME = os.getenv('MONGODB_DB_NAME', 'flights')
COLLECTION_NAME = 'flight_nodes'

# Try to extract database name from connection string if present
if MONGO_URI and '/' in MONGO_URI.split('?')[0]:
    uri_without_params = MONGO_URI.split('?')[0]
    uri_parts = uri_without_params.split('/')
    if len(uri_parts) > 3 and uri_parts[-1]:  # mongodb+srv://user:pass@host/dbname
        db_from_uri = uri_parts[-1]
        if db_from_uri and not db_from_uri.startswith('@'):
            DB_NAME = db_from_uri
            print(f"✓ Database name from connection string: {DB_NAME}")

print(f"\nConnecting to MongoDB...")
if 'localhost' in MONGO_URI or '127.0.0.1' in MONGO_URI:
    print(f"  Local MongoDB: {MONGO_URI}")
else:
    print(f"  MongoDB Atlas")
print(f"Database: {DB_NAME}")
print(f"Collection: {COLLECTION_NAME}")

try:
    # Connect to MongoDB (local or Atlas)
    # Increase timeout for local connections, use default for Atlas
    if 'localhost' in MONGO_URI or '127.0.0.1' in MONGO_URI:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        connection_type = "local MongoDB"
    else:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        connection_type = "MongoDB Atlas"
    
    # Test connection
    client.admin.command('ping')
    print(f"✓ Successfully connected to {connection_type}")
    
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
    
    # Check if collection exists and has data
    existing_count = collection.count_documents({})
    if existing_count > 0:
        response = input(f"\nCollection '{COLLECTION_NAME}' already has {existing_count:,} documents. Clear it? (y/n): ")
        if response.lower() == 'y':
            print("Clearing existing collection...")
            collection.delete_many({})
            print("✓ Collection cleared")
        else:
            print("Keeping existing documents. New documents will be appended.")
    
except Exception as e:
    print(f"\n✗ Error connecting to MongoDB: {e}")
    sys.exit(1)

# Load flight nodes CSV
print("\nLoading flight nodes from CSV...")
nodes_file = 'data/flight_nodes.csv'

if not os.path.exists(nodes_file):
    print(f"✗ Error: File not found: {nodes_file}")
    print("Please run STEP 3 first to generate flight_nodes.csv")
    sys.exit(1)

# Get total number of rows for progress tracking
print("Counting total rows...")
total_rows = sum(1 for _ in open(nodes_file)) - 1  # Subtract header
print(f"Total nodes to insert: {total_rows:,}")

# Insert documents in batches
BATCH_SIZE = 10000  # Process 10,000 documents at a time
CHUNK_SIZE = 50000  # Read 50,000 rows from CSV at a time for processing

print(f"\nInserting documents in batches of {BATCH_SIZE:,}...")
print("This may take a while for large datasets...")

total_inserted = 0
batch_count = 0
start_time = time.time()

try:
    # Use pandas to read CSV in chunks
    chunk_iterator = pd.read_csv(
        nodes_file,
        chunksize=CHUNK_SIZE,
        dtype={
            'flight_id': 'int64',
            'lat': 'float64',
            'lon': 'float64',
            'time_index': 'int64',
            'carrier': 'str',
            'tailnum': 'object',  # Can be None
            'origin': 'str',
            'dest': 'str'
        },
        parse_dates=['timestamp']
    )
    
    current_batch = []
    total_chunks = (total_rows // CHUNK_SIZE + 1)
    
    if HAS_TQDM:
        chunk_iterator = tqdm(chunk_iterator, total=total_chunks, desc="Processing chunks")
    
    chunk_num = 0
    for chunk in chunk_iterator:
        chunk_num += 1
        if not HAS_TQDM and chunk_num % 10 == 0:
            print(f"  Processing chunk {chunk_num}/{total_chunks}... ({total_inserted:,} docs inserted so far)")
        # Convert chunk to list of documents
        for _, row in chunk.iterrows():
            # Create MongoDB document
            # For 2dsphere index, we need GeoJSON format: {type: "Point", coordinates: [lon, lat]}
            doc = {
                'flight_id': int(row['flight_id']),
                'timestamp': row['timestamp'],
                'location': {
                    'type': 'Point',
                    'coordinates': [float(row['lon']), float(row['lat'])]  # GeoJSON: [longitude, latitude]
                },
                'lat': float(row['lat']),  # Keep separate for easier querying if needed
                'lon': float(row['lon']),
                'time_index': int(row['time_index']),
                'carrier': str(row['carrier']),
                'tailnum': str(row['tailnum']) if pd.notna(row['tailnum']) else None,
                'origin': str(row['origin']),
                'dest': str(row['dest'])
            }
            
            current_batch.append(doc)
            
            # Insert batch when it reaches BATCH_SIZE
            if len(current_batch) >= BATCH_SIZE:
                try:
                    collection.insert_many(current_batch, ordered=False)
                    total_inserted += len(current_batch)
                    batch_count += 1
                    
                    if batch_count % 10 == 0:
                        elapsed = time.time() - start_time
                        rate = total_inserted / elapsed if elapsed > 0 else 0
                        remaining = (total_rows - total_inserted) / rate if rate > 0 else 0
                        print(f"  Inserted {total_inserted:,}/{total_rows:,} documents "
                              f"({rate:.0f} docs/sec, ~{remaining/60:.1f} min remaining)")
                    
                    current_batch = []
                except Exception as e:
                    print(f"\nWarning: Error inserting batch: {e}")
                    print(f"Continuing with next batch...")
                    current_batch = []
                    continue
    
    # Insert remaining documents in the last batch
    if current_batch:
        try:
            collection.insert_many(current_batch, ordered=False)
            total_inserted += len(current_batch)
            print(f"\nInserted final batch of {len(current_batch):,} documents")
        except Exception as e:
            print(f"\nWarning: Error inserting final batch: {e}")
    
    elapsed_time = time.time() - start_time
    
    print(f"\n✓ Document insertion complete!")
    print(f"  Total documents inserted: {total_inserted:,}")
    print(f"  Time elapsed: {elapsed_time/60:.2f} minutes")
    print(f"  Insertion rate: {total_inserted/elapsed_time:.0f} documents/second")
    
except Exception as e:
    print(f"\n✗ Error during insertion: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Verify insertion
print("\nVerifying insertion...")
final_count = collection.count_documents({})
print(f"Total documents in collection: {final_count:,}")

if final_count != total_inserted:
    print(f"⚠ Warning: Expected {total_inserted:,} documents but found {final_count:,}")

# Create indexes
print("\n" + "="*60)
print("Creating indexes...")
print("="*60)

try:
    # 1. Create 2dsphere index on location field for geospatial queries
    print("\nCreating 2dsphere index on 'location' field...")
    collection.create_index([('location', GEOSPHERE)])
    print("✓ 2dsphere index created on location")
    
    # 2. Create index on timestamp for time filtering
    print("\nCreating index on 'timestamp' field...")
    collection.create_index([('timestamp', 1)])
    print("✓ Index created on timestamp")
    
    # 3. Create compound index on timestamp + carrier (common query pattern)
    print("\nCreating compound index on timestamp + carrier...")
    collection.create_index([('timestamp', 1), ('carrier', 1)])
    print("✓ Compound index created on timestamp + carrier")
    
    # 4. Create index on flight_id for flight-specific queries
    print("\nCreating index on 'flight_id' field...")
    collection.create_index([('flight_id', 1)])
    print("✓ Index created on flight_id")
    
    # 5. Create compound index on origin + dest + timestamp (route queries)
    print("\nCreating compound index on origin + dest + timestamp...")
    collection.create_index([('origin', 1), ('dest', 1), ('timestamp', 1)])
    print("✓ Compound index created on origin + dest + timestamp")
    
    print("\n" + "="*60)
    print("Index Creation Complete!")
    print("="*60)
    
    # List all indexes
    print("\nCurrent indexes on collection:")
    indexes = collection.list_indexes()
    for idx in indexes:
        idx_info = dict(idx)
        print(f"  - {idx_info.get('name', 'unnamed')}: {idx_info.get('key', {})}")
    
except Exception as e:
    print(f"\n✗ Error creating indexes: {e}")
    import traceback
    traceback.print_exc()

# Test queries
print("\n" + "="*60)
print("Testing queries...")
print("="*60)

try:
    # Test 1: Count documents
    count = collection.count_documents({})
    print(f"\n1. Total documents: {count:,}")
    
    # Test 2: Time range query
    start_time_test = datetime(2013, 1, 1, 5, 0, 0)
    end_time_test = datetime(2013, 1, 1, 6, 0, 0)
    count_time = collection.count_documents({
        'timestamp': {'$gte': start_time_test, '$lt': end_time_test}
    })
    print(f"2. Documents between {start_time_test} and {end_time_test}: {count_time:,}")
    
    # Test 3: Geospatial query - find documents near a point (within 100km of NYC)
    nyc_lat = 40.7128
    nyc_lon = -74.0060
    count_geo = collection.count_documents({
        'location': {
            '$near': {
                '$geometry': {
                    'type': 'Point',
                    'coordinates': [nyc_lon, nyc_lat]
                },
                '$maxDistance': 100000  # 100km in meters
            }
        }
    })
    print(f"3. Documents within 100km of NYC ({nyc_lat}, {nyc_lon}): {count_geo:,}")
    
    # Test 4: Carrier query
    carrier_count = collection.count_documents({'carrier': 'UA'})
    print(f"4. Documents with carrier 'UA': {carrier_count:,}")
    
    # Test 5: Sample document
    sample = collection.find_one()
    if sample:
        print(f"\n5. Sample document:")
        print(f"   Flight ID: {sample.get('flight_id')}")
        print(f"   Timestamp: {sample.get('timestamp')}")
        print(f"   Location: {sample.get('location', {}).get('coordinates', [])}")
        print(f"   Carrier: {sample.get('carrier')}")
        print(f"   Route: {sample.get('origin')} -> {sample.get('dest')}")
    
    print("\n✓ All test queries successful!")
    
except Exception as e:
    print(f"\n✗ Error during test queries: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*60)
print("STEP 4 Complete!")
print("="*60)
print(f"\nCollection '{COLLECTION_NAME}' in database '{DB_NAME}' is ready for queries.")
print("\nExample geospatial query:")
print("  collection.find({")
print("    'location': {")
print("      '$near': {")
print("        '$geometry': {'type': 'Point', 'coordinates': [lon, lat]},")
print("        '$maxDistance': 50000  # 50km in meters")
print("      }")
print("    }")
print("  })")

client.close()
print("\nConnection closed.")

