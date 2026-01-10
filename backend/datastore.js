import sqlite3 from "sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, "travel.sqlite");

// Open SQLite database
export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to travel.sqlite database");
    
    // Print flights table
    // db.all("SELECT * FROM flights", [], (err, rows) => {
    //   if (err) {
    //     console.error("Error querying flights table:", err.message);
    //   } else {
    //     console.log("\n=== Flights Table ===");
    //     console.table(rows);
    //   }
    // });
  }
});
