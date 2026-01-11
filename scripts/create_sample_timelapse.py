"""
Create a smaller sample dataset for testing.
"""
import json
from pathlib import Path

# Read the full dataset
print("Loading full dataset...")
with open('data/flight_paths_timelapse.geojson', 'r') as f:
    data = json.load(f)

# Sample every 10th flight position
print(f"Original: {len(data['features'])} positions")
sampled_features = data['features'][::10]  # Every 10th position
print(f"Sampled: {len(sampled_features)} positions")

# Create new GeoJSON
sample_data = {
    'type': 'FeatureCollection',
    'features': sampled_features,
    'metadata': data.get('metadata', {})
}

# Save
output_path = Path('data/flight_paths_timelapse_sample.geojson')
with open(output_path, 'w') as f:
    json.dump(sample_data, f)

print(f"Saved sample to {output_path}")
print(f"Size: {output_path.stat().st_size / 1024 / 1024:.1f} MB")


