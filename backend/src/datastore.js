import { MongoClient } from "mongodb";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
 * Get the MongoDB database instance
 */
export function getDB() {
  if (!db) {
    throw new Error("Database not connected. Call connectDB() first.");
  }
  return db;
}

/**
 * Get a collection from the database
 */
export function getCollection(collectionName) {
  const database = getDB();
  return database.collection(collectionName);
}
