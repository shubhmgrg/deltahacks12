# SkySync Backend

Express.js API for the SkySync flight formation matching service.

## Setup

```bash
cd backend
npm install
```

## Run

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3001` by default.

## API Endpoints

### Health Check
- `GET /api/health` - Check if server is running

### Airports
- `GET /api/airports` - Get all airports
- `GET /api/airports?popular=true` - Get popular airports only
- `GET /api/airports/search?q=toronto&near=canada&limit=10` - Search airports
- `GET /api/airports/:code` - Get airport by IATA code (e.g., `/api/airports/YYZ`)

### Matches
- `GET /api/matches` - Get all formation matches
- `GET /api/matches?from=YYZ&to=LHR&sortBy=co2&limit=10` - Filter and sort matches
- `GET /api/matches/:id` - Get specific match by scenario ID

### Scenarios
- `GET /api/scenarios` - Get all scenarios
- `GET /api/scenarios/:id` - Get specific scenario with flight data
- `GET /api/scenarios/:id/replay` - Get replay data for visualization

## Data Files

Data is stored in `src/data/`:
- `airports.json` - Airport database
- `matches.json` - Formation match summaries
- `scenarios.json` - Full scenario data with flight paths

## Environment Variables

- `PORT` - Server port (default: 3001)
