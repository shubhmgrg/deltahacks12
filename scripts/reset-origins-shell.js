// MongoDB Shell Script - Clone + Reset Origins
// Run this in MongoDB Compass or mongosh
//
// Defaults:
// - DB: flights
// - Source: flight_nodes
// - Target: flight_nodes_clone
// - Reset: origin = EWR

const DB_NAME = "flights";
const SOURCE_COLLECTION = "flight_nodes";
const TARGET_COLLECTION = "flight_nodes_clone";
const ORIGIN_FIELD = "origin";
const RESET_ORIGIN_VALUE = "EWR";

const dbRef = db.getSiblingDB(DB_NAME);
const sourceCol = dbRef.getCollection(SOURCE_COLLECTION);

const sourceCount = sourceCol.countDocuments({});
print(`Source ${DB_NAME}.${SOURCE_COLLECTION}: ${sourceCount} docs`);

if (!sourceCount) {
  print("No documents found in source collection. Nothing to do.");
} else {
  print(
    `Cloning via $out (this replaces target): ${DB_NAME}.${SOURCE_COLLECTION} -> ${DB_NAME}.${TARGET_COLLECTION}`
  );

  // $out replaces/overwrites the target collection.
  sourceCol.aggregate([{ $match: {} }, { $out: TARGET_COLLECTION }]).toArray();

  const targetCol = dbRef.getCollection(TARGET_COLLECTION);
  const targetCount = targetCol.countDocuments({});
  print(`Clone complete: ${DB_NAME}.${TARGET_COLLECTION}: ${targetCount} docs`);

  print(`Resetting ${ORIGIN_FIELD} = ${RESET_ORIGIN_VALUE} for all docs...`);
  const res = targetCol.updateMany({}, { $set: { [ORIGIN_FIELD]: RESET_ORIGIN_VALUE } });

  print(
    `✅ Done. Matched ${res.matchedCount || 0}, modified ${res.modifiedCount || 0} documents.`
  );
}

