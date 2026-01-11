# STEP 7: Optimal Departure Time Algorithm

## Overview

This algorithm determines the optimal departure time for a flight route using **overlap-based path optimization**. Instead of exhaustive search, it finds the departure time that maximizes overlap with existing flights, resulting in maximum formation opportunities and fuel savings.

## Algorithm Approach

### Core Concept

1. **Base Case**: Calculate solo flight cost from A to B (normal flight operation)
2. **Overlap Detection**: Identify segments where the flight can connect to ongoing flights in the network
3. **Efficiency Gain**: Connected segments are 5% more efficient (formation flying benefit)
4. **Path Optimization**: Find optimal departure time that maximizes connected segments
5. **Output**: Structured JSON data ready for UI display

### Key Differences from Exhaustive Search

- **Not exhaustive**: Uses efficient search over candidate times
- **Overlap-based**: Focuses on maximizing connections with existing flights
- **Cost-based optimization**: Minimizes total path cost (maximizes overlaps)
- **5% efficiency gain**: Each connected segment reduces cost by 5%

## Mathematical Foundation

### Graph Representation

- **Graph G = (V, E)** where:
  - **V** = flight nodes along the path (temporal-spatial waypoints)
  - **E** = flight segments between nodes

### Cost Model

Each segment has two costs:

- **Solo Cost**: `cost_solo = segment_distance` (base case)
- **Connected Cost**: `cost_connected = segment_distance × 0.95` (5% efficiency gain)

### Objective Function

Minimize total path cost:

```
minimize: f(t) = Σᵢ cost_i(t)

where:
  cost_i(t) = {
    segment_distance × 0.95  if overlap exists at segment i
    segment_distance          otherwise (solo flight)
  }
```

Subject to: `t ∈ [t_scheduled - 30min, t_scheduled + 30min]`

### Overlap Detection

A segment has an overlap if:

- There exists an ongoing flight node within 50km (spatial constraint)
- The flight node timestamp is within ±20 minutes (temporal constraint)
- Multiple overlaps can exist per segment (multiple formation partners)

### Optimization Algorithm

**Search Strategy**: Binary/Ternary Search over Time Window

1. **Coarse Search**: Evaluate candidates at 5-minute intervals (±30 min window = 13 candidates)
2. **Cost Evaluation**: For each candidate time:
   - Synthesize flight path nodes
   - Find overlapping flights at each node
   - Calculate path cost (solo segments + connected segments)
3. **Selection**: Choose time with minimum cost (maximum overlaps)
4. **Refinement**: Check neighbors of best candidate for improvement

**Complexity:**

- Time: O(n × m × k) where:
  - n = number of candidate times (13 for ±30min at 5min intervals)
  - m = number of flight nodes along path (~50-200)
  - k = average overlap candidates per node (5-20)
- Space: O(m × k) for overlap storage
- Much more efficient than full exhaustive search over all possible times

## Algorithm Steps

1. **Input**: Flight route (origin, destination), scheduled departure time
2. **Path Synthesis**: Generate flight nodes along great circle path for candidate times
3. **Overlap Detection**: For each node, query MongoDB for overlapping flights (spatial + temporal)
4. **Cost Calculation**:
   - Calculate solo cost (base case: all segments at normal cost)
   - Calculate connected cost (segments with overlaps: 5% reduction)
   - Compute total savings
5. **Optimization**: Find departure time that minimizes total cost (maximizes overlaps)
6. **Output**: Structured JSON with optimal time, path data, connections, and statistics

## Usage

### Command Line

```bash
# Basic usage
python scripts/optimal_departure_time.py \
  --origin JFK \
  --dest LAX \
  --scheduled "2013-01-01 08:00:00"

# Output JSON for UI
python scripts/optimal_departure_time.py \
  --origin ATL \
  --dest SFO \
  --scheduled "2013-01-01 10:00:00" \
  --json

# Save to file
python scripts/optimal_departure_time.py \
  --origin JFK \
  --dest LAX \
  --scheduled "2013-01-01 08:00:00" \
  --json \
  --output results.json
```

### API Endpoint

**GET /api/optimal-departure**

Query parameters:

- `origin` (required): Origin airport code (IATA, e.g., JFK)
- `dest` (required): Destination airport code (IATA, e.g., LAX)
- `scheduled` (required): Scheduled departure time (YYYY-MM-DD HH:MM:SS)
- `duration` (optional): Flight duration in minutes
- `distance` (optional): Flight distance in km

Example:

```
GET /api/optimal-departure?origin=JFK&dest=LAX&scheduled=2013-01-01%2008:00:00
```

**POST /api/optimal-departure**

Request body:

```json
{
  "origin": "JFK",
  "dest": "LAX",
  "scheduled": "2013-01-01 08:00:00",
  "duration": 300,
  "distance": 3000
}
```

## Output Format (JSON for UI)

The algorithm outputs structured JSON optimized for frontend display:

```json
{
  "route": {
    "origin": "JFK",
    "destination": "LAX",
    "scheduled_departure": "2013-01-01T08:00:00",
    "optimal_departure": "2013-01-01T08:15:00",
    "time_offset_minutes": 15.0
  },
  "path": {
    "flight_path": [
      {
        "lat": 40.6413,
        "lon": -73.7781,
        "timestamp": "2013-01-01T08:15:00",
        "time_index": 0,
        "segment_distance_km": 50.2
      }
    ],
    "total_segments": 60,
    "connected_segments": 24,
    "connection_rate": 40.0
  },
  "cost_analysis": {
    "solo_cost": 3000.0,
    "total_cost": 2844.0,
    "total_savings": 156.0,
    "savings_percent": 5.2,
    "efficiency_gain_per_connection": 5.0
  },
  "connections": {
    "total_partners": 8,
    "total_connections": 24,
    "connection_details": [
      {
        "node_index": 5,
        "position": {
          "lat": 39.5,
          "lon": -75.2,
          "timestamp": "2013-01-01T08:40:00"
        },
        "partner": {
          "flight_id": 12345,
          "timestamp": "2013-01-01T08:41:00"
        },
        "distance_km": 12.5,
        "efficiency_gain": 5.0,
        "segment_savings": 2.51
      }
    ]
  },
  "statistics": {
    "average_cost_all_times": 2900.0,
    "average_savings_all_times": 100.0,
    "optimal_cost": 2844.0,
    "optimal_savings": 156.0,
    "cost_reduction_vs_average": 1.93
  },
  "algorithm_info": {
    "method": "overlap-based_path_optimization",
    "formation_efficiency_gain": 5.0,
    "max_formation_distance_km": 50,
    "max_time_difference_minutes": 20,
    "search_window_minutes": 30
  }
}
```

## Implementation Details

### Flight Path Synthesis

- Uses great circle interpolation between origin and destination
- Generates nodes at 5-minute intervals
- Assumes constant speed (800 km/h typical cruise speed)
- Linear interpolation for efficiency

### Overlap Detection

- **Spatial Query**: MongoDB 2dsphere index finds nodes within 50km
- **Temporal Query**: Filters nodes within ±20 minutes
- **Performance**: O(log n) per query using spatial indexing
- Limits to 20 candidates per node for performance

### Cost Calculation

- **Base Case**: All segments at normal cost (solo flight)
- **Connected Segments**: 5% cost reduction per connected segment
- **Total Savings**: Difference between solo cost and optimal cost
- Only segments with valid overlaps get efficiency gain

### Optimization Strategy

- Evaluates candidate times at 5-minute intervals
- Compares path costs (lower = better, more overlaps)
- Selects time with minimum cost
- Refines by checking neighbors of best candidate

## Performance Characteristics

**Time Complexity:**

- Path synthesis: O(m) where m = number of nodes
- Overlap queries: O(m × log n) where n = total nodes in database
- Cost calculation: O(m × k) where k = candidates per node
- **Total: O(n_candidates × m × (log n + k))**

**Space Complexity:**

- Node storage: O(m)
- Overlap storage: O(m × k)
- **Total: O(m × k)**

**Real-time Performance:**

- Typical route (100 nodes, 10 candidates/node, 13 time candidates): ~5-15 seconds
- Optimized through:
  - Spatial indexing (MongoDB 2dsphere)
  - Limited candidate queries (20 per node)
  - Efficient cost calculation

## Comparison: Base Case vs Optimal Path

### Base Case (Solo Flight)

- All segments at normal cost
- No formation opportunities
- Total cost: `Σ(segment_distance_i)`

### Optimal Path (with Overlaps)

- Connected segments: 5% cost reduction
- Formation opportunities maximized
- Total cost: `Σ(segment_cost_i)` where cost_i depends on overlaps
- Savings: `solo_cost - optimal_cost`

### Example

For a 3000km flight with 60 segments:

- **Base Case**: 3000.0 cost units (all solo)
- **Optimal Path**: 2850.0 cost units (40% segments connected)
- **Savings**: 150.0 cost units (5.0%)
- **Formation Partners**: 8 different flights
- **Connection Points**: 24 segments with overlaps

## Future Enhancements

1. **Multi-segment Formations**: Track formations across consecutive segments
2. **Heading Alignment**: Factor in heading similarity for better overlap quality
3. **Dynamic Efficiency**: Vary efficiency gain based on formation quality
4. **Parallel Processing**: Evaluate candidate times in parallel
5. **Machine Learning**: Learn optimal parameters from historical data
6. **Weather Integration**: Factor in wind conditions for path optimization
7. **Multi-flight Coordination**: Optimize multiple flights simultaneously

## Mathematical Notation

- **G = (V, E)**: Graph with vertices V and edges E
- **t**: Departure time
- **t_scheduled**: Scheduled departure time
- **cost_solo**: Cost of solo flight segment
- **cost_connected**: Cost of connected segment (5% reduction)
- **f(t)**: Total path cost function at departure time t
- **Σ**: Summation operator
- **arg min**: Argument that minimizes the function
- **O(·)**: Big O notation (asymptotic complexity)
