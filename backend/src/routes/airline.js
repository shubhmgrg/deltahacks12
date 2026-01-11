import express from "express";
import { connectDB, getCollection } from "../datastore.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper: Haversine distance in km
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: Calculate path length
function pathLength(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistance(
      coords[i-1][1], coords[i-1][0],
      coords[i][1], coords[i][0]
    );
  }
  return total;
}

// Helper: Find closest point on path to a given point
function closestPointOnPath(targetLat, targetLon, pathCoords) {
  let minDist = Infinity;
  let bestIdx = 0;
  let bestFraction = 0;
  
  for (let i = 0; i < pathCoords.length - 1; i++) {
    const [lon1, lat1] = pathCoords[i];
    const [lon2, lat2] = pathCoords[i + 1];
    
    // Check both segment endpoints and midpoint
    const points = [
      { lat: lat1, lon: lon1, idx: i, frac: 0 },
      { lat: lat2, lon: lon2, idx: i, frac: 1 },
      { lat: (lat1 + lat2) / 2, lon: (lon1 + lon2) / 2, idx: i, frac: 0.5 }
    ];
    
    for (const pt of points) {
      const dist = haversineDistance(targetLat, targetLon, pt.lat, pt.lon);
      if (dist < minDist) {
        minDist = dist;
        bestIdx = pt.idx;
        bestFraction = pt.frac;
      }
    }
  }
  
  return { segmentIdx: bestIdx, fraction: bestFraction, distance: minDist };
}

// Helper: Calculate formation overlap and detour
// Formation occurs when both planes are within half the detour distance from the middle line
function calculateFormationMetrics(flight1Coords, flight1Times, flight2Coords, flight2Times, maxDetourKm) {
  if (flight1Coords.length < 2 || flight2Coords.length < 2) {
    return null;
  }
  
  const halfDetour = maxDetourKm / 2;
  const formationSegments = [];
  let inFormation = false;
  let formationStart1 = -1;
  let formationStart2 = -1;
  
  // For each point on flight1, find the closest point on flight2 and check formation condition
  for (let i = 0; i < flight1Coords.length; i++) {
    const [lon1, lat1] = flight1Coords[i];
    const closest = closestPointOnPath(lat1, lon1, flight2Coords);
    
    // Get the closest point coordinates on flight2
    const segIdx = closest.segmentIdx;
    const frac = closest.fraction;
    const [lon2a, lat2a] = flight2Coords[segIdx];
    const [lon2b, lat2b] = flight2Coords[Math.min(segIdx + 1, flight2Coords.length - 1)];
    
    // Interpolate to get the exact closest point
    const lon2 = lon2a + (lon2b - lon2a) * frac;
    const lat2 = lat2a + (lat2b - lat2a) * frac;
    
    // Calculate middle point between the two positions
    const midLon = (lon1 + lon2) / 2;
    const midLat = (lat1 + lat2) / 2;
    
    // Calculate distance from each plane to the middle point
    const dist1ToMid = haversineDistance(lat1, lon1, midLat, midLon);
    const dist2ToMid = haversineDistance(lat2, lon2, midLat, midLon);
    
    // Formation occurs when both planes are within half the detour distance from the middle line
    const bothWithinThreshold = (dist1ToMid <= halfDetour) && (dist2ToMid <= halfDetour);
    
    if (bothWithinThreshold) {
      if (!inFormation) {
        // Start of formation segment
        inFormation = true;
        formationStart1 = i;
        formationStart2 = segIdx;
      }
    } else {
      if (inFormation) {
        // End of formation segment
        formationSegments.push({
          start1: formationStart1,
          end1: i - 1,
          start2: formationStart2,
          end2: segIdx
        });
        inFormation = false;
      }
    }
  }
  
  // Handle case where formation extends to end
  if (inFormation) {
    formationSegments.push({
      start1: formationStart1,
      end1: flight1Coords.length - 1,
      start2: formationStart2,
      end2: flight2Coords.length - 1
    });
  }
  
  if (formationSegments.length === 0) {
    return null;
  }
  
  // Use the longest formation segment
  let longestSegment = formationSegments[0];
  let maxDuration = 0;
  
  for (const seg of formationSegments) {
    const duration = flight1Times[seg.end1] - flight1Times[seg.start1];
    if (duration > maxDuration) {
      maxDuration = duration;
      longestSegment = seg;
    }
  }
  
  // Calculate metrics for longest segment
  const formationCoords1 = flight1Coords.slice(longestSegment.start1, longestSegment.end1 + 1);
  const formationCoords2 = flight2Coords.slice(longestSegment.start2, longestSegment.end2 + 1);
  
  const formationDist1 = pathLength(formationCoords1);
  const formationDist2 = pathLength(formationCoords2);
  const avgFormationDist = (formationDist1 + formationDist2) / 2;
  
  // Calculate direct distance between start and end of formation (using midpoint line)
  const startMidLon = (formationCoords1[0][0] + formationCoords2[0][0]) / 2;
  const startMidLat = (formationCoords1[0][1] + formationCoords2[0][1]) / 2;
  const endMidLon = (formationCoords1[formationCoords1.length - 1][0] + formationCoords2[formationCoords2.length - 1][0]) / 2;
  const endMidLat = (formationCoords1[formationCoords1.length - 1][1] + formationCoords2[formationCoords2.length - 1][1]) / 2;
  
  const directDist = haversineDistance(startMidLat, startMidLon, endMidLat, endMidLon);
  
  const detourKm = avgFormationDist - directDist;
  const detourPercent = directDist > 0 ? (detourKm / directDist) * 100 : 0;
  
  // Calculate duration in minutes
  const durationMs = flight1Times[longestSegment.end1] - flight1Times[longestSegment.start1];
  const durationMinutes = durationMs / 60000;
  
  return {
    detourKm,
    detourPercent,
    durationMinutes,
    formationDistKm: avgFormationDist,
    segment: longestSegment
  };
}


