# Plane Icon Assets

This folder contains SVG sources and generators for plane marker PNGs.

## Required Files

1. **plane_leader.png** - Icon for the leader aircraft (256x256px)
2. **plane_follower.png** - Icon for the follower aircraft (256x256px)

## Quick Generation (Choose One Method)

### Method 1: HTML Generator (Easiest)
1. Open `generate-pngs.html` in your web browser
2. Click "Generate Both" button
3. Save the downloaded PNG files to this `/icons` folder

### Method 2: Node.js Script
```bash
# Install sharp (one-time)
npm install sharp --save-dev

# Generate icons
node scripts/generate-plane-icons.js
```

### Method 3: Manual Conversion
- Open `plane_leader.svg` and `plane_follower.svg` in any image editor
- Export as PNG at 256x256px with transparent background

## Icon Specifications

- **Size**: 256x256px
- **Format**: PNG with transparent background
- **Orientation**: Top-down view, pointing UP (north)
- **Colors**:
  - Leader: Blue/Indigo gradient (#6366f1 to #4f46e5)
  - Follower: Purple gradient (#8b5cf6 to #7c3aed)
- **Rendering**: Mapbox will rotate icons based on bearing (0-360°)
- **Opacity**: Follower uses 0.65-0.8 opacity based on phase

## Fallback Behavior

If PNG icons are missing, the app automatically falls back to circle markers. No errors occur.

## SVG Sources

SVG files are provided for easy editing:
- `plane_leader.svg` - Leader aircraft SVG source
- `plane_follower.svg` - Follower aircraft SVG source
