import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "deltahacks12";

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

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    
    console.log(`Successfully connected to MongoDB database: ${DB_NAME}`);
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
