import { ObjectId } from "mongodb";
import express from "express";
import { connectDB, getCollection } from "../datastore.js";

export const itemsRouter = express.Router();
const COLLECTION = "items";

function isValidObjectId(id) {
  return typeof id === "string" && ObjectId.isValid(id);
}

// CREATE
itemsRouter.post("/", async (req, res) => {
  try {
    await connectDB();

    const { title, ...rest } = req.body || {};
    if (!title || typeof title !== "string") {
      return res.status(400).json({ ok: false, error: "title (string) is required" });
    }

    const doc = {
      title,
      ...rest,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const col = getCollection(COLLECTION);
    const result = await col.insertOne(doc);
    const created = await col.findOne({ _id: result.insertedId });

    return res.status(201).json({ ok: true, item: created });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// READ ALL
itemsRouter.get("/", async (req, res) => {
  try {
    await connectDB();
    const col = getCollection(COLLECTION);

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const items = await col
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// READ ONE
itemsRouter.get("/:id", async (req, res) => {
  try {
    await connectDB();

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const col = getCollection(COLLECTION);
    const item = await col.findOne({ _id: new ObjectId(id) });
    if (!item) return res.status(404).json({ ok: false, error: "not found" });

    return res.json({ ok: true, item });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// UPDATE
itemsRouter.patch("/:id", async (req, res) => {
  try {
    await connectDB();

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const updates = { ...(req.body || {}) };
    delete updates._id;
    delete updates.createdAt;
    updates.updatedAt = new Date();

    const col = getCollection(COLLECTION);
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!result.value) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, item: result.value });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

// DELETE
itemsRouter.delete("/:id", async (req, res) => {
  try {
    await connectDB();

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const col = getCollection(COLLECTION);
    const result = await col.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ ok: false, error: "not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

