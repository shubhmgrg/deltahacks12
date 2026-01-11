import express from "express";
import { connectDB, getCollection } from "../datastore.js";
import fs from "fs";
import path from "path";

const router = express.Router();

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

router.get("/similar-flight-pairs", async (req, res) => {
  try {
    console.log("Received request for similar flight pairs");
    
    await connectDB();
    const flightsCol = getCollection("flights");
    const airportsCol = getCollection("airports");
    
    // Get flights with different departure and arrival airports
    const flights = await flightsCol
      .find({ 
        $expr: { $ne: ["$departure_airport", "$arrival_airport"] }
      })
      .limit(1000)
      .toArray();
    
    // Get airport coordinates
    const airports = await airportsCol.find({}).toArray();
    const airportMap = new Map(airports.map(a => [a.code || a.airport_code, a]));
    
    // Filter results based on angle and time constraints
    const matchingPairs = [];

    // Compare all flight pairs
    for (let i = 0; i < flights.length; i++) {
      const f1 = flights[i];
      const dep1 = airportMap.get(f1.departure_airport);
      const arr1 = airportMap.get(f1.arrival_airport);
      
      if (!dep1 || !arr1) continue;
      
      for (let j = i + 1; j < flights.length; j++) {
        const f2 = flights[j];
        const dep2 = airportMap.get(f2.departure_airport);
        const arr2 = airportMap.get(f2.arrival_airport);
        
        if (!dep2 || !arr2) continue;
        
        // Check if they share departure or arrival airport
        const sameDeparture = f1.departure_airport === f2.departure_airport;
        const sameArrival = f1.arrival_airport === f2.arrival_airport;
        
        if (!sameDeparture && !sameArrival) continue;
        if (sameDeparture && sameArrival) continue;
        
        // Get coordinates (support both formats)
        const getCoords = (airport) => {
          if (airport.coordinates) {
            // Format: "(lat,lon)"
            const match = airport.coordinates.match(/\(([^,]+),([^)]+)\)/);
            if (match) return `(${match[1]},${match[2]})`;
          }
          if (airport.latitude && airport.longitude) {
            return `(${airport.latitude},${airport.longitude})`;
          }
          if (airport.lat && airport.lon) {
            return `(${airport.lat},${airport.lon})`;
          }
          return null;
        };
        
        const dep1Coords = getCoords(dep1);
        const arr1Coords = getCoords(arr1);
        const dep2Coords = getCoords(dep2);
        const arr2Coords = getCoords(arr2);
        
        if (!dep1Coords || !arr1Coords || !dep2Coords || !arr2Coords) continue;
        
        const angle = calculateAngleBetweenPaths(
          { dep_coords: dep1Coords, arr_coords: arr1Coords },
          { dep_coords: dep2Coords, arr_coords: arr2Coords }
        );

        if (angle === null || angle > 45) continue;

        // Check time constraints
        let timeValid = false;
        if (sameDeparture && withinThreeHours(f1.scheduled_departure, f2.scheduled_departure)) {
          timeValid = true;
        }
        if (sameArrival && withinThreeHours(f1.scheduled_arrival, f2.scheduled_arrival)) {
          timeValid = true;
        }

        if (timeValid) {
          matchingPairs.push({
            flight1: {
              id: f1._id?.toString() || f1.flight_id,
              number: f1.flight_no,
              departure_airport: f1.departure_airport,
              arrival_airport: f1.arrival_airport,
              scheduled_departure: f1.scheduled_departure,
              scheduled_arrival: f1.scheduled_arrival
            },
            flight2: {
              id: f2._id?.toString() || f2.flight_id,
              number: f2.flight_no,
              departure_airport: f2.departure_airport,
              arrival_airport: f2.arrival_airport,
              scheduled_departure: f2.scheduled_departure,
              scheduled_arrival: f2.scheduled_arrival
            },
            angle_degrees: angle.toFixed(2),
            same_departure: sameDeparture,
            same_arrival: sameArrival
          });
        }
      }
    }

    res.json({
      total_pairs: matchingPairs.length,
      pairs: matchingPairs
    });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/intersecting-flights", async (req, res) => {
  try {
    console.log("Received request for intersecting flight pairs");
    
    await connectDB();
    const flightsCol = getCollection("flights");
    const airportsCol = getCollection("airports");
    
    // Get flights with different departure and arrival airports
    const flights = await flightsCol
      .find({ 
        $expr: { $ne: ["$departure_airport", "$arrival_airport"] }
      })
      .limit(30000)
      .toArray();
    
    // Get airport coordinates
    const airports = await airportsCol.find({}).toArray();
    const airportMap = new Map(airports.map(a => [a.code || a.airport_code, a]));

    const parseCoordinates = (coordStr) => {
      const match = coordStr.match(/\(([^,]+),([^)]+)\)/);
      if (!match) return null;
      return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
    };
    
    const getCoords = (airport) => {
      if (airport.coordinates) {
        const match = airport.coordinates.match(/\(([^,]+),([^)]+)\)/);
        if (match) return `(${match[1]},${match[2]})`;
      }
      if (airport.latitude && airport.longitude) {
        return `(${airport.latitude},${airport.longitude})`;
      }
      if (airport.lat && airport.lon) {
        return `(${airport.lat},${airport.lon})`;
      }
      return null;
    };

    const intersectingPairs = [];

    // Compare all flight pairs
    for (let i = 0; i < flights.length; i++) {
      const f1 = flights[i];
      const dep1Airport = airportMap.get(f1.departure_airport);
      const arr1Airport = airportMap.get(f1.arrival_airport);
      
      if (!dep1Airport || !arr1Airport) continue;
      
      // Skip if same departure and arrival
      if (f1.departure_airport === f1.arrival_airport) continue;
      
      const dep1Coords = getCoords(dep1Airport);
      const arr1Coords = getCoords(arr1Airport);
      if (!dep1Coords || !arr1Coords) continue;
      
      const dep1 = parseCoordinates(dep1Coords);
      const arr1 = parseCoordinates(arr1Coords);
      if (!dep1 || !arr1) continue;
      
      for (let j = i + 1; j < flights.length; j++) {
        const f2 = flights[j];
        const dep2Airport = airportMap.get(f2.departure_airport);
        const arr2Airport = airportMap.get(f2.arrival_airport);
        
        if (!dep2Airport || !arr2Airport) continue;
        
        // Skip if same departure and arrival
        if (f2.departure_airport === f2.arrival_airport) continue;
        
        // Skip if flights share departure or arrival
        if (f1.departure_airport === f2.departure_airport) continue;
        if (f1.arrival_airport === f2.arrival_airport) continue;
        
        const dep2Coords = getCoords(dep2Airport);
        const arr2Coords = getCoords(arr2Airport);
        if (!dep2Coords || !arr2Coords) continue;
        
        const dep2 = parseCoordinates(dep2Coords);
        const arr2 = parseCoordinates(arr2Coords);
        if (!dep2 || !arr2) continue;

        // Calculate angle between paths first
        const angle = calculateAngleBetweenPaths(
          { dep_coords: dep1Coords, arr_coords: arr1Coords },
          { dep_coords: dep2Coords, arr_coords: arr2Coords }
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
          f1.scheduled_departure,
          f1.scheduled_arrival,
          intersection.t1
        );

        const flight2TimeAtIntersection = calculateTimeAtIntersection(
          f2.scheduled_departure,
          f2.scheduled_arrival,
          intersection.t2
        );

        // Check if flights are at intersection within 1 hour of each other
        if (withinHours(flight1TimeAtIntersection, flight2TimeAtIntersection, 1)) {
          const timeDiffMinutes = Math.abs(
            new Date(flight1TimeAtIntersection).getTime() - 
            new Date(flight2TimeAtIntersection).getTime()
          ) / (1000 * 60);

          console.log(`✓ Valid pair found: ${f1.flight_no} and ${f2.flight_no} - Time diff: ${timeDiffMinutes.toFixed(2)} min, Angle: ${angle.toFixed(2)}°`);

          intersectingPairs.push({
            flight1: {
              id: f1._id?.toString() || f1.flight_id,
              number: f1.flight_no,
              departure_airport: f1.departure_airport,
              arrival_airport: f1.arrival_airport,
              scheduled_departure: f1.scheduled_departure,
              scheduled_arrival: f1.scheduled_arrival,
              time_at_intersection: flight1TimeAtIntersection.toISOString(),
              distance_to_intersection_km: flight1DepDist.toFixed(2),
              distance_from_intersection_km: flight1ArrDist.toFixed(2)
            },
            flight2: {
              id: f2._id?.toString() || f2.flight_id,
              number: f2.flight_no,
              departure_airport: f2.departure_airport,
              arrival_airport: f2.arrival_airport,
              scheduled_departure: f2.scheduled_departure,
              scheduled_arrival: f2.scheduled_arrival,
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
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
