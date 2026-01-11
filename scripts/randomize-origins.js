import { MongoClient } from "mongodb";
import dotenv from "dotenv";

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
  const DB_NAME = "flights";
  const COLLECTION_NAME = "flight_nodes_clone";
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

    const col = db.collection(COLLECTION_NAME);
    const totalDocs = await col.countDocuments();
    
    console.log(`Target: ${DB_NAME}.${COLLECTION_NAME}`);
    console.log(`Found ${totalDocs} documents to update\n`);
    
    if (totalDocs === 0) {
      console.log("No documents found!");
      return;
    }

    console.log("Updating origins (streaming bulk updates)...");

    const batchSize = 1000;
    let updated = 0;
    let bulkOps = [];

    const cursor = col.find(
      {},
      {
        projection: {
          _id: 1,
          [DEST_FIELD]: 1,
        },
      }
    );

    for await (const doc of cursor) {
      const currentDest = doc?.[DEST_FIELD];

      // Filter out the destination from possible origins (if dest is present)
      const possibleOrigins =
        typeof currentDest === "string" && currentDest.length
          ? airportCodes.filter((code) => code !== currentDest)
          : airportCodes;

      if (possibleOrigins.length === 0) {
        // Extremely unlikely unless airportCodes only contains currentDest
        continue;
      }

      const newOrigin =
        possibleOrigins[Math.floor(Math.random() * possibleOrigins.length)];

      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { [ORIGIN_FIELD]: newOrigin } },
        },
      });

      if (bulkOps.length >= batchSize) {
        await col.bulkWrite(bulkOps, { ordered: false });
        updated += bulkOps.length;
        bulkOps = [];

        const progress = ((updated / totalDocs) * 100).toFixed(1);
        console.log(`  Progress: ${updated}/${totalDocs} (${progress}%)`);
      }
    }

    if (bulkOps.length) {
      await col.bulkWrite(bulkOps, { ordered: false });
      updated += bulkOps.length;
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
