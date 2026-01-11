import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Try to load env vars from common locations:
// - `backend/.env` (recommended by this repo)
// - repo root `.env` (if present)
// - current working directory `.env` (dotenv default)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../backend/.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

/**
 * Reset all origins to a fixed airport code, after cloning the collection.
 *
 * Defaults:
 * - db: flights
 * - source collection: flight_nodes
 * - target collection: flight_nodes_clone
 * - origin field: origin
 * - reset origin value: EWR
 *
 * Usage:
 *   node scripts/reset-origins.js [sourceCollection] [targetCollection] [dbName]
 */
async function resetOrigins() {
  const cliSourceCollection = process.argv[2];
  const cliTargetCollection = process.argv[3];
  const cliDbName = process.argv[4];

  const DB_NAME = cliDbName || process.env.MONGO_DB_NAME || "flights";
  const SOURCE_COLLECTION =
    cliSourceCollection ||
    process.env.FLIGHT_NODES_COLLECTION ||
    "flight_nodes";
  const TARGET_COLLECTION = cliTargetCollection || "flight_nodes_clone";

  const ORIGIN_FIELD = "origin";
  const RESET_ORIGIN_VALUE = "EWR";

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

    console.log("\n♻️  Resetting origins to a fixed value...");
    console.log(`DB: ${DB_NAME}`);
    console.log(`Source: ${SOURCE_COLLECTION}`);
    console.log(`Target: ${TARGET_COLLECTION}`);
    console.log(`Reset: ${ORIGIN_FIELD} = ${RESET_ORIGIN_VALUE}\n`);

    const sourceCol = db.collection(SOURCE_COLLECTION);
    const sourceCount = await sourceCol.countDocuments();
    if (sourceCount === 0) {
      console.log("No documents found in source collection. Nothing to do.");
      return;
    }

    console.log(
      `Cloning ${sourceCount} documents via $out (this replaces the target collection)...`
    );

    // $out will replace/overwrite the target collection.
    await sourceCol.aggregate([{ $match: {} }, { $out: TARGET_COLLECTION }]).toArray();

    const targetCol = db.collection(TARGET_COLLECTION);
    const targetCount = await targetCol.countDocuments();
    console.log(`Clone complete: ${targetCount} documents in ${TARGET_COLLECTION}\n`);

    console.log(`Updating all documents: setting ${ORIGIN_FIELD} to ${RESET_ORIGIN_VALUE}...`);
    const res = await targetCol.updateMany(
      {},
      { $set: { [ORIGIN_FIELD]: RESET_ORIGIN_VALUE } }
    );

    console.log(
      `\n✅ Done. Matched ${res.matchedCount ?? 0}, modified ${res.modifiedCount ?? 0} documents.`
    );
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await client.close();
  }
}

resetOrigins();

