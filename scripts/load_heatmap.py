import json
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
print("Load Heatmap Data to MongoDB")
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
    MONGO_URI = 'mongodb://localhost:27017/'
    print("\nMongoDB connection string not found in environment variables.")
    print(f"✓ Defaulting to local MongoDB: {MONGO_URI}")
    print("  (To use MongoDB Atlas, set MONGODB_URI environment variable)")
else:
    if 'localhost' in MONGO_URI or '127.0.0.1' in MONGO_URI:
        print(f"✓ Using local MongoDB: {MONGO_URI}")
    else:
        print(f"✓ Using MongoDB Atlas connection")

# Database and collection names
DB_NAME = os.getenv('MONGODB_DB_NAME', 'flights')
COLLECTION_NAME = 'heatmap'

# Try to extract database name from connection string if present
if MONGO_URI and '/' in MONGO_URI.split('?')[0]:
    uri_without_params = MONGO_URI.split('?')[0]
    uri_parts = uri_without_params.split('/')
    if len(uri_parts) > 3 and uri_parts[-1]:
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
    # Connect to MongoDB
    if 'localhost' in MONGO_URI or '127.0.0.1' in MONGO_URI:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        connection_type = "local MongoDB"
    else:
        client = MongoClient(
            MONGO_URI, 
            serverSelectionTimeoutMS=10000,
            maxPoolSize=50,
            minPoolSize=10
        )
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

# Load heatmap.json
print("\n" + "="*60)
print("Loading heatmap.json...")
print("="*60)

heatmap_json_file = 'data/heatmap.json'

if not os.path.exists(heatmap_json_file):
    print(f"✗ Error: File not found: {heatmap_json_file}")
    sys.exit(1)

print(f"Loading {heatmap_json_file}...")
start_time = time.time()

try:
    with open(heatmap_json_file, 'r') as f:
        heatmap_data = json.load(f)
    
    metadata = heatmap_data.get('metadata', {})
    data_items = heatmap_data.get('data', [])
    
    print(f"✓ Loaded JSON file")
    print(f"  Metadata keys: {list(metadata.keys())}")
    print(f"  Data items: {len(data_items):,}")
    
    # Store metadata as a separate document
    metadata_doc = {
        'type': 'metadata',
        'metadata': metadata,
        'created_at': datetime.utcnow()
    }
    
    # Prepare data documents for batch insert
    BATCH_SIZE = 10000
    data_docs = []
    total_inserted = 0
    
    print(f"\nInserting {len(data_items):,} data items in batches of {BATCH_SIZE:,}...")
    
    for i, item in enumerate(data_items):
        doc = {
            'type': 'data',
            'time_bucket': item.get('time_bucket'),
            'lat': item.get('lat'),
            'lon': item.get('lon'),
            'flight_count': item.get('flight_count'),
            'node_count': item.get('node_count'),
            'intensity': item.get('intensity'),
            'formation_count': item.get('formation_count'),
            'weighted_intensity': item.get('weighted_intensity'),
            # Create GeoJSON Point for geospatial queries
            'location': {
                'type': 'Point',
                'coordinates': [item.get('lon'), item.get('lat')]
            }
        }
        data_docs.append(doc)
        
        # Insert in batches
        if len(data_docs) >= BATCH_SIZE:
            try:
                collection.insert_many(data_docs, ordered=False)
                total_inserted += len(data_docs)
                if total_inserted % 50000 == 0:
                    elapsed = time.time() - start_time
                    rate = total_inserted / elapsed if elapsed > 0 else 0
                    print(f"  Inserted {total_inserted:,}/{len(data_items):,} documents ({rate:.0f} docs/sec)")
                data_docs = []
            except Exception as e:
                print(f"\nWarning: Error inserting batch: {e}")
                data_docs = []
                continue
    
    # Insert remaining documents
    if data_docs:
        try:
            collection.insert_many(data_docs, ordered=False)
            total_inserted += len(data_docs)
        except Exception as e:
            print(f"\nWarning: Error inserting final batch: {e}")
    
    # Insert metadata document
    collection.insert_one(metadata_doc)
    
    elapsed_time = time.time() - start_time
    print(f"\n✓ JSON data insertion complete!")
    print(f"  Total data documents inserted: {total_inserted:,}")
    print(f"  Metadata document inserted: 1")
    print(f"  Time elapsed: {elapsed_time/60:.2f} minutes")
    print(f"  Insertion rate: {total_inserted/elapsed_time:.0f} documents/second")
    
