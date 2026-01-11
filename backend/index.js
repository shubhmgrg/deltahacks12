import express from "express";
import { connectDB, getDB } from "./datastore.js";
import { itemsRouter } from "./routes/items.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

app.use("/api/items", itemsRouter);

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
