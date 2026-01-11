import express from "express";
import { db } from "../datastore.js";
import fs from "fs";
import path from "path";

const router = express.Router();
const OPTIMIZATION_SERVICE_URL = process.env.OPTIMIZATION_SERVICE_URL || "http://localhost:8001";

// Helper function to calculate angle between two flight paths
function calculateAngleBetweenPaths(flight1, flight2) {
  // Extract coordinates from the point format (lat,lon)
  const parseCoordinates = (coordStr) => {
    const match = coordStr.match(/\(([^,]+),([^)]+)\)/);
    if (!match) return null;
    return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
  };

  const dep1 = parseCoordinates(flight1.dep_coords);
  const arr1 = parseCoordinates(flight1.arr_coords);
  const dep2 = parseCoordinates(flight2.dep_coords);
  const arr2 = parseCoordinates(flight2.arr_coords);

  if (!dep1 || !arr1 || !dep2 || !arr2) return null;

  // Calculate direction vectors (in degrees)
  const vector1 = {
    lat: arr1.lat - dep1.lat,
    lon: arr1.lon - dep1.lon
  };
  
  const vector2 = {
    lat: arr2.lat - dep2.lat,
    lon: arr2.lon - dep2.lon
  };

  // Calculate dot product and magnitudes
  const dotProduct = vector1.lat * vector2.lat + vector1.lon * vector2.lon;
  const magnitude1 = Math.sqrt(vector1.lat ** 2 + vector1.lon ** 2);
  const magnitude2 = Math.sqrt(vector2.lat ** 2 + vector2.lon ** 2);

  if (magnitude1 === 0 || magnitude2 === 0) return null;

  // Check if vectors are pointing in the same direction (dot product must be positive)
  if (dotProduct < 0) return null;

  // Calculate angle in radians then convert to degrees
  const cosAngle = dotProduct / (magnitude1 * magnitude2);
  const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  const angleDeg = angleRad * (180 / Math.PI);

  return angleDeg;
}

// Helper function to check if times are within 3 hours (ignoring date)
function withinThreeHours(time1, time2) {
  const date1 = new Date(time1);
  const date2 = new Date(time2);
  
  // Extract time in minutes from midnight
  const minutes1 = date1.getUTCHours() * 60 + date1.getUTCMinutes();
  const minutes2 = date2.getUTCHours() * 60 + date2.getUTCMinutes();
  
  // Calculate difference (handle wrap-around at midnight)
  let diffMinutes = Math.abs(minutes1 - minutes2);
  
  // Check both forward and backward across midnight
  diffMinutes = Math.min(diffMinutes, 1440 - diffMinutes);
  
  const diffHours = diffMinutes / 60;
  return diffHours <= 3;
}

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper function to find intersection of two line segments
function findLineIntersection(p1, p2, p3, p4) {
  // p1-p2 is first line segment, p3-p4 is second line segment
  const x1 = p1.lon, y1 = p1.lat;
  const x2 = p2.lon, y2 = p2.lat;
  const x3 = p3.lon, y3 = p3.lat;
  const x4 = p4.lon, y4 = p4.lat;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  
  if (Math.abs(denom) < 1e-10) {
    return null; // Lines are parallel or coincident
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // Check if intersection is within both line segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      lat: y1 + t * (y2 - y1),
      lon: x1 + t * (x2 - x1),
      t1: t, // proportion along first line (0 to 1)
      t2: u  // proportion along second line (0 to 1)
    };
  }

  return null;
}

// Helper function to calculate time at intersection point
function calculateTimeAtIntersection(departureTime, arrivalTime, proportionAlongPath) {
  const depTime = new Date(departureTime).getTime();
  const arrTime = new Date(arrivalTime).getTime();
  const flightDuration = arrTime - depTime;
  
  const timeAtIntersection = depTime + (flightDuration * proportionAlongPath);
  return new Date(timeAtIntersection);
}

// Helper function to check if two times are within specified hours
function withinHours(time1, time2, hours) {
  const diff = Math.abs(new Date(time1).getTime() - new Date(time2).getTime());
  return diff <= hours * 60 * 60 * 1000;
}

