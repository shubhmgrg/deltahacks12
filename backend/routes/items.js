import { ObjectId } from "mongodb";
import express from "express";
import { connectDB, getCollection } from "../datastore.js";

export const itemsRouter = express.Router();
const COLLECTION = "items";

function isValidObjectId(id) {
  return typeof id === "string" && ObjectId.isValid(id);
}

/**
 * Flight nodes + formation edges are the collections produced by the Python scripts in `/scripts`.
 * - flight_nodes schema (from scripts/load_mongodb.py):
 *   {
 *     flight_id: number,
 *     timestamp: Date,
 *     location: { type: "Point", coordinates: [lon, lat] },
 *     lat: number,
 *     lon: number,
 *     time_index: number,
 *     carrier: string,
 *     tailnum: string|null,
 *     origin: string,
 *     dest: string
 *   }
 * - formation_edges schema (from scripts/generate_formation_edges.py):
 *   {
 *     node1_id: string,
 *     node2_id: string,
 *     flight1_id: number,
 *     flight2_id: number,
 *     timestamp1: Date,
 *     timestamp2: Date,
 *     time_diff_seconds: number,
 *     distance_km: number,
 *     feasibility_score: number,
 *     heading1?: number|null,
 *     heading2?: number|null,
 *     heading_similarity?: number|null,
 *     created_at: Date
 *   }
 */