router.get("/formation-pairs", async (req, res) => {
  try {
    const tolerance = parseFloat(req.query.tolerance) || 1500;
    const maxTimeApart = parseFloat(req.query.maxTimeApart) || 36000;
    const maxDetourKm = parseFloat(req.query.maxDetour) || 50; // km
    const minDurationMin = parseFloat(req.query.minDuration) || 30; // minutes
    const limit = parseInt(req.query.limit) || 100;

    await connectDB();
    const airlinesCol = getCollection("airlines");
    const nodesCol = getCollection("flight_nodes");

    // Filter by Angle and Time
    // Note: angle_diff and time_gap_minutes are stored as strings in DB (from .toFixed(2))
    // We need to convert them to numbers for comparison using $expr
    const query = {
      $expr: {
        $and: [
          { $lte: [{ $toDouble: "$angle_diff" }, tolerance] },
          { $lte: [{ $toDouble: "$time_gap_minutes" }, maxTimeApart] }
        ]
      }
    };

    // Log the actual query being sent to MongoDB
    console.log("DB Query:", JSON.stringify(query, null, 2));

    // Fetch initial filtered pairs (more than limit to allow for further filtering)
    const initialPairs = await airlinesCol.find(query).limit(limit * 3).toArray();

    console.log(`Found ${initialPairs.length} pairs matching angle/time criteria.`);
    console.log(`Now calculating detour and duration for detailed filtering...`);

    // Process each pair to calculate detour and duration
    const enrichedPairs = [];
    let processed = 0;
    
    for (const pair of initialPairs) {
      try {
        // Fetch flight tailnums (labels)
        const flight1Info = await nodesCol.findOne({ flight_id: pair.flight1_id }, { projection: { tailnum: 1, _id: 0 } });
        const flight2Info = await nodesCol.findOne({ flight_id: pair.flight2_id }, { projection: { tailnum: 1, _id: 0 } });
        
        const flight1Label = flight1Info?.tailnum || pair.flight1_id;
        const flight2Label = flight2Info?.tailnum || pair.flight2_id;
        
        // Fetch flight paths from nodes
        const nodes1 = await nodesCol.find({ flight_id: pair.flight1_id })
          .sort({ timestamp: 1 })
          .project({ lat: 1, lon: 1, timestamp: 1, _id: 0 })
          .toArray();
          
        const nodes2 = await nodesCol.find({ flight_id: pair.flight2_id })
          .sort({ timestamp: 1 })
          .project({ lat: 1, lon: 1, timestamp: 1, _id: 0 })
          .toArray();

        if (nodes1.length < 2 || nodes2.length < 2) continue;

        // Convert to coords and times arrays
        const coords1 = nodes1.map(n => [n.lon, n.lat]);
        const times1 = nodes1.map(n => new Date(n.timestamp).getTime());
        const coords2 = nodes2.map(n => [n.lon, n.lat]);
        const times2 = nodes2.map(n => new Date(n.timestamp).getTime());

        // Calculate formation metrics
        const metrics = calculateFormationMetrics(coords1, times1, coords2, times2, maxDetourKm);

        if (!metrics) continue;

        // Apply detour and duration filters
        if (metrics.detourKm > maxDetourKm) continue;
        if (metrics.durationMinutes < minDurationMin) continue;

        // Randomly choose leader (0 = flight1, 1 = flight2)
        const isLeader1 = Math.random() < 0.5;
        
        // Get coordinates and times for leader and follower
        const leaderCoords = isLeader1 ? coords1 : coords2;
        const leaderTimes = isLeader1 ? times1 : times2;
        const leaderNodes = isLeader1 ? nodes1 : nodes2;
        const leaderLabel = isLeader1 ? flight1Label : flight2Label;
        const leaderSegmentStart = isLeader1 ? metrics.segment.start1 : metrics.segment.start2;
        const leaderSegmentEnd = isLeader1 ? metrics.segment.end1 : metrics.segment.end2;
        
        const followerCoords = isLeader1 ? coords2 : coords1;
        const followerTimes = isLeader1 ? times2 : times1;
        const followerNodes = isLeader1 ? nodes2 : nodes1;
        const followerLabel = isLeader1 ? flight2Label : flight1Label;
        const followerSegmentStart = isLeader1 ? metrics.segment.start2 : metrics.segment.start1;
        const followerSegmentEnd = isLeader1 ? metrics.segment.end2 : metrics.segment.end1;

        // Create 4 key points for leader: [start, join, split, end]
        const leaderPoints = [
          {
            lat: leaderCoords[0][1],
            lon: leaderCoords[0][0],
            time: new Date(leaderTimes[0]).toISOString()
          },
          {
            lat: leaderCoords[leaderSegmentStart][1],
            lon: leaderCoords[leaderSegmentStart][0],
            time: new Date(leaderTimes[leaderSegmentStart]).toISOString()
          },
          {
            lat: leaderCoords[leaderSegmentEnd][1],
            lon: leaderCoords[leaderSegmentEnd][0],
            time: new Date(leaderTimes[leaderSegmentEnd]).toISOString()
          },
          {
            lat: leaderCoords[leaderCoords.length - 1][1],
            lon: leaderCoords[leaderCoords.length - 1][0],
            time: new Date(leaderTimes[leaderTimes.length - 1]).toISOString()
          }
        ];

        // Create 4 key points for follower: [start, join, split, end]
        const followerPoints = [
          {
            lat: followerCoords[0][1],
            lon: followerCoords[0][0],
            time: new Date(followerTimes[0]).toISOString()
          },
          {
            lat: followerCoords[followerSegmentStart][1],
            lon: followerCoords[followerSegmentStart][0],
            time: new Date(followerTimes[followerSegmentStart]).toISOString()
          },
          {
            lat: followerCoords[followerSegmentEnd][1],
            lon: followerCoords[followerSegmentEnd][0],
            time: new Date(followerTimes[followerSegmentEnd]).toISOString()
          },
          {
            lat: followerCoords[followerCoords.length - 1][1],
            lon: followerCoords[followerCoords.length - 1][0],
            time: new Date(followerTimes[followerTimes.length - 1]).toISOString()
          }
        ];

        // Full tracked points for both flights
        const leaderTracked = leaderNodes.map(n => ({
          lat: n.lat,
          lon: n.lon,
          time: n.timestamp
        }));

        const followerTracked = followerNodes.map(n => ({
          lat: n.lat,
          lon: n.lon,
          time: n.timestamp
        }));

        // Get joining and splitting points (based on leader)
        const joiningPoint = {
          lat: leaderCoords[leaderSegmentStart][1],
          lon: leaderCoords[leaderSegmentStart][0],
          timestamp: new Date(leaderTimes[leaderSegmentStart])
        };
        
        const splittingPoint = {
          lat: leaderCoords[leaderSegmentEnd][1],
          lon: leaderCoords[leaderSegmentEnd][0],
          timestamp: new Date(leaderTimes[leaderSegmentEnd])
        };

        // Get start and end points for each original flight
        const flight1Start = {
          lat: coords1[0][1],
          lon: coords1[0][0],
          timestamp: new Date(times1[0])
        };
        
        const flight1End = {
          lat: coords1[coords1.length - 1][1],
          lon: coords1[coords1.length - 1][0],
          timestamp: new Date(times1[times1.length - 1])
        };
        
        const flight2Start = {
          lat: coords2[0][1],
          lon: coords2[0][0],
          timestamp: new Date(times2[0])
        };
        
        const flight2End = {
          lat: coords2[coords2.length - 1][1],
          lon: coords2[coords2.length - 1][0],
          timestamp: new Date(times2[times2.length - 1])
        };

        enrichedPairs.push({
          ...pair,
          flight1_label: flight1Label,
          flight2_label: flight2Label,
          detour_km: parseFloat(metrics.detourKm.toFixed(2)),
          detour_percent: parseFloat(metrics.detourPercent.toFixed(2)),
          overlap_duration_min: parseFloat(metrics.durationMinutes.toFixed(2)),
          formation_distance_km: parseFloat(metrics.formationDistKm.toFixed(2)),
          joining_point: joiningPoint,
          splitting_point: splittingPoint,
          flight1_start: flight1Start,
          flight1_end: flight1End,
          flight2_start: flight2Start,
          flight2_end: flight2End,
          // Add scenario data
          scenario: {
            id: `pair_${pair.flight1_id}_${pair.flight2_id}`,
            leader: {
              label: leaderLabel,
              points: leaderPoints,
              tracked: leaderTracked
            },
            follower: {
              label: followerLabel,
              points: followerPoints,
              tracked: followerTracked
            },
            joinIndex: 1, // Index 1 is the joining point in the 4-point array
            splitIndex: 2, // Index 2 is the splitting point in the 4-point array
            formation: {
              startTime: joiningPoint.timestamp,
              endTime: splittingPoint.timestamp,
              durationMinutes: parseFloat(metrics.durationMinutes.toFixed(2))
            },
            metrics: {
              fuelSaved: Math.round(parseFloat(metrics.durationMinutes.toFixed(2)) * 3.8),
              co2Saved: Math.round(parseFloat(metrics.durationMinutes.toFixed(2)) * 12),
              detourKm: parseFloat(metrics.detourKm.toFixed(2))
            }
          }
        });

        processed++;
        if (processed % 10 === 0) {
          console.log(`Processed ${processed}/${initialPairs.length} pairs...`);
        }

        // Stop once we have enough valid pairs
        if (enrichedPairs.length >= limit) break;
        
      } catch (err) {
        console.error(`Error processing pair ${pair.flight1_id}-${pair.flight2_id}:`, err.message);
        continue;
      }
    }

    console.log(`Final count: ${enrichedPairs.length} pairs after detour/duration filtering.`);

    // Extract scenarios and write to frontend scenarios.json
    const scenarios = enrichedPairs.map(p => p.scenario).filter(s => s);
    
    if (scenarios.length > 0) {
      try {
        const frontendScenariosPath = path.join(__dirname, '../../../frontend/src/data/scenarios.json');
        fs.writeFileSync(frontendScenariosPath, JSON.stringify(scenarios, null, 2), 'utf-8');
        console.log(`Wrote ${scenarios.length} scenarios to frontend/src/data/scenarios.json`);
      } catch (err) {
        console.error('Error writing frontend scenarios.json:', err);
      }
    }

    res.json({
      filter: { 
        tolerance, 
        maxTimeApart, 
        maxDetourKm, 
        minDurationMin 
      },
      count: enrichedPairs.length,
      pairs: enrichedPairs
    });

  } catch (err) {
    console.error("Error in GET /formation-pairs:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /prepare-paths
 * Aggregates flight_nodes into flight_paths collection with LineString geometry.
 * Creates 2dsphere index.
 */
router.post("/prepare-paths", async (req, res) => {
  try {
    await connectDB();
    const nodesCol = getCollection("flight_nodes");
    const pathsCol = getCollection("flight_paths");

    console.log("aggregating flight paths...");
    // Clear existing paths to rebuild
    await pathsCol.deleteMany({});

    // Aggregate nodes to build paths
    const cursor = nodesCol.aggregate([
      // Sort by time
      { $sort: { "flight_id": 1, "timestamp": 1 } },
      // Group by flight
      {
        $group: {
          _id: "$flight_id",
          coordinates: { $push: "$location.coordinates" },
          times: { $push: "$timestamp" },
          // Capture start and end metadata
          startParams: {
            $first: {
              lat: "$lat",
              lon: "$lon",
              timestamp: "$timestamp",
              airport: "$origin"
            }
          },
          endParams: {
            $last: {
              lat: "$lat",
              lon: "$lon",
              timestamp: "$timestamp",
              airport: "$dest"
            }
          }
        }
      },
      // Filter out single-point flights
      {
        $match: {
          $expr: { $gt: [{ $size: "$coordinates" }, 1] }
        }
      }
    ]);

    let count = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();

      // Construct GeoJSON LineString
      // Note: MongoDB GeoJSON coordinates are [lon, lat]
      const lineString = {
        type: "LineString",
        coordinates: doc.coordinates
      };

      await pathsCol.insertOne({
        flight_id: doc._id,
        geometry: lineString,
        times: doc.times,
        start: doc.startParams,
        end: doc.endParams
      });
      count++;
      if (count % 100 === 0) console.log(`Processed ${count} flights...`);
    }

    console.log(`Created ${count} flight paths. Creating index...`);
    await pathsCol.createIndex({ geometry: "2dsphere" });
    console.log("Index created.");

    res.json({ success: true, count });
  } catch (err) {
    console.error("Error in prepare-paths:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
