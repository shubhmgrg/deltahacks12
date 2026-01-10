import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

let client;
let db;

/**
 * Connect to MongoDB database
 */
export async function connectDB() {
  try {
    if (db) {
      console.log("Already connected to MongoDB");
      return db;
    }

    const mongodbUri = process.env.MONGODB_URI;
    const dbName = process.env.DB_NAME;

    if (!mongodbUri) {
      throw new Error(
        "Missing MONGODB_URI. Create backend/.env (see backend/env.example) or set MONGODB_URI in your shell."
      );
    }

    client = new MongoClient(mongodbUri);
    await client.connect();
    db = dbName ? client.db(dbName) : client.db();
    
    console.log(
      `Successfully connected to MongoDB ${dbName ? `database: ${dbName}` : "(default database from URI)"}`
    );
    return db;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

/**
 * Get database instance
 */
export function getDB() {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB first.");
  }
  return db;
}

/**
 * Get a specific collection
 * @param {string} collectionName - Name of the collection
 */
export function getCollection(collectionName) {
  return getDB().collection(collectionName);
}

/**
 * Close database connection
 */
export async function closeDB() {
  try {
    if (client) {
      await client.close();
      client = null;
      db = null;
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("Error closing MongoDB connection:", error);
    throw error;
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  await closeDB();
  process.exit(0);
});
