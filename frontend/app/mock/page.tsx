"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  _id: string;
  title: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export default function MockCrudPage() {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = useMemo(() => title.trim().length > 0, [title]);

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ ok: true; items: any[] }>("/api/items?limit=200");
      const normalized: Item[] = (res.items || []).map((it) => ({
        ...it,
        _id: String(it._id),
      }));
      setItems(normalized);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function createItem() {
    if (!canCreate) return;
    setError(null);
    setLoading(true);
    try {
      await api("/api/items", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), notes: notes.trim() || undefined }),
      });
      setTitle("");
      setNotes("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  async function deleteItem(id: string) {
    setError(null);
    setLoading(true);
    try {
      await api(`/api/items/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  async function updateItem(id: string, patch: Partial<Item>) {
    setError(null);
    setLoading(true);
    try {
      await api(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-900">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mock CRUD UI</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Uses <code className="rounded bg-white px-1">/api/items</code> (proxied to the backend).
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="grid gap-3">
            <div>
              <label className="text-sm font-medium">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Buy milk"
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes (optional)</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="anything extra…"
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void createItem()}
                disabled={!canCreate || loading}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Create
              </button>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700">
            Items ({items.length})
          </h2>
          <div className="grid gap-3">
            {items.map((it) => (
              <ItemRow
                key={it._id}
                item={it}
                disabled={loading}
                onDelete={deleteItem}
                onUpdate={updateItem}
              />
            ))}
            {items.length === 0 ? (
              <div className="rounded-xl border bg-white p-6 text-sm text-zinc-600">
                No items yet. Create one above.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  disabled,
  onDelete,
  onUpdate,
}: {
  item: Item;
  disabled: boolean;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Item>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title || "");
  const [notes, setNotes] = useState(item.notes || "");

  useEffect(() => {
    setTitle(item.title || "");
    setNotes(item.notes || "");
  }, [item._id, item.title, item.notes]);

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-xs text-zinc-500">id: {item._id}</div>
          {!editing ? (
            <>
              <div className="mt-1 text-base font-semibold">{item.title}</div>
              {item.notes ? <div className="mt-1 text-sm text-zinc-700">{item.notes}</div> : null}
            </>
          ) : (
            <div className="mt-2 grid gap-2">
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="notes (optional)"
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          {!editing ? (
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
              disabled={disabled}
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          ) : (
            <>
              <button
                className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={disabled || title.trim().length === 0}
                onClick={() => void onUpdate(item._id, { title: title.trim(), notes: notes.trim() || undefined }).then(() => setEditing(false))}
              >
                Save
              </button>
              <button
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
                disabled={disabled}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </>
          )}
          <button
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            disabled={disabled}
            onClick={() => void onDelete(item._id)}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