router.get("/similar-flight-pairs", (req, res) => {
  console.log("Received request for similar flight pairs");
  
  const query = `
    SELECT 
      f1.flight_id as flight1_id,
      f1.flight_no as flight1_no,
      f1.departure_airport as flight1_dep,
      f1.arrival_airport as flight1_arr,
      f1.scheduled_departure as flight1_dep_time,
      f1.scheduled_arrival as flight1_arr_time,
      f2.flight_id as flight2_id,
      f2.flight_no as flight2_no,
      f2.departure_airport as flight2_dep,
      f2.arrival_airport as flight2_arr,
      f2.scheduled_departure as flight2_dep_time,
      f2.scheduled_arrival as flight2_arr_time,
      dep1.coordinates as dep1_coords,
      arr1.coordinates as arr1_coords,
      dep2.coordinates as dep2_coords,
      arr2.coordinates as arr2_coords
    FROM flights f1
    JOIN flights f2 ON f1.flight_id < f2.flight_id
    JOIN airports_data dep1 ON f1.departure_airport = dep1.airport_code
    JOIN airports_data arr1 ON f1.arrival_airport = arr1.airport_code
    JOIN airports_data dep2 ON f2.departure_airport = dep2.airport_code
    JOIN airports_data arr2 ON f2.arrival_airport = arr2.airport_code
    WHERE 
      (f1.departure_airport = f2.departure_airport OR f1.arrival_airport = f2.arrival_airport)
      AND f1.departure_airport != f1.arrival_airport
      AND f2.departure_airport != f2.arrival_airport
      AND NOT (f1.departure_airport = f2.departure_airport AND f1.arrival_airport = f2.arrival_airport)
    LIMIT 1000
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // Filter results based on angle and time constraints
    const matchingPairs = [];

    for (const row of rows) {
      const angle = calculateAngleBetweenPaths(
        {
          dep_coords: row.dep1_coords,
          arr_coords: row.arr1_coords
        },
        {
          dep_coords: row.dep2_coords,
          arr_coords: row.arr2_coords
        }
      );

      if (angle === null || angle > 45) continue;

      // Check time constraints
      const sameDeparture = row.flight1_dep === row.flight2_dep;
      const sameArrival = row.flight1_arr === row.flight2_arr;

      let timeValid = false;
      if (sameDeparture && withinThreeHours(row.flight1_dep_time, row.flight2_dep_time)) {
        timeValid = true;
      }
      if (sameArrival && withinThreeHours(row.flight1_arr_time, row.flight2_arr_time)) {
        timeValid = true;
      }

      if (timeValid) {
        matchingPairs.push({
          flight1: {
            id: row.flight1_id,
            number: row.flight1_no,
            departure_airport: row.flight1_dep,
            arrival_airport: row.flight1_arr,
            scheduled_departure: row.flight1_dep_time,
            scheduled_arrival: row.flight1_arr_time
          },
          flight2: {
            id: row.flight2_id,
            number: row.flight2_no,
            departure_airport: row.flight2_dep,
            arrival_airport: row.flight2_arr,
            scheduled_departure: row.flight2_dep_time,
            scheduled_arrival: row.flight2_arr_time
          },
          angle_degrees: angle.toFixed(2),
          same_departure: sameDeparture,
          same_arrival: sameArrival
        });
      }
    }

    res.json({
      total_pairs: matchingPairs.length,
      pairs: matchingPairs
    });
  });
});

router.get("/intersecting-flights", (req, res) => {
  console.log("Received request for intersecting flight pairs");
  
  const query = `
    SELECT 
      f1.flight_id as flight1_id,
      f1.flight_no as flight1_no,
      f1.departure_airport as flight1_dep,
      f1.arrival_airport as flight1_arr,
      f1.scheduled_departure as flight1_dep_time,
      f1.scheduled_arrival as flight1_arr_time,
      f2.flight_id as flight2_id,
      f2.flight_no as flight2_no,
      f2.departure_airport as flight2_dep,
      f2.arrival_airport as flight2_arr,
      f2.scheduled_departure as flight2_dep_time,
      f2.scheduled_arrival as flight2_arr_time,
      dep1.coordinates as dep1_coords,
      arr1.coordinates as arr1_coords,
      dep2.coordinates as dep2_coords,
      arr2.coordinates as arr2_coords
    FROM flights f1
    JOIN flights f2 ON f1.flight_id < f2.flight_id
    JOIN airports_data dep1 ON f1.departure_airport = dep1.airport_code
    JOIN airports_data arr1 ON f1.arrival_airport = arr1.airport_code
    JOIN airports_data dep2 ON f2.departure_airport = dep2.airport_code
    JOIN airports_data arr2 ON f2.arrival_airport = arr2.airport_code
    WHERE 
      f1.departure_airport != f1.arrival_airport
      AND f2.departure_airport != f2.arrival_airport
      AND f1.departure_airport != f2.departure_airport
      AND f1.arrival_airport != f2.arrival_airport
    LIMIT 30000
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const parseCoordinates = (coordStr) => {
      const match = coordStr.match(/\(([^,]+),([^)]+)\)/);
      if (!match) return null;
      return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
    };

    const intersectingPairs = [];

    for (const row of rows) {
      const dep1 = parseCoordinates(row.dep1_coords);
      const arr1 = parseCoordinates(row.arr1_coords);
      const dep2 = parseCoordinates(row.dep2_coords);
      const arr2 = parseCoordinates(row.arr2_coords);

      if (!dep1 || !arr1 || !dep2 || !arr2) continue;

      // Calculate angle between paths first
      const angle = calculateAngleBetweenPaths(
        { dep_coords: row.dep1_coords, arr_coords: row.arr1_coords },
        { dep_coords: row.dep2_coords, arr_coords: row.arr2_coords }
      );

      if (angle === null || angle > 10) continue;

      // Find intersection point
      const intersection = findLineIntersection(dep1, arr1, dep2, arr2);

      if (!intersection) continue;

      // Calculate distances from intersection to departure and arrival points
      const flight1DepDist = calculateDistance(dep1.lat, dep1.lon, intersection.lat, intersection.lon);
      const flight1ArrDist = calculateDistance(intersection.lat, intersection.lon, arr1.lat, arr1.lon);
      const flight2DepDist = calculateDistance(dep2.lat, dep2.lon, intersection.lat, intersection.lon);
      const flight2ArrDist = calculateDistance(intersection.lat, intersection.lon, arr2.lat, arr2.lon);

      // Calculate time each flight will be at intersection
      const flight1TimeAtIntersection = calculateTimeAtIntersection(
        row.flight1_dep_time,
        row.flight1_arr_time,
        intersection.t1
      );

      const flight2TimeAtIntersection = calculateTimeAtIntersection(
        row.flight2_dep_time,
        row.flight2_arr_time,
        intersection.t2
      );

      // Check if flights are at intersection within 1 hour of each other
      if (withinHours(flight1TimeAtIntersection, flight2TimeAtIntersection, 1)) {
        const timeDiffMinutes = Math.abs(
          new Date(flight1TimeAtIntersection).getTime() - 
          new Date(flight2TimeAtIntersection).getTime()
        ) / (1000 * 60);

        console.log(`✓ Valid pair found: ${row.flight1_no} and ${row.flight2_no} - Time diff: ${timeDiffMinutes.toFixed(2)} min, Angle: ${angle.toFixed(2)}°`);

        intersectingPairs.push({
          flight1: {
            id: row.flight1_id,
            number: row.flight1_no,
            departure_airport: row.flight1_dep,
            arrival_airport: row.flight1_arr,
            scheduled_departure: row.flight1_dep_time,
            scheduled_arrival: row.flight1_arr_time,
            time_at_intersection: flight1TimeAtIntersection.toISOString(),
            distance_to_intersection_km: flight1DepDist.toFixed(2),
            distance_from_intersection_km: flight1ArrDist.toFixed(2)
          },
          flight2: {
            id: row.flight2_id,
            number: row.flight2_no,
            departure_airport: row.flight2_dep,
            arrival_airport: row.flight2_arr,
            scheduled_departure: row.flight2_dep_time,
            scheduled_arrival: row.flight2_arr_time,
            time_at_intersection: flight2TimeAtIntersection.toISOString(),
            distance_to_intersection_km: flight2DepDist.toFixed(2),
            distance_from_intersection_km: flight2ArrDist.toFixed(2)
          },
          intersection: {
            latitude: intersection.lat.toFixed(6),
            longitude: intersection.lon.toFixed(6)
          },
          angle_degrees: angle.toFixed(2),
          time_difference_minutes: timeDiffMinutes.toFixed(2)
        });
      }
    }

    // Write results to CSV file
    const csvFilePath = path.join(process.cwd(), 'intersects.csv');
    const csvHeader = 'Flight1_Number,Flight1_Departure,Flight1_Arrival,Flight1_Time_At_Intersection,Flight2_Number,Flight2_Departure,Flight2_Arrival,Flight2_Time_At_Intersection,Intersection_Lat,Intersection_Lon,Angle_Degrees,Time_Difference_Minutes\n';
    
    const csvRows = intersectingPairs.map(pair => {
      return [
        pair.flight1.number,
        pair.flight1.departure_airport,
        pair.flight1.arrival_airport,
        pair.flight1.time_at_intersection,
        pair.flight2.number,
        pair.flight2.departure_airport,
        pair.flight2.arrival_airport,
        pair.flight2.time_at_intersection,
        pair.intersection.latitude,
        pair.intersection.longitude,
        pair.angle_degrees,
        pair.time_difference_minutes
      ].join(',');
    }).join('\n');

    const csvContent = csvHeader + csvRows;
    
    try {
      fs.writeFileSync(csvFilePath, csvContent, 'utf8');
      console.log(`\n📊 Results saved to ${csvFilePath} (${intersectingPairs.length} pairs)`);
    } catch (writeErr) {
      console.error('Error writing CSV file:', writeErr);
    }

    res.json({
      total_pairs: intersectingPairs.length,
      pairs: intersectingPairs,
      csv_file: csvFilePath
    });
  });
});

