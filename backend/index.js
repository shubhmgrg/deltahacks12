import express from "express";
import { connectDB, getDB } from "./datastore.js";
import { formationEdgesRouter, flightNodesRouter, itemsRouter } from "./routes/items.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
// Next dev server defaults to 3000; keep backend on a different default port to avoid conflicts.
const PORT = process.env.PORT || 3001;

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.send("Hello from Express with ES Modules");
});

app.get("/health", async (req, res) => {
  try {
    // Ensure we have a connection
    await connectDB();
    await getDB().command({ ping: 1 });
    res.status(200).json({ ok: true, mongo: "up" });
  } catch (error) {
    res.status(500).json({ ok: false, mongo: "down", error: String(error) });
  }
});

app.get("/test", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "items.html"));
});

app.use("/api/items", itemsRouter);
app.use("/api/flight-nodes", flightNodesRouter);
app.use("/api/formation-edges", formationEdgesRouter);

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
