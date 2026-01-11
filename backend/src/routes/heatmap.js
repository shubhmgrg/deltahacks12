import express from "express";
import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB connection
let client = null;
let db = null;

async function connectDB() {
  if (db) return db;

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/";
  const dbName =
    process.env.DB_NAME || process.env.MONGODB_DB_NAME || "flights";

  try {
    client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    db = client.db(dbName);
    console.log("✓ Connected to MongoDB for heatmap");
    return db;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    return null;
  }
}

/**
 * GET /api/heatmap
 * Returns heatmap data (either from file or computes from MongoDB)
 */
router.get("/", async (req, res) => {
  try {
    const { timeBucket, includeFormation } = req.query;

    // Try to load from static file first (if computed offline)
    const heatmapPath = path.join(__dirname, "../../../data/heatmap.json");

    if (fs.existsSync(heatmapPath)) {
      const heatmapData = JSON.parse(fs.readFileSync(heatmapPath, "utf8"));

      // Filter by time bucket if specified
      let filteredData = heatmapData.data || [];
      if (timeBucket) {
        filteredData = filteredData.filter(
          (item) => item.time_bucket === timeBucket
        );
      }

      // Filter out formation data if not requested
      if (includeFormation !== "true") {
        filteredData = filteredData.map((item) => {
          const { formation_count, weighted_intensity, ...rest } = item;
          return rest;
        });
      }

      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return res.json({
        ...heatmapData.metadata,
        data: filteredData,
        source: "file",
      });
    }

    // Fallback: Try to load from MongoDB (requires compute_heatmap.py to be run first)
    // For now, return empty data with instructions
    res.status(503).json({
      error: "Heatmap data not available",
      message: "Please run scripts/compute_heatmap.py to generate heatmap data",
      source: "mongodb",
    });
  } catch (error) {
    console.error("Error fetching heatmap:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch heatmap data", message: error.message });
  }
});

/**
 * GET /api/heatmap/time-buckets
 * Returns list of available time buckets
 */
router.get("/time-buckets", async (req, res) => {
  try {
    const heatmapPath = path.join(__dirname, "../../../data/heatmap.json");

    if (fs.existsSync(heatmapPath)) {
      const heatmapData = JSON.parse(fs.readFileSync(heatmapPath, "utf8"));
      const timeBuckets = heatmapData.metadata?.time_buckets || [];
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return res.json({ timeBuckets, source: "file" });
    }

    res.json({ timeBuckets: [], source: "none" });
  } catch (error) {
    console.error("Error fetching time buckets:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch time buckets", message: error.message });
  }
});

/**
 * GET /api/heatmap/stats
 * Returns heatmap statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const heatmapPath = path.join(__dirname, "../../../data/heatmap.json");

    if (fs.existsSync(heatmapPath)) {
      const heatmapData = JSON.parse(fs.readFileSync(heatmapPath, "utf8"));
      const data = heatmapData.data || [];

      // Use reduce instead of spread operator to avoid stack overflow with large arrays
      const maxIntensity = data.reduce(
        (max, item) => Math.max(max, item.intensity || 0),
        0
      );
      const totalFlights = data.reduce(
        (sum, item) => sum + (item.flight_count || 0),
        0
      );
      const totalCells = data.length;

      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return res.json({
        maxIntensity,
        totalFlights,
        totalCells,
        timeBuckets: heatmapData.metadata?.time_buckets?.length || 0,
        gridResolution: heatmapData.metadata?.grid_resolution_degrees,
        timeStep: heatmapData.metadata?.time_step_minutes,
        source: "file",
      });
    }

    res.json({
      maxIntensity: 0,
      totalFlights: 0,
      totalCells: 0,
      timeBuckets: 0,
      source: "none",
    });
  } catch (error) {
    console.error("Error fetching heatmap stats:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch heatmap stats", message: error.message });
  }
});

export default router;
