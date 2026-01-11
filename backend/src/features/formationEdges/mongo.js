import { MongoClient } from "mongodb";

let client;
let db;

function getDbName() {
  // This feature should read from the flights database by default,
  // regardless of other backend DB settings.
  return process.env.FORMATION_EDGES_DB_NAME || "flights";
}

function getCollectionName() {
  return process.env.FORMATION_EDGES_COLLECTION || "formation_edges";
}

export async function getMongoDb() {
  if (db) return db;

  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) {
    throw new Error(
      "Missing MONGODB_URI. Create backend/.env or set MONGODB_URI in your shell."
    );
  }

  client = new MongoClient(mongodbUri);
  await client.connect();
  db = client.db(getDbName());
  return db;
}

export async function getFormationEdgesCollection() {
  const dbRef = await getMongoDb();
  return dbRef.collection(getCollectionName());
}

export async function closeMongo() {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
  }
}