except Exception as e:
    print(f"\n✗ Error loading heatmap.json: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Load heatmap.geojson
print("\n" + "="*60)
print("Loading heatmap.geojson...")
print("="*60)

heatmap_geojson_file = 'data/heatmap.geojson'

if not os.path.exists(heatmap_geojson_file):
    print(f"✗ Warning: File not found: {heatmap_geojson_file}")
    print("  Skipping GeoJSON file...")
else:
    print(f"Loading {heatmap_geojson_file}...")
    geojson_start_time = time.time()
    
    try:
        # For large files, we'll stream the JSON
        # Since it's a FeatureCollection, we can parse it in chunks if needed
        # For now, load the whole file (if it fits in memory)
        print("  Reading GeoJSON file (this may take a while for large files)...")
        with open(heatmap_geojson_file, 'r') as f:
            geojson_data = json.load(f)
        
        geojson_metadata = geojson_data.get('metadata', {})
        features = geojson_data.get('features', [])
        
        print(f"✓ Loaded GeoJSON file")
        print(f"  Type: {geojson_data.get('type')}")
        print(f"  Metadata keys: {list(geojson_metadata.keys())}")
        print(f"  Features: {len(features):,}")
        
        # Store GeoJSON metadata as a separate document
        geojson_metadata_doc = {
            'type': 'geojson_metadata',
            'metadata': geojson_metadata,
            'created_at': datetime.utcnow()
        }
        
        # Prepare feature documents for batch insert
        BATCH_SIZE = 10000
        feature_docs = []
        total_features_inserted = 0
        
        print(f"\nInserting {len(features):,} features in batches of {BATCH_SIZE:,}...")
        
        for feature in features:
            # Store the entire feature structure
            doc = {
                'type': 'geojson_feature',
                'feature_type': feature.get('type'),
                'geometry': feature.get('geometry'),
                'properties': feature.get('properties'),
                # Extract coordinates for easier querying
                'time_bucket': feature.get('properties', {}).get('time_bucket'),
                'lat': feature.get('properties', {}).get('lat') or (
                    feature.get('geometry', {}).get('coordinates', [None, None])[1]
                    if feature.get('geometry', {}).get('type') == 'Point' else None
                ),
                'lon': feature.get('properties', {}).get('lon') or (
                    feature.get('geometry', {}).get('coordinates', [None, None])[0]
                    if feature.get('geometry', {}).get('type') == 'Point' else None
                )
            }
            
            # Add location field for geospatial queries if it's a Point
            if feature.get('geometry', {}).get('type') == 'Point':
                coords = feature.get('geometry', {}).get('coordinates', [])
                if len(coords) >= 2:
                    doc['location'] = {
                        'type': 'Point',
                        'coordinates': [coords[0], coords[1]]
                    }
            
            feature_docs.append(doc)
            
            # Insert in batches
            if len(feature_docs) >= BATCH_SIZE:
                try:
                    collection.insert_many(feature_docs, ordered=False)
                    total_features_inserted += len(feature_docs)
                    if total_features_inserted % 50000 == 0:
                        elapsed = time.time() - geojson_start_time
                        rate = total_features_inserted / elapsed if elapsed > 0 else 0
                        print(f"  Inserted {total_features_inserted:,}/{len(features):,} features ({rate:.0f} docs/sec)")
                    feature_docs = []
                except Exception as e:
                    print(f"\nWarning: Error inserting batch: {e}")
                    feature_docs = []
                    continue
        
        # Insert remaining features
        if feature_docs:
            try:
                collection.insert_many(feature_docs, ordered=False)
                total_features_inserted += len(feature_docs)
            except Exception as e:
                print(f"\nWarning: Error inserting final batch: {e}")
        
        # Insert GeoJSON metadata document
        collection.insert_one(geojson_metadata_doc)
        
        elapsed_time = time.time() - geojson_start_time
        print(f"\n✓ GeoJSON data insertion complete!")
        print(f"  Total feature documents inserted: {total_features_inserted:,}")
        print(f"  GeoJSON metadata document inserted: 1")
        print(f"  Time elapsed: {elapsed_time/60:.2f} minutes")
        if elapsed_time > 0:
            print(f"  Insertion rate: {total_features_inserted/elapsed_time:.0f} documents/second")
        
    except MemoryError:
        print(f"\n✗ Error: File too large to load into memory")
        print("  Consider using a streaming JSON parser or splitting the file")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Error loading heatmap.geojson: {e}")
        import traceback
        traceback.print_exc()
        # Don't exit, just warn since JSON data was already loaded
        print("\n⚠ Warning: GeoJSON loading failed, but JSON data was successfully loaded")

# Verify insertion
print("\n" + "="*60)
print("Verifying insertion...")
print("="*60)

try:
    total_count = collection.count_documents({})
    metadata_count = collection.count_documents({'type': 'metadata'})
    data_count = collection.count_documents({'type': 'data'})
    geojson_metadata_count = collection.count_documents({'type': 'geojson_metadata'})
    geojson_feature_count = collection.count_documents({'type': 'geojson_feature'})
    
    print(f"Total documents in collection: {total_count:,}")
    print(f"  - Metadata documents: {metadata_count}")
    print(f"  - Data documents: {data_count:,}")
    if geojson_metadata_count > 0:
        print(f"  - GeoJSON metadata documents: {geojson_metadata_count}")
    if geojson_feature_count > 0:
        print(f"  - GeoJSON feature documents: {geojson_feature_count:,}")
    
except Exception as e:
    print(f"✗ Error verifying insertion: {e}")

# Create indexes
print("\n" + "="*60)
print("Creating indexes...")
print("="*60)

try:
    # Index on type for filtering document types
    print("\nCreating index on 'type' field...")
    collection.create_index([('type', 1)])
    print("✓ Index created on type")
    
    # Index on time_bucket for time-based queries
    print("\nCreating index on 'time_bucket' field...")
    collection.create_index([('time_bucket', 1)])
    print("✓ Index created on time_bucket")
    
    # 2dsphere index on location field for geospatial queries
    print("\nCreating 2dsphere index on 'location' field...")
    collection.create_index([('location', GEOSPHERE)])
    print("✓ 2dsphere index created on location")
    
    # Compound index on type + time_bucket
    print("\nCreating compound index on type + time_bucket...")
    collection.create_index([('type', 1), ('time_bucket', 1)])
    print("✓ Compound index created on type + time_bucket")
    
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
    # Test 1: Count documents by type
    print("\n1. Document counts by type:")
    for doc_type in ['metadata', 'data', 'geojson_metadata', 'geojson_feature']:
        count = collection.count_documents({'type': doc_type})
        if count > 0:
            print(f"   {doc_type}: {count:,}")
    
    # Test 2: Sample data document
    sample_data = collection.find_one({'type': 'data'})
    if sample_data:
        print(f"\n2. Sample data document:")
        print(f"   Time bucket: {sample_data.get('time_bucket')}")
        print(f"   Location: ({sample_data.get('lat')}, {sample_data.get('lon')})")
        print(f"   Flight count: {sample_data.get('flight_count')}")
        print(f"   Intensity: {sample_data.get('intensity')}")
    
    # Test 3: Sample GeoJSON feature
    sample_feature = collection.find_one({'type': 'geojson_feature'})
    if sample_feature:
        print(f"\n3. Sample GeoJSON feature:")
        print(f"   Time bucket: {sample_feature.get('time_bucket')}")
        print(f"   Location: ({sample_feature.get('lat')}, {sample_feature.get('lon')})")
        print(f"   Properties: {list(sample_feature.get('properties', {}).keys())}")
    
    # Test 4: Time bucket query
    time_bucket_count = collection.count_documents({'type': 'data', 'time_bucket': '00:00'})
    print(f"\n4. Data documents with time_bucket '00:00': {time_bucket_count:,}")
    
    print("\n✓ All test queries successful!")
    
except Exception as e:
    print(f"\n✗ Error during test queries: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*60)
print("Load Complete!")
print("="*60)
print(f"\nCollection '{COLLECTION_NAME}' in database '{DB_NAME}' is ready for queries.")
print("\nExample queries:")
print(f"  # Get all data documents")
print(f"  collection.find({{'type': 'data'}})")
print(f"  # Get data for a specific time bucket")
print(f"  collection.find({{'type': 'data', 'time_bucket': '00:00'}})")
print(f"  # Geospatial query")
print(f"  collection.find({{")
print(f"    'location': {{")
print(f"      '$near': {{")
print(f"        '$geometry': {{'type': 'Point', 'coordinates': [lon, lat]}},")
print(f"        '$maxDistance': 50000  # 50km in meters")
print(f"      }}")
print(f"    }}")
print(f"  }})")

client.close()
print("\nConnection closed.")

