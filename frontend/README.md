# SkySync Frontend

React + Vite frontend for the SkySync flight formation visualization tool.

## Setup

```bash
cd frontend
npm install
```

## Run

```bash
# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

Dev server runs on `http://localhost:5173` by default.

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **Framer Motion** - Animations
- **Mapbox GL** - 3D/2D map visualization
- **shadcn/ui** - UI components
- **React Router** - Client-side routing

## Project Structure

```
frontend/
├── public/
│   └── data/
│       └── airports_sample.json    # Airport mock data
├── src/
│   ├── api/                        # API client modules
│   ├── components/                 # React components
│   │   └── ui/                     # shadcn/ui components
│   ├── data/                       # Local demo data
│   ├── hooks/                      # Custom React hooks
│   ├── lib/                        # Utilities
│   ├── pages/                      # Page components
│   ├── App.jsx                     # Router setup
│   ├── main.jsx                    # Entry point
│   └── index.css                   # Global styles
├── index.html
├── package.json
├── tailwind.config.js
└── vite.config.js
```

## Routes

- `/` - Landing page
- `/app` - Main application (map + replay)

## Environment Variables

Create a `.env` file:

```
VITE_MAPBOX_TOKEN=your_mapbox_token_here
```

## Connecting to Backend

To connect to the backend API instead of mock data, update the API base URL in `src/api/client.js`.
