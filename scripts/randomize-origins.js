import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Try to load env vars from common locations:
// - repo root `.env` (if present)
// - `backend/.env` (recommended by this repo)
// - current working directory `.env` (dotenv default)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../backend/.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

/**
 * Randomize origins in a collection (ensure origin !== dest)
 *
 * This script targets:
 * - database: flights
 * - collection: flight_nodes
 * - origin field: origin
 * - destination field: dest
 */
async function randomizeOrigins() {
  const cliCollectionName = process.argv[2];
  const cliDbName = process.argv[3];

  const DB_NAME = cliDbName || process.env.MONGO_DB_NAME || "flights";
  const PRIMARY_COLLECTION_NAME =
    cliCollectionName ||
    process.env.FLIGHT_NODES_COLLECTION ||
    "flight_nodes_clone";
  const FALLBACK_COLLECTION_NAME = "flight_nodes";
  const FLIGHT_ID_FIELD = "flight_id";
  const ORIGIN_FIELD = "origin";
  const DEST_FIELD = "dest";

  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) {
    throw new Error(
      "Missing MONGODB_URI. Create backend/.env or set MONGODB_URI in your shell."
    );
  }

  const client = new MongoClient(mongodbUri);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // Airport codes
    const airportCodes = [
      "YYZ", "JFK", "EWR", "LGA", "YUL", "LAX", "ORD", "DFW", 
      "ATL", "MIA", "SFO", "SEA", "BOS", "IAD", "PHL", "YVR", 
      "YYC", "YOW", "LHR", "CDG", "FRA", "AMS"
    ];

    console.log("\n🎲 Randomizing origins...");
    console.log(`Available airports: ${airportCodes.length}`);
    console.log(`Codes: ${airportCodes.join(", ")}\n`);

    // Auto-select a collection that actually has documents.
    let collectionName = PRIMARY_COLLECTION_NAME;
    let col = db.collection(collectionName);
    let totalDocs = await col.countDocuments();

    if (
      totalDocs === 0 &&
      PRIMARY_COLLECTION_NAME !== FALLBACK_COLLECTION_NAME
    ) {
      const fallbackCol = db.collection(FALLBACK_COLLECTION_NAME);
      const fallbackDocs = await fallbackCol.countDocuments();
      if (fallbackDocs > 0) {
        console.log(
          `⚠️  ${DB_NAME}.${PRIMARY_COLLECTION_NAME} is empty; using ${DB_NAME}.${FALLBACK_COLLECTION_NAME} instead.`
        );
        collectionName = FALLBACK_COLLECTION_NAME;
        col = fallbackCol;
        totalDocs = fallbackDocs;
      }
    }

    console.log(`Target: ${DB_NAME}.${collectionName}`);
    console.log(`Found ${totalDocs} documents to update\n`);
    
    if (totalDocs === 0) {
      console.log(
        `No documents found! (Checked ${DB_NAME}.${PRIMARY_COLLECTION_NAME}` +
          (PRIMARY_COLLECTION_NAME !== FALLBACK_COLLECTION_NAME
            ? ` and ${DB_NAME}.${FALLBACK_COLLECTION_NAME}`
            : "") +
          ")\n" +
          "Tip: run `node scripts/randomize-origins.js <collectionName> [dbName]` to target a different collection."
      );
      return;
    }

    console.log(
      `Updating origins (one random origin per ${FLIGHT_ID_FIELD}, bulk updates)...`
    );

    const batchSize = 1000;
    let updated = 0;
    let bulkOps = [];

    // 1) Update docs that have a flight_id: choose ONE origin per flight_id.
    const flightIdGroupsCursor = col.aggregate([
      {
        $match: {
          [FLIGHT_ID_FIELD]: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: `$${FLIGHT_ID_FIELD}`,
          dests: { $addToSet: `$${DEST_FIELD}` },
          docs: { $sum: 1 },
        },
      },
    ]);

    let groupsProcessed = 0;
    for await (const group of flightIdGroupsCursor) {
      const dests = Array.isArray(group?.dests) ? group.dests : [];
      const forbidden = new Set(
        dests.filter((d) => typeof d === "string" && d.length)
      );

      // Prefer an origin that won't equal ANY destination for this flight_id.
      let possibleOrigins = airportCodes.filter((code) => !forbidden.has(code));
      if (possibleOrigins.length === 0) possibleOrigins = airportCodes;

      const newOrigin =
        possibleOrigins[Math.floor(Math.random() * possibleOrigins.length)];

      bulkOps.push({
        updateMany: {
          filter: { [FLIGHT_ID_FIELD]: group._id },
          update: { $set: { [ORIGIN_FIELD]: newOrigin } },
        },
      });

      groupsProcessed++;
      if (bulkOps.length >= batchSize) {
        const res = await col.bulkWrite(bulkOps, { ordered: false });
        // modifiedCount counts documents, not ops — that's what we want for progress.
        updated += res.modifiedCount ?? 0;
        bulkOps = [];

        const progress = ((updated / totalDocs) * 100).toFixed(1);
        console.log(
          `  Progress: ${updated}/${totalDocs} (${progress}%) [groups processed: ${groupsProcessed}]`
        );
      }
    }

    // 2) Update docs missing flight_id: fall back to per-document randomization.
    const noFlightIdCursor = col.find(
      {
        $or: [
          { [FLIGHT_ID_FIELD]: { $exists: false } },
          { [FLIGHT_ID_FIELD]: null },
        ],
      },
      {
        projection: {
          _id: 1,
          [DEST_FIELD]: 1,
        },
      }
    );

    for await (const doc of noFlightIdCursor) {
      const currentDest = doc?.[DEST_FIELD];
      const possibleOrigins =
        typeof currentDest === "string" && currentDest.length
          ? airportCodes.filter((code) => code !== currentDest)
          : airportCodes;
      if (possibleOrigins.length === 0) continue;

      const newOrigin =
        possibleOrigins[Math.floor(Math.random() * possibleOrigins.length)];

      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { [ORIGIN_FIELD]: newOrigin } },
        },
      });

      if (bulkOps.length >= batchSize) {
        const res = await col.bulkWrite(bulkOps, { ordered: false });
        updated += res.modifiedCount ?? 0;
        bulkOps = [];

        const progress = ((updated / totalDocs) * 100).toFixed(1);
        console.log(`  Progress: ${updated}/${totalDocs} (${progress}%)`);
      }
    }

    if (bulkOps.length) {
      const res = await col.bulkWrite(bulkOps, { ordered: false });
      updated += res.modifiedCount ?? 0;
    }

    console.log(`\n✅ Successfully randomized ${updated} origins!`);

    // Show statistics
    console.log("\nOrigin distribution:");
    const originCounts = await col.aggregate([
      { $group: { _id: `$${ORIGIN_FIELD}`, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    originCounts.forEach(item => {
      console.log(`  ${item._id}: ${item.count} flights`);
    });

    // Show sample routes
    console.log("\nSample routes (first 10):");
    const samples = await col.find({}).limit(10).toArray();
    samples.forEach((doc, idx) => {
      console.log(`  ${idx + 1}. ${doc?.[ORIGIN_FIELD]} → ${doc?.[DEST_FIELD]}`);
    });

    // Verify no overlaps
    console.log("\nVerifying no origin=dest overlaps...");
    const overlaps = await col.countDocuments({
      $expr: { $eq: [`$${ORIGIN_FIELD}`, `$${DEST_FIELD}`] }
    });
    
    if (overlaps === 0) {
      console.log("✅ No overlaps found - all origins differ from destinations!");
    } else {
      console.log(`⚠️  Found ${overlaps} flights where origin=dest (this shouldn't happen!)`);
    }

  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await client.close();
  }
}

randomizeOrigins();
