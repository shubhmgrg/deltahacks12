# Heatmap Integration Guide

This guide explains how to generate and use the flight density heatmap in the SkySync frontend.

## Overview

The heatmap visualization shows flight density across the globe, aggregated by grid cells and time buckets. It can be animated over time to show how flight patterns change throughout the day.

## Step 1: Generate Heatmap Data

First, generate the heatmap data from MongoDB:

```bash
cd /Users/marc/DeltaHacks12
python scripts/compute_heatmap.py
```

### Configuration Options

You can configure the heatmap generation with environment variables:

```bash
# Grid resolution (degrees) - smaller = finer grid
export GRID_RESOLUTION=0.1  # Default: 0.1° (~11 km per cell)

# Time step (minutes) - groups nodes into time buckets
export TIME_STEP_MINUTES=20  # Default: 20 minutes

# Whether to weight by formation candidates
export WEIGHT_BY_FORMATION=true  # Default: true

# Output file location
export HEATMAP_OUTPUT=data/heatmap.json  # Default: data/heatmap.json
```

### Example Usage

```bash
# Default settings (0.1° grid, 20 min time step)
python scripts/compute_heatmap.py

# Finer grid for more detail (slower processing)
GRID_RESOLUTION=0.05 python scripts/compute_heatmap.py

# Coarser grid for faster processing
GRID_RESOLUTION=0.2 python scripts/compute_heatmap.py

# Without formation weighting (faster)
WEIGHT_BY_FORMATION=false python scripts/compute_heatmap.py
```

The script will generate two files:
- `data/heatmap.json` - JSON format with metadata
- `data/heatmap.geojson` - GeoJSON format (not currently used by frontend)

## Step 2: Start the Backend

The backend serves the heatmap data via API:

```bash
cd backend
npm install  # If not already done
npm run dev
```

The backend will serve heatmap data from `data/heatmap.json` at:
- `GET /api/heatmap` - Get heatmap data (optionally filtered by time bucket)
- `GET /api/heatmap/time-buckets` - Get list of available time buckets
- `GET /api/heatmap/stats` - Get heatmap statistics

## Step 3: Use in Frontend

### Enable Heatmap in UI

1. Start the frontend:
   ```bash
   cd frontend
   npm install  # If not already done
   npm run dev
   ```

2. Navigate to the Map View (`/app`)

3. Click the **Heatmap** toggle in the bottom-left corner

### Features

- **Toggle**: Enable/disable heatmap visualization
- **Time Slider**: Scroll through different time buckets
- **Play/Pause**: Animate heatmap through time (1 second per frame)
- **Reset**: Jump back to first time bucket
- **Auto-loading**: Heatmap data loads automatically when enabled

### Visual Details

- **Color Ramp**: Blue (low) → Green → Yellow → Red (high intensity)
- **Zoom-based**: Intensity and radius adjust based on map zoom level
- **Opacity**: Fades at higher zoom levels to avoid obscuring detailed view
- **Layering**: Renders behind aircraft and routes, so it doesn't interfere with scenario visualization

## Data Format

The heatmap data structure:

```json
{
  "metadata": {
    "grid_resolution_degrees": 0.1,
    "grid_resolution_km": 11.1,
    "time_step_minutes": 20,
    "weight_by_formation": true,
    "total_cells": 1234,
    "time_buckets": ["00:00", "00:20", "00:40", ...],
    "generated_at": "2024-01-01T12:00:00"
  },
  "data": [
    {
      "time_bucket": "00:00",
      "lat": 40.7,
      "lon": -74.0,
      "flight_count": 5,
      "node_count": 10,
      "intensity": 5,
      "formation_count": 3,
      "weighted_intensity": 6.5
    },
    ...
  ]
}
```

## Troubleshooting

### No heatmap data available

**Error**: "No heatmap data available. Run scripts/compute_heatmap.py to generate data."

**Solution**: 
1. Ensure MongoDB has flight nodes loaded (`scripts/load_mongodb.py`)
2. Run `scripts/compute_heatmap.py` to generate data
3. Verify `data/heatmap.json` exists

### Backend can't find heatmap file

**Error**: Backend returns 503 or empty data

**Solution**:
1. Check that `data/heatmap.json` exists relative to backend root
2. Verify file permissions (should be readable)
3. Check backend logs for specific error messages

### Heatmap not displaying on map

**Solution**:
1. Check browser console for errors
2. Verify Mapbox token is set (`VITE_MAPBOX_TOKEN`)
3. Ensure heatmap toggle is enabled
4. Check that time buckets are available

### Performance issues

**If heatmap generation is slow**:
- Use larger `GRID_RESOLUTION` (e.g., 0.2° instead of 0.1°)
- Disable formation weighting (`WEIGHT_BY_FORMATION=false`)
- Reduce number of nodes processed (sample data)

**If rendering is slow**:
- Reduce number of grid cells (increase `GRID_RESOLUTION`)
- Reduce time buckets (increase `TIME_STEP_MINUTES`)
- Check browser performance (reduce animation speed)

## Integration Details

### Frontend Components

- **`HeatmapControls.jsx`**: UI controls for toggling, time selection, and animation
- **`MapScene.jsx`**: Mapbox layer setup and data rendering
- **`api/heatmap.js`**: API client for fetching heatmap data

### Backend Routes

- **`backend/src/routes/heatmap.js`**: Express routes for serving heatmap data

### Scripts

- **`scripts/compute_heatmap.py`**: Generates heatmap from MongoDB flight nodes

## Next Steps

- Add heatmap intensity controls (min/max threshold)
- Support for multiple heatmap metrics (flight count, formation density, fuel savings)
- Export heatmap as image/video
- Real-time heatmap updates from live flight data