// Optimized endpoint - delegates all processing to Python FastAPI service
router.get("/optimal-paths", async (req, res) => {
  console.log("Received request for optimal path calculation");
  
  try {
    // Fetch all flight data with coordinates
    const flightsQuery = `
      SELECT 
        f.flight_id,
        f.flight_no,
        f.departure_airport,
        f.arrival_airport,
        f.scheduled_departure,
        f.scheduled_arrival,
        dep.coordinates as dep_coords,
        arr.coordinates as arr_coords
      FROM flights f
      JOIN airports_data dep ON f.departure_airport = dep.airport_code
      JOIN airports_data arr ON f.arrival_airport = arr.airport_code
      WHERE f.departure_airport != f.arrival_airport
      LIMIT 10000
    `;

    const flights = await new Promise((resolve, reject) => {
      db.all(flightsQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`Fetched ${flights.length} flights from database`);

    // Parse coordinates helper
    const parseCoordinates = (coordStr) => {
      const match = coordStr.match(/\(([^,]+),([^)]+)\)/);
      if (!match) return null;
      return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
    };

    // Transform flight data for Python service
    const rawFlightData = flights.map(flight => {
      const depCoords = parseCoordinates(flight.dep_coords);
      const arrCoords = parseCoordinates(flight.arr_coords);
      
      if (!depCoords || !arrCoords) return null;
      
      return {
        flight_id: flight.flight_id,
        flight_no: flight.flight_no,
        departure_airport: flight.departure_airport,
        arrival_airport: flight.arrival_airport,
        scheduled_departure: flight.scheduled_departure,
        scheduled_arrival: flight.scheduled_arrival,
        dep_lat: depCoords.lat,
        dep_lon: depCoords.lon,
        arr_lat: arrCoords.lat,
        arr_lon: arrCoords.lon
      };
    }).filter(f => f !== null);

    console.log(`Sending ${rawFlightData.length} flights to optimization service`);

    // Call Python FastAPI optimization service with raw flight data
    const optimizationResponse = await fetch(`${OPTIMIZATION_SERVICE_URL}/optimize-from-raw-flights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(rawFlightData)
    });

    if (!optimizationResponse.ok) {
      const errorText = await optimizationResponse.text();
      throw new Error(`Optimization service error: ${errorText}`);
    }

    const result = await optimizationResponse.json();

    // Save results to CSV
    const csvFilePath = path.join(process.cwd(), 'optimal_paths.csv');
    const csvHeader = 'Flight_Number,Departure,Arrival,Original_Distance_km,Optimized_Distance_km,Time_Savings_minutes,Boost_Paths_Used,Waypoints_Count\n';
    
    const csvRows = result.optimized_paths.map(flight => {
      return [
        flight.flight_number,
        flight.departure_airport,
        flight.arrival_airport,
        flight.original_distance.toFixed(2),
        flight.optimized_distance.toFixed(2),
        flight.time_savings.toFixed(2),
        flight.boost_paths_used,
        flight.waypoints.length
      ].join(',');
    }).join('\n');

    fs.writeFileSync(csvFilePath, csvHeader + csvRows, 'utf8');
    console.log(`\n📊 Optimal paths saved to ${csvFilePath}`);
    console.log(`Similar pairs found: ${result.similar_pairs}`);
    console.log(`Intersecting pairs found: ${result.intersecting_pairs}`);
    console.log(`Total flights optimized: ${result.flights_optimized}`);

    res.json({
      total_flights: result.total_flights,
      similar_pairs_found: result.similar_pairs,
      intersecting_pairs_found: result.intersecting_pairs,
      total_pairs: result.total_pairs_found,
      flights_optimized: result.flights_optimized,
      optimized_paths: result.optimized_paths,
      csv_file: csvFilePath
    });

  } catch (error) {
    console.error('Error in optimal-paths endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
