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
const FLIGHT_ID_FIELD = "flight_id";
const ORIGIN_FIELD = "origin";
const DEST_FIELD = "dest";

const dbRef = db.getSiblingDB(DB_NAME);
const col = dbRef.getCollection(COLLECTION_NAME);

print(`Updating origins (one random origin per ${FLIGHT_ID_FIELD})...`);

let updatedDocs = 0;
let processedGroups = 0;

// 1) Update docs that have a flight_id: choose ONE origin per flight_id.
col.aggregate([
  { $match: { [FLIGHT_ID_FIELD]: { $exists: true, $ne: null } } },
  { $group: { _id: `$${FLIGHT_ID_FIELD}`, dests: { $addToSet: `$${DEST_FIELD}` }, docs: { $sum: 1 } } }
]).forEach(function(group) {
  const dests = Array.isArray(group.dests) ? group.dests : [];
  const forbidden = {};
  dests.forEach(function(d) {
    if (typeof d === "string" && d.length) forbidden[d] = true;
  });

  let possibleOrigins = airportCodes.filter(function(code) { return !forbidden[code]; });
  if (possibleOrigins.length === 0) possibleOrigins = airportCodes;

  const newOrigin = possibleOrigins[Math.floor(Math.random() * possibleOrigins.length)];

  const res = col.updateMany(
    { [FLIGHT_ID_FIELD]: group._id },
    { $set: { [ORIGIN_FIELD]: newOrigin } }
  );

  updatedDocs += (res && res.modifiedCount) ? res.modifiedCount : 0;
  processedGroups++;

  if (processedGroups % 100 === 0) {
    print(`Processed ${processedGroups} flight_id groups... (updated docs so far: ${updatedDocs})`);
  }
});

// 2) Update docs missing flight_id: fall back to per-document randomization.
col.find(
  { $or: [ { [FLIGHT_ID_FIELD]: { $exists: false } }, { [FLIGHT_ID_FIELD]: null } ] },
  { _id: 1, [DEST_FIELD]: 1 }
).forEach(function(doc) {
  const currentDest = doc[DEST_FIELD];
  const possibleOrigins =
    (typeof currentDest === "string" && currentDest.length)
      ? airportCodes.filter(function(code) { return code !== currentDest; })
      : airportCodes;

  if (!possibleOrigins.length) return;

  const newOrigin = possibleOrigins[Math.floor(Math.random() * possibleOrigins.length)];
  const res = col.updateOne(
    { _id: doc._id },
    { $set: { [ORIGIN_FIELD]: newOrigin } }
  );
  updatedDocs += (res && res.modifiedCount) ? res.modifiedCount : 0;
});

print(`✅ Completed! Updated ${updatedDocs} documents.`);
