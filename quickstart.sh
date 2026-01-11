#!/bin/bash
# Quick start script to generate sample data and create heatmap

echo "🚀 Flight Formation Visualization - Quick Start"
echo ""

# Create data directory
mkdir -p data

# Generate sample flight data
echo "📊 Generating sample flight data..."
python scripts/generate_sample.py --num-flights 300 --duration-hours 2 --output data/sample_flights.csv

# Preprocess to GeoJSON
echo ""
echo "🔄 Preprocessing to GeoJSON heatmap..."
python scripts/preprocess.py --input data/sample_flights.csv --output data/heatmap.geojson --grid-size 0.1 --time-bin 5

echo ""
echo "✅ Done! Next steps:"
echo "1. Get a Mapbox access token from https://account.mapbox.com/"
echo "2. Add it to frontend/app.js (replace YOUR_MAPBOX_ACCESS_TOKEN_HERE)"
echo "3. Open frontend/index.html in a browser"
echo ""
echo "Or run: streamlit run app.py"