// CREATE
itemsRouter.post("/", async (req, res) => {
  try {
    await connectDB();

    const { title, ...rest } = req.body || {};
    if (!title || typeof title !== "string") {
      return res.status(400).json({ ok: false, error: "title (string) is required" });
    }

    const doc = {
      title,
      ...rest,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const col = getCollection(COLLECTION);
    const result = await col.insertOne(doc);
    const created = await col.findOne({ _id: result.insertedId });

    return res.status(201).json({ ok: true, item: created });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// READ ALL
itemsRouter.get("/", async (req, res) => {
  try {
    await connectDB();
    const col = getCollection(COLLECTION);

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const items = await col
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// READ ONE
itemsRouter.get("/:id", async (req, res) => {
  try {
    await connectDB();

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const col = getCollection(COLLECTION);
    const item = await col.findOne({ _id: new ObjectId(id) });
    if (!item) return res.status(404).json({ ok: false, error: "not found" });

    return res.json({ ok: true, item });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// UPDATE
itemsRouter.patch("/:id", async (req, res) => {
  try {
    await connectDB();

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const updates = { ...(req.body || {}) };
    delete updates._id;
    delete updates.createdAt;
    updates.updatedAt = new Date();

    const col = getCollection(COLLECTION);
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!result.value) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, item: result.value });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// DELETE
itemsRouter.delete("/:id", async (req, res) => {
  try {
    await connectDB();

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const col = getCollection(COLLECTION);
    const result = await col.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ ok: false, error: "not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// ----------------------------
// Flight Nodes API (GET/POST)
// ----------------------------

export const flightNodesRouter = express.Router();
const FLIGHT_NODES_COLLECTION = "flight_nodes";

function parseDateMaybe(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNumberMaybe(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// GET /api/flight-nodes?limit=200&flight_id=123&carrier=UA&origin=JFK&dest=LAX&start=...&end=...&nearLat=..&nearLon=..&maxDistanceM=..
flightNodesRouter.get("/", async (req, res) => {
  try {
    await connectDB();
    const col = getCollection(FLIGHT_NODES_COLLECTION);

    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const flightId = parseNumberMaybe(req.query.flight_id);
    const carrier = req.query.carrier ? String(req.query.carrier) : null;
    const origin = req.query.origin ? String(req.query.origin) : null;
    const dest = req.query.dest ? String(req.query.dest) : null;
    const start = parseDateMaybe(req.query.start);
    const end = parseDateMaybe(req.query.end);

    const nearLat = parseNumberMaybe(req.query.nearLat);
    const nearLon = parseNumberMaybe(req.query.nearLon);
    const maxDistanceM = parseNumberMaybe(req.query.maxDistanceM);

    const query = {};
    if (flightId !== null) query.flight_id = flightId;
    if (carrier) query.carrier = carrier;
    if (origin) query.origin = origin;
    if (dest) query.dest = dest;
    if (start || end) {
      query.timestamp = {};
      if (start) query.timestamp.$gte = start;
      if (end) query.timestamp.$lte = end;
    }
    if (nearLat !== null && nearLon !== null) {
      query.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [nearLon, nearLat] },
          ...(maxDistanceM !== null ? { $maxDistance: maxDistanceM } : {}),
        },
      };
    }

    const nodes = await col
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return res.json({ ok: true, nodes });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// POST /api/flight-nodes
flightNodesRouter.post("/", async (req, res) => {
  try {
    await connectDB();
    const col = getCollection(FLIGHT_NODES_COLLECTION);

    const body = req.body || {};
    const flight_id = parseNumberMaybe(body.flight_id);
    const lat = parseNumberMaybe(body.lat);
    const lon = parseNumberMaybe(body.lon);
    const time_index = parseNumberMaybe(body.time_index);
    const carrier = body.carrier ? String(body.carrier) : null;
    const origin = body.origin ? String(body.origin) : null;
    const dest = body.dest ? String(body.dest) : null;
    const tailnum = body.tailnum === undefined || body.tailnum === null ? null : String(body.tailnum);

    const timestamp = body.timestamp ? new Date(body.timestamp) : null;
    if (!timestamp || Number.isNaN(timestamp.getTime())) {
      return res.status(400).json({ ok: false, error: "timestamp (ISO string) is required" });
    }

    if (
      flight_id === null ||
      lat === null ||
      lon === null ||
      time_index === null ||
      !carrier ||
      !origin ||
      !dest
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Missing required fields: flight_id, timestamp, lat, lon, time_index, carrier, origin, dest",
      });
    }

    const doc = {
      flight_id,
      timestamp,
      location: { type: "Point", coordinates: [lon, lat] },
      lat,
      lon,
      time_index,
      carrier,
      tailnum,
      origin,
      dest,
    };

    const result = await col.insertOne(doc);
    const created = await col.findOne({ _id: result.insertedId });
    return res.status(201).json({ ok: true, node: created });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// -------------------------------
// Formation Edges API (GET/POST)
// -------------------------------

export const formationEdgesRouter = express.Router();
const FORMATION_EDGES_COLLECTION = "formation_edges";

// GET /api/formation-edges?limit=200&minScore=0.8&flight1_id=..&flight2_id=..
formationEdgesRouter.get("/", async (req, res) => {
  try {
    await connectDB();
    const col = getCollection(FORMATION_EDGES_COLLECTION);

    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const minScore = parseNumberMaybe(req.query.minScore);
    const flight1_id = parseNumberMaybe(req.query.flight1_id);
    const flight2_id = parseNumberMaybe(req.query.flight2_id);

    const query = {};
    if (minScore !== null) query.feasibility_score = { $gte: minScore };
    if (flight1_id !== null) query.flight1_id = flight1_id;
    if (flight2_id !== null) query.flight2_id = flight2_id;

    const edges = await col
      .find(query)
      .sort({ feasibility_score: -1 })
      .limit(limit)
      .toArray();

    return res.json({ ok: true, edges });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// POST /api/formation-edges
formationEdgesRouter.post("/", async (req, res) => {
  try {
    await connectDB();
    const col = getCollection(FORMATION_EDGES_COLLECTION);

    const body = req.body || {};
    const flight1_id = parseNumberMaybe(body.flight1_id);
    const flight2_id = parseNumberMaybe(body.flight2_id);
    const distance_km = parseNumberMaybe(body.distance_km);
    const feasibility_score = parseNumberMaybe(body.feasibility_score);
    const time_diff_seconds = parseNumberMaybe(body.time_diff_seconds);

    const timestamp1 = body.timestamp1 ? new Date(body.timestamp1) : null;
    const timestamp2 = body.timestamp2 ? new Date(body.timestamp2) : null;
    if (!timestamp1 || Number.isNaN(timestamp1.getTime()) || !timestamp2 || Number.isNaN(timestamp2.getTime())) {
      return res.status(400).json({ ok: false, error: "timestamp1 and timestamp2 (ISO strings) are required" });
    }

    if (
      flight1_id === null ||
      flight2_id === null ||
      distance_km === null ||
      feasibility_score === null ||
      time_diff_seconds === null
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Missing required fields: flight1_id, flight2_id, timestamp1, timestamp2, time_diff_seconds, distance_km, feasibility_score",
      });
    }

    const doc = {
      node1_id: body.node1_id ? String(body.node1_id) : undefined,
      node2_id: body.node2_id ? String(body.node2_id) : undefined,
      flight1_id,
      flight2_id,
      timestamp1,
      timestamp2,
      time_diff_seconds,
      distance_km,
      feasibility_score,
      heading1: body.heading1 === undefined ? undefined : parseNumberMaybe(body.heading1),
      heading2: body.heading2 === undefined ? undefined : parseNumberMaybe(body.heading2),
      heading_similarity:
        body.heading_similarity === undefined ? undefined : parseNumberMaybe(body.heading_similarity),
      created_at: new Date(),
    };

    // Remove undefined optional fields so Mongo doc stays clean
    Object.keys(doc).forEach((k) => doc[k] === undefined && delete doc[k]);

    const result = await col.insertOne(doc);
    const created = await col.findOne({ _id: result.insertedId });
    return res.status(201).json({ ok: true, edge: created });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

