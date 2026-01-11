"""
Streamlit app for Flight Formation Visualization (optional).

For MVP, you can also just open frontend/index.html directly in a browser.
"""

import streamlit as st
import json
from pathlib import Path

st.set_page_config(page_title="Flight Formation Heatmap", layout="wide")

st.title("Flight Formation Visualization")

st.markdown("""
This app visualizes flight formation potential using a heatmap.

**Quick Start:**
1. Generate sample data: `python scripts/generate_sample.py`
2. Preprocess: `python scripts/preprocess.py --input data/sample_flights.csv`
3. Open `frontend/index.html` in a browser (or use the embedded view below)

**Note:** You'll need a Mapbox access token. Get one at https://account.mapbox.com/
""")

# Check if heatmap data exists
heatmap_path = Path("data/heatmap.geojson")
if heatmap_path.exists():
    st.success(f"✓ Found heatmap data: {heatmap_path}")
    
    with open(heatmap_path) as f:
        geojson = json.load(f)
    
    st.json({
        "Total cells": len(geojson["features"]),
        "Time bins": len(set(f["properties"]["time_bin"] for f in geojson["features"]))
    })
else:
    st.warning("⚠ No heatmap data found. Run preprocessing first!")

st.markdown("""
### Instructions

1. **Generate Sample Data:**
   ```bash
   python scripts/generate_sample.py --num-flights 300
   ```

2. **Preprocess to GeoJSON:**
   ```bash
   python scripts/preprocess.py --input data/sample_flights.csv --output data/heatmap.geojson
   ```

3. **View Heatmap:**
   - Open `frontend/index.html` in a browser
   - Add your Mapbox token to `frontend/app.js`
   - Use the time slider to scrub through time windows
""")


