## MongoDB Atlas (recommended)

### 1) Create `backend/.env`

Create `backend/.env` (don’t commit this file):

```bash
MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority"
DB_NAME="deltahacks12"
PORT=3001
```

### 2) Ensure Atlas allows your connection

- **Network Access**: allow your IP (or `0.0.0.0/0` temporarily for a hackathon)
- **Database Access**: create a database user + password

### 3) Start the backend

```bash
npm run backend:dev
```

### 4) Verify Mongo is reachable

Open:
- `http://localhost:3001/health`

You should see `{ ok: true, mongo: "up" }`.

## Simple Mock UI (Next.js)

Run the Next app (in another terminal):

```bash
cd delta
npm run dev
```

Then open:
- `http://localhost:3000/mock`

# SkyFormation

A hackathon-ready web app that visualizes V-inspired (offset-echelon) formation flight opportunities between pairs of commercial flights, featuring a stunning 3D Mapbox scene and FlightMapper-style editor UI.

![SkyFormation Demo](https://via.placeholder.com/800x400?text=SkyFormation+Demo)

## Features

- **3D Globe Visualization**: Stunning Mapbox GL JS globe with terrain, atmosphere, and fog effects
- **Formation Flight Replay**: Watch aircraft join formation with animated snap-in effect
- **Real-time Savings Counter**: Live fuel and CO2 savings during formation flight
- **FlightMapper-style UI**: Professional editor interface with sidebar controls
- **Demo Mode**: 3 pre-baked scenarios work offline without any backend

## Tech Stack

- **React** + **Vite** (JavaScript)
- **Tailwind CSS** for styling
- **shadcn/ui** components (Buttons, Tabs, Cards, Sliders, Badges)
- **Mapbox GL JS** for 3D map visualization
- **Radix UI** primitives

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Mapbox access token (free tier works)

### Installation

1. **Clone the repository**
   ```bash
   cd DeltaHacks12
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Mapbox token**

   Create a `.env` file in the project root:
   ```
   VITE_MAPBOX_TOKEN=your_mapbox_token_here
   ```

   Get a free token at [mapbox.com](https://mapbox.com)

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**

   Navigate to `http://localhost:5173`

## Usage

### Map View

1. Select a formation opportunity from the sidebar
2. Click **Replay** to watch the formation animation
3. Use playback controls to pause, seek, or change speed
4. Toggle **Follow Camera** to track the aircraft

### Data View

- Browse ranked formation opportunities in a sortable table
- Click any row to select and switch to Map View
- Sort by CO2 saved, formation duration, or score

### Controls

- **Play/Pause**: Start or stop the replay
- **Reset**: Return to the beginning
- **Speed**: Adjust playback speed (0.5x, 1x, 2x, 4x)
- **Follow Camera**: Auto-track the leader aircraft

## Demo Scenarios

The app includes 3 pre-configured scenarios:

1. **Transatlantic Duo** (JFK-LHR): BA117 + VS3, 180 min formation, 2.68t CO2 saved
2. **Europe Express** (FRA-MAD): LH1114 + IB3615, 85 min formation, 1.01t CO2 saved
3. **Pacific Gateway** (LAX-NRT): NH105 + JL61, 320 min formation, 6.62t CO2 saved

## Project Structure

```
src/
├── main.jsx              # Entry point
├── App.jsx               # Main application component
├── index.css             # Global styles + Tailwind
├── components/
│   ├── TopBar.jsx        # Header with tabs and controls
│   ├── Sidebar.jsx       # Filters and match list
│   ├── MapScene.jsx      # Mapbox 3D visualization
│   ├── ReplayControls.jsx# Playback controls
│   ├── DataTable.jsx     # Match ranking table
│   └── ui/               # shadcn/ui components
│       ├── button.jsx
│       ├── badge.jsx
│       ├── card.jsx
│       ├── slider.jsx
│       ├── tabs.jsx
│       ├── accordion.jsx
│       └── dropdown-menu.jsx
├── lib/
│   ├── geo.js            # Haversine, heading, offset calculations
│   ├── replay.js         # Replay controller and state machine
│   └── utils.js          # Formatting and utilities
└── data/
    ├── scenarios.json    # Demo flight scenarios
    └── matches.json      # Ranked matches list
```

## Data Schema

### Scenario Format

```json
{
  "id": "scenario-1",
  "title": "Transatlantic Duo",
  "leader": {
    "id": "BA117",
    "label": "BA117",
    "route": "JFK-LHR",
    "airline": "British Airways",
    "aircraft": "Boeing 787-9",
    "points": [{"t": 0, "lon": -73.78, "lat": 40.64}, ...]
  },
  "follower": {
    "id": "VS3",
    "label": "VS3",
    ...
  },
  "joinIndex": 3,
  "splitIndex": 9,
  "metrics": {
    "formationMinutes": 180,
    "formationDistanceKm": 3200,
    "detourKm": 15,
    "fuelSavedKg": 850,
    "co2SavedKg": 2680
  }
}
```

### Match Format

```json
{
  "rank": 1,
  "scenarioId": "scenario-1",
  "flightA": "BA117",
  "flightB": "VS3",
  "routeA": "JFK-LHR",
  "formationMinutes": 180,
  "co2SavedKg": 2680,
  "fuelSavedKg": 850,
  "detourKm": 15,
  "score": 2672.5
}
```

## Formation Flight Physics

The follower aircraft positions itself in an offset-echelon formation:
- **Behind distance**: 12 km (configurable)
- **Side offset**: 3 km to the right (starboard)

This positioning allows the follower to benefit from the leader's wake vortex, reducing drag and fuel consumption by 2-7% depending on conditions.

## Replay Phases

1. **Rendezvous**: Both aircraft fly independently toward the join point
2. **LOCKED**: Follower snaps into formation position; savings accumulate
3. **Split**: Follower returns to independent flight path

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## License

MIT License - Built for DeltaHacks 12

## Acknowledgments

- Inspired by [FlightMapper.io](https://flightmapper.io)
- Map data © Mapbox © OpenStreetMap
- Formation flight research based on NASA/Airbus studies