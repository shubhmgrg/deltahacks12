# Postman API Test for Optimal Departure Time

## GET Request

### URL
```
http://localhost:3001/api/optimal-departure
```

### Query Parameters
| Key | Value | Required | Description |
|-----|-------|----------|-------------|
| `origin` | `JFK` | Yes | Origin airport code (IATA) |
| `dest` | `LAX` | Yes | Destination airport code (IATA) |
| `scheduled` | `2013-01-01 08:00:00` | Yes | Scheduled departure time (YYYY-MM-DD HH:MM:SS) |
| `duration` | `300` | No | Flight duration in minutes (optional) |
| `distance` | `3000` | No | Flight distance in km (optional) |

### Complete URL Example
```
http://localhost:3001/api/optimal-departure?origin=JFK&dest=LAX&scheduled=2013-01-01%2008:00:00
```
(Note: Space in datetime is URL-encoded as `%20`)

### cURL Command
```bash
curl -X GET "http://localhost:3001/api/optimal-departure?origin=JFK&dest=LAX&scheduled=2013-01-01%2008:00:00"
```

### Postman Setup
1. **Method**: GET
2. **URL**: `http://localhost:3001/api/optimal-departure`
3. **Params Tab**:
   - `origin`: `JFK`
   - `dest`: `LAX`
   - `scheduled`: `2013-01-01 08:00:00`
   - `duration`: `300` (optional)
   - `distance`: `3000` (optional)

---

## POST Request

### URL
```
http://localhost:3001/api/optimal-departure
```

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "origin": "JFK",
  "dest": "LAX",
  "scheduled": "2013-01-01 08:00:00",
  "duration": 300,
  "distance": 3000
}
```

### cURL Command
```bash
curl -X POST "http://localhost:3001/api/optimal-departure" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "JFK",
    "dest": "LAX",
    "scheduled": "2013-01-01 08:00:00",
    "duration": 300,
    "distance": 3000
  }'
```

### Postman Setup
1. **Method**: POST
2. **URL**: `http://localhost:3001/api/optimal-departure`
3. **Headers Tab**:
   - Key: `Content-Type`, Value: `application/json`
4. **Body Tab**:
   - Select: `raw`
   - Select: `JSON`
   - Paste the JSON body above

---

## Example Response

The API returns a JSON object with the following structure:

```json
{
  "route": {
    "origin": "JFK",
    "destination": "LAX",
    "scheduled_departure": "2013-01-01T08:00:00",
    "optimal_departure": "2013-01-01T07:30:00",
    "time_offset_minutes": -30.0
  },
  "path": {
    "flight_path": [
      {
        "lat": 40.6413,
        "lon": -73.7781,
        "timestamp": "2013-01-01T07:30:00",
        "time_index": 0,
        "segment_distance_km": 65.1
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
    "connection_details": [...]
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
    "evaluation_offsets_minutes": [-60, -40, -20, 0, 20, 40, 60],
    "search_window_minutes": 60
  }
}
```

---

## Notes

- **Response Time**: The API may take 30-60 seconds to respond as it evaluates multiple candidate departure times
- **Required Fields**: `origin`, `dest`, and `scheduled` are required
- **Date Format**: Use `YYYY-MM-DD HH:MM:SS` format for the scheduled time
- **Backend**: Ensure the backend server is running on port 3001 (default)
- **MongoDB**: The API requires a MongoDB connection with flight_nodes collection

---

## Quick Test Examples

### Example 1: Basic Request (GET)
```
GET http://localhost:3001/api/optimal-departure?origin=JFK&dest=LAX&scheduled=2013-01-01%2008:00:00
```

### Example 2: With Optional Parameters (GET)
```
GET http://localhost:3001/api/optimal-departure?origin=ATL&dest=SFO&scheduled=2013-01-01%2010:00:00&duration=300&distance=3000
```

### Example 3: POST Request
```bash
curl -X POST http://localhost:3001/api/optimal-departure \
  -H "Content-Type: application/json" \
  -d '{"origin":"JFK","dest":"LAX","scheduled":"2013-01-01 08:00:00"}'
```
