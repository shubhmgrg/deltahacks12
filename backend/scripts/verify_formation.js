
import { connectDB, getCollection } from "../src/datastore.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

console.log("Script execution started.");
console.time("Total Execution Time");

async function run() {
    try {
        console.log("Connecting to DB...");
        await connectDB();
        const nodesCol = getCollection("flight_nodes");
        const airlinesCol = getCollection("airlines");

        console.log("--- Space-Time Bucketing (Nodes Stream) + Intersection Calc ---");

        // Hyperparameters
        const GRID_DEG = 4.5;      // ~500km
        const TIME_BIN_HRS = 6.0;  // 6 Hour Time Bins
        const TIME_BIN_MS = TIME_BIN_HRS * 3600 * 1000;
        const ANGLE_TOLERANCE = 15;
        const MAX_TIME_GAP_MIN = 360;
        const MAX_PAIRS_LIMIT = 50000;

        // Clear Collection First
        console.log("Clearing airlines collection...");
        await airlinesCol.deleteMany({});

        // Ensure Index for fast sorting and querying
        console.log("Ensuring compound index on flight_nodes...");
        await nodesCol.createIndex({ flight_id: 1, timestamp: 1 });

        // Data Structures
        const buckets = new Map();
        const flightMeta = new Map();

        console.log("Streaming flight nodes...");
        // Optimized Sort with Projection
        const cursor = nodesCol.find({}, {
            projection: { flight_id: 1, timestamp: 1, lat: 1, lon: 1, _id: 0 }
        }).sort({ flight_id: 1, timestamp: 1 });

        let processedFlights = 0;
        let currentFlightId = null;
        let currentNodes = [];

        // Processor for a complete flight
        const indexFlight = (fid, nodes) => {
            if (nodes.length < 2) return;

            // Extract Arrays for easier math later
            const coords = nodes.map(n => [n.lon, n.lat]);
            const times = nodes.map(n => new Date(n.timestamp).getTime());

            const startNode = nodes[0];
            const endNode = nodes[nodes.length - 1];

            // Store Full Data for Intersection Checks
            flightMeta.set(fid, {
                id: fid,
                start: { lat: startNode.lat, lon: startNode.lon, timestamp: startNode.timestamp },
                end: { lat: endNode.lat, lon: endNode.lon, timestamp: endNode.timestamp },
                coords: coords,
                times: times
            });

            const flightBuckets = new Set();

            // Hash nodes to buckets
            // Optimization: Step to avoid hashing every single point if path is dense
            let step = Math.max(1, Math.floor(nodes.length / 50));

            for (let i = 0; i < nodes.length; i += step) {
                const t = new Date(nodes[i].timestamp).getTime();
                const latIdx = Math.floor(nodes[i].lat / GRID_DEG);
                const lonIdx = Math.floor(nodes[i].lon / GRID_DEG);
                const timeIdx = Math.floor(t / TIME_BIN_MS);
                flightBuckets.add(`${latIdx}_${lonIdx}_${timeIdx}`);
            }
            // Always add start/end
            const addP = (idx) => {
                const t = new Date(nodes[idx].timestamp).getTime();
                const latIdx = Math.floor(nodes[idx].lat / GRID_DEG);
                const lonIdx = Math.floor(nodes[idx].lon / GRID_DEG);
                const timeIdx = Math.floor(t / TIME_BIN_MS);
                flightBuckets.add(`${latIdx}_${lonIdx}_${timeIdx}`);
            }
            addP(0);
            addP(nodes.length - 1);

            for (const key of flightBuckets) {
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(fid);
            }
            processedFlights++;
            if (processedFlights % 2000 === 0) {
                process.stdout.write(`\rProcessed ${processedFlights} flights...`);
            }
        };

        while (await cursor.hasNext()) {
            const node = await cursor.next();

            // Ensure Type Consistency
            if (node.flight_id !== currentFlightId) {
                if (currentFlightId !== null) {
                    indexFlight(currentFlightId, currentNodes);
                }
                currentFlightId = node.flight_id;
                currentNodes = [];
            }
            currentNodes.push(node);
        }
        // Last one
        if (currentFlightId !== null) indexFlight(currentFlightId, currentNodes);

        console.log(`\nProcessed ${processedFlights} flights.`);
        console.log(`Total active Space-Time Buckets: ${buckets.size}`);

        // Helpers
        const toRad = (deg) => deg * Math.PI / 180;
        const toDeg = (rad) => rad * 180 / Math.PI;
        function calculateBearing(lat1, lon1, lat2, lon2) {
            const dLon = toRad(lon2 - lon1);
            const phi1 = toRad(lat1);
            const phi2 = toRad(lat2);
            const y = Math.sin(dLon) * Math.cos(phi2);
            const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
            return (toDeg(Math.atan2(y, x)) + 360) % 360;
        }
        function isAngleValid(b1, b2, tol) {
            const diff = Math.abs(b1 - b2);
            const minDiff = Math.min(diff, 360 - diff);
            return minDiff <= tol;
        }
        function getLineIntersection(p0_x, p0_y, p1_x, p1_y, p2_x, p2_y, p3_x, p3_y) {
            const s1_x = p1_x - p0_x;
            const s1_y = p1_y - p0_y;
            const s2_x = p3_x - p2_x;
            const s2_y = p3_y - p2_y;
            const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y);
            const t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y);
            if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
                return {
                    x: p0_x + (t * s1_x),
                    y: p0_y + (t * s1_y),
                    fractionT: t, // Fraction along seg1
                    fractionS: s  // Fraction along seg2
                };
            }
            return null;
        }

        console.log("Finding pairs & calculating intersections...");

        const candidates = new Set();
        const pairsToSave = [];

        for (const [key, ids] of buckets) {
            if (ids.length < 2) continue;

            for (let i = 0; i < ids.length; i++) {
                for (let j = i + 1; j < ids.length; j++) {
                    const id1 = ids[i];
                    const id2 = ids[j];

                    let a, b;
                    if (String(id1) < String(id2)) { a = id1; b = id2; }
                    else { a = id2; b = id1; }

                    const pairKey = `${a}_${b}`;
                    if (candidates.has(pairKey)) continue;
                    candidates.add(pairKey);

                    const f1 = flightMeta.get(a);
                    const f2 = flightMeta.get(b);
                    if (!f1 || !f2) continue;

                    // 1. Angle Check
                    const b1 = calculateBearing(f1.start.lat, f1.start.lon, f1.end.lat, f1.end.lon);
                    const b2 = calculateBearing(f2.start.lat, f2.start.lon, f2.end.lat, f2.end.lon);

                    if (!isAngleValid(b1, b2, ANGLE_TOLERANCE)) continue;

                    // 2. Intersection Check
                    let intersectPt = null;
                    let intersectTime1 = 0;
                    let intersectTime2 = 0;
                    let foundInter = false;

                    const c1 = f1.coords;
                    const c2 = f2.coords;

                    // Segment Loop
                    search:
                    for (let k = 0; k < c1.length - 1; k++) {
                        const lon1a = c1[k][0], lat1a = c1[k][1];
                        const lon1b = c1[k + 1][0], lat1b = c1[k + 1][1];

                        for (let m = 0; m < c2.length - 1; m++) {
                            const lon2a = c2[m][0], lat2a = c2[m][1];
                            const lon2b = c2[m + 1][0], lat2b = c2[m + 1][1];

                            // BBox Check
                            if (Math.max(lon1a, lon1b) < Math.min(lon2a, lon2b) ||
                                Math.min(lon1a, lon1b) > Math.max(lon2a, lon2b) ||
                                Math.max(lat1a, lat1b) < Math.min(lat2a, lat2b) ||
                                Math.min(lat1a, lat1b) > Math.max(lat2a, lat2b)) {
                                continue;
                            }

                            const res = getLineIntersection(lon1a, lat1a, lon1b, lat1b, lon2a, lat2a, lon2b, lat2b);
                            if (res) {
                                intersectPt = { lat: res.y, lon: res.x };

                                // Interpolate using fraction
                                const t1a = f1.times[k];
                                const t1b = f1.times[k + 1];
                                intersectTime1 = t1a + (res.fractionT * (t1b - t1a));

                                const t2a = f2.times[m];
                                const t2b = f2.times[m + 1];
                                intersectTime2 = t2a + (res.fractionS * (t2b - t2a));

                                foundInter = true;
                                break search;
                            }
                        }
                    }

                    if (!foundInter) continue;

                    // 3. Time Gap at Intersection
                    const timeGapMs = Math.abs(intersectTime1 - intersectTime2);
                    const timeGapMin = timeGapMs / 60000;

                    if (timeGapMin > MAX_TIME_GAP_MIN) continue;

                    pairsToSave.push({
                        flight1_id: a,
                        flight2_id: b,
                        angle_diff: Math.abs(b1 - b2).toFixed(2),
                        time_gap_minutes: timeGapMin.toFixed(2),
                        intersection_point: intersectPt,
                        intersect_time_1: new Date(intersectTime1),
                        intersect_time_2: new Date(intersectTime2),
                        created_at: new Date()
                    });
                }
            }
            if (pairsToSave.length >= MAX_PAIRS_LIMIT) {
                console.log("Hit safety limit.");
                break;
            }
        }

        console.log(`Found ${pairsToSave.length} valid pairs with intersections.`);

        if (pairsToSave.length > 0) {
            console.log("Saving to DB...");
            const BATCH = 1000;
            for (let i = 0; i < pairsToSave.length; i += BATCH) {
                await airlinesCol.insertMany(pairsToSave.slice(i, i + BATCH));
                if (i % 5000 === 0 && i > 0) process.stdout.write(`\rSaved ${i} pairs...`);
            }
            console.log("\nSave complete.");
        }

        console.timeEnd("Total Execution Time");
        process.exit(0);

    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

run();
