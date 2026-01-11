# Flight Path Optimization Setup

This project includes a FastAPI service that uses **Snell's theorem** and **scipy optimization** to calculate the most efficient flight paths using boost zones created from similar and intersecting flight pairs.

## Architecture

**Node.js Backend** → Fetches flight data from database → **Python FastAPI Service** → Finds pairs, optimizes paths → Returns results

All pair detection logic (similar flights and intersecting flights) has been moved to the Python backend as helper functions.

## Requirements

### Python Dependencies

Install the following Python packages:

```bash
pip install -r requirements.txt
```

The requirements.txt includes:
- **fastapi**: Web framework for the optimization service
- **uvicorn**: ASGI server to run FastAPI
- **pydantic**: Data validation
- **numpy**: Numerical computations
- **scipy**: Optimization algorithms (Snell's theorem implementation)

### Node.js Dependencies

If you're using node-fetch (for calling the FastAPI service):

```bash
npm install node-fetch
```

## How It Works

### Boost Paths

1. **Similar Flight Pairs**: When two flights share a departure or arrival airport and fly within 45° of each other, a boost path is created along the bisector of their directions

2. **Intersecting Flight Pairs**: When two flight paths intersect and both planes are at the intersection within 1 hour of each other, a boost path is created along the bisector through the intersection point

3. **10% Speed Boost**: Flights traveling on boost paths (when both paired planes are present) experience a 10% speed increase

### Snell's Theorem Application

The optimization uses **Snell's theorem** (law of refraction) to find optimal entry and exit points for boost zones:

```
n₁/n₂ = v₂/v₁ = sin(θ₂)/sin(θ₁)
```

Where:
- `n₁ = 1.0` (refractive index for normal airspace)
- `n₂ = 1/1.1` (refractive index for boost zone - inversely proportional to speed)
- `v₁ = 1.0` (normal speed)
- `v₂ = 1.1` (boost speed, 10% faster)

The optimization minimizes the total time objective function:

```
T = d₁/v₁ + d₂/v₂ + d₃/v₁
```

Where:
- `d₁` = distance from departure to boost zone entry
- `d₂` = distance within boost zone
- `d₃` = distance from boost zone exit to arrival

### Multi-Boost Paths

- Flights can join/leave boost paths as they become available
- If a flight is involved in multiple pairs, the algorithm selects the most efficient boost paths (up to 3)
- The algorithm tries single and double boost path combinations to find the optimal route

## Running the Services

### 1. Start the FastAPI Optimization Service

```bash
cd pyback
python optimize_service.py
```

The service will start on `http://localhost:8001`

### 2. Start the Node.js Backend

In a separate terminal:

```bash
cd backend
node index.js
```

The backend will start on its configured port (typically `http://localhost:3000`)

### 3. Call the Optimization Endpoint

```bash
GET http://localhost:3000/api/airline/optimal-paths
```

## How the Flow Works

1. **Node.js** fetches all flight data (with coordinates) from SQLite database
2. **Node.js** sends raw flight data to Python service at `/optimize-from-raw-flights`
3. **Python service**:
   - Calls `find_similar_flight_pairs()` helper function
   - Calls `find_intersecting_flight_pairs()` helper function
   - Creates boost zones from all pairs
   - Optimizes each flight using Snell's theorem
4. **Python** returns optimized paths with time savings
5. **Node.js** saves results to CSV and returns to client

## API Response

The endpoint returns:

```json
{
  "total_flights_optimized": 150,
  "total_pairs_used": 75,
  "optimized_paths": [
    {
      "flight_number": "DL123",
      "departure_airport": "JFK",
      "arrival_airport": "LAX",
      "original_distance": 3944.42,
      "optimized_distance": 3890.15,
      "time_savings": 6.82,
      "boost_paths_used": 2,
      "waypoints": [
        {"lat": 40.6413, "lon": -73.7781, "type": "departure"},
        {"lat": 41.2580, "lon": -95.9970, "type": "boost_entry"},
        {"lat": 38.7490, "lon": -106.3820, "type": "boost_exit"},
        {"lat": 35.9870, "lon": -115.1420, "type": "boost_entry"},
        {"lat": 34.8950, "lon": -118.1200, "type": "boost_exit"},
        {"lat": 33.9416, "lon": -118.4085, "type": "arrival"}
      ],
      "boost_segments": [...]
    }
  ],
  "csv_file": "C:\\path\\to\\optimal_paths.csv"
}
```

## Output Files

- **optimal_paths.csv**: Contains optimized paths with time savings for each flight
- Includes: flight number, airports, distances, time savings, boost paths used

## Configuration

Set the optimization service URL in your environment:

```bash
# Windows
set OPTIMIZATION_SERVICE_URL=http://localhost:8001

# Linux/Mac
export OPTIMIZATION_SERVICE_URL=http://localhost:8001
```

## Algorithm Details

1. **Collects all valid flight pairs** (similar + intersecting)
2. **Creates boost zone definitions** from each pair
3. **Groups flights** that appear in multiple pairs
4. **For each flight**:
   - Identifies available boost paths
   - Selects top 3 most efficient if multiple options exist
   - Uses scipy.optimize.minimize with SLSQP method
   - Applies Snell's law constraints
   - Tries single and double boost combinations
   - Selects path with minimum total time
5. **Returns optimized waypoints** and time savings

## Notes

- Boost paths only provide benefits when **both airplanes** in the pair are present
- The bisector direction is calculated as the angle halfway between the two flight paths
- Boost zones extend based on flight lengths (typically 200-400km)
- Sequential optimization allows flights to switch between multiple boost paths
