import express from "express";
import { getFormationEdgesCollection } from "./mongo.js";

const router = express.Router();

/**
 * GET /api/formation-edges
 * Fetch formation edges from MongoDB.
 *
 * Query params:
 * - limit: number (default 100, max 5000)
 * - skip: number (default 0)
 * - flight_id: string (optional)
 * - scenarioId: string (optional)
 */
router.get("/", async (req, res) => {
  try {
    const limitRaw = Number.parseInt(String(req.query.limit ?? "100"), 10);
    const skipRaw = Number.parseInt(String(req.query.skip ?? "0"), 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 5000)
      : 100;
    const skip = Number.isFinite(skipRaw) ? Math.max(skipRaw, 0) : 0;

    const filter = {};
    if (typeof req.query.flight_id === "string" && req.query.flight_id.length) {
      filter.flight_id = req.query.flight_id;
    }
    if (typeof req.query.scenarioId === "string" && req.query.scenarioId.length) {
      filter.scenarioId = req.query.scenarioId;
    }

    const col = await getFormationEdgesCollection();
    const estimatedTotal = await col.estimatedDocumentCount();
    const docs = await col.find(filter).skip(skip).limit(limit).toArray();

    res.json({
      ok: true,
      source: "mongodb",
      namespace: col.namespace,
      estimatedTotal,
      returned: docs.length,
      limit,
      skip,
      filter,
      data: docs,
      debug: {
        envDb: process.env.FORMATION_EDGES_DB_NAME || null,
        envCollection: process.env.FORMATION_EDGES_COLLECTION || null,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;

