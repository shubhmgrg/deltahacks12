// MongoDB Shell Script - Randomize Origins
// Run this in MongoDB Compass or mongosh
//
// Targets:
// - DB: flights
// - Collection: flight_nodes
// - Fields: origin, dest

// Airport codes
const airportCodes = ["YYZ", "JFK", "EWR", "LGA", "YUL", "LAX", "ORD", "DFW", "ATL", "MIA", "SFO", "SEA", "BOS", "IAD", "PHL", "YVR", "YYC", "YOW", "LHR", "CDG", "FRA", "AMS"];

const DB_NAME = "flights";
const COLLECTION_NAME = "flight_nodes_clone";
const ORIGIN_FIELD = "origin";
const DEST_FIELD = "dest";

const dbRef = db.getSiblingDB(DB_NAME);
const col = dbRef.getCollection(COLLECTION_NAME);

// Get all docs
let count = 0;
col.find({}, { _id: 1, [DEST_FIELD]: 1 }).forEach(function(doc) {
  const currentDest = doc[DEST_FIELD];
  
  // Filter out the current destination from possible origins (if dest is present)
  const possibleOrigins =
    (typeof currentDest === "string" && currentDest.length)
      ? airportCodes.filter(code => code !== currentDest)
      : airportCodes;
  
  // Pick random origin
  const newOrigin = possibleOrigins[Math.floor(Math.random() * possibleOrigins.length)];
  
  // Update the doc
  col.updateOne(
    { _id: doc._id },
    { $set: { [ORIGIN_FIELD]: newOrigin } }
  );
  
  count++;
  if (count % 100 === 0) {
    print(`Updated ${count} flights...`);
  }
});

print(`✅ Completed! Updated ${count} flights.`);
