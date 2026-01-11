"""
Generate frontend demo data (scenarios + matches) from MongoDB flight_nodes.

This script overwrites:
  - frontend/src/data/scenarios.json
  - frontend/src/data/matches.json

It produces the same JSON shapes currently used by the frontend demo mode.

Usage:
  source .venv/bin/activate
  export MONGODB_URI="mongodb+srv://..."
  export MONGODB_DB_NAME="flights"
  python scripts/generate_frontend_demo_data.py

Optional knobs (env or CLI):
  --max-flights 5000
  --max-scenarios 100
  --max-pairs 20000
"""

from __future__ import annotations

import argparse
import json
import math
import os
from collections import defaultdict
from datetime import datetime, timedelta
from itertools import combinations
from typing import Any, Dict, List, Optional, Tuple

from pymongo import MongoClient

# Defaults
DEFAULT_OUT_SCENARIOS = "frontend/src/data/scenarios.json"
DEFAULT_OUT_MATCHES = "frontend/src/data/matches.json"

# Replay sampling (frontend uses uniform progress across point arrays, so we
# generate a denser, equal-length sampling for leader/follower to avoid visible
# "jumps" when paths are sparse).
#
# - TARGET_REPLAY_POINTS fixes the number of points per flight so leader/follower
#   stay aligned in the replay state machine.
# - MAX_REPLAY_POINTS is a hard safety cap.
TARGET_REPLAY_POINTS = 600
MAX_REPLAY_POINTS = 2000

# Formation flight parameters
# NOTE: these are "demo-friendly" defaults to reliably produce scenarios.
# Tighten them if you want more realistic formation constraints.
MAX_SEPARATION_KM_DEFAULT = 200  # km
MIN_FORMATION_TIME_MINUTES_DEFAULT = 10
MAX_TIME_DIFF_MINUTES_DEFAULT = 30
EARTH_RADIUS_KM = 6371

# Fuel/CO2 model (rough)
FUEL_SAVINGS_RATE = 0.08
FUEL_BURN_RATE_KG_PER_KM = 0.35
CO2_PER_KG_FUEL = 3.15


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km."""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return EARTH_RADIUS_KM * c


def _to_dt(ts: Any) -> Optional[datetime]:
    if ts is None:
        return None
    if isinstance(ts, datetime):
        return ts
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


def get_flight_data(collection, max_flights: int, sampling: str = "random") -> Dict[int, Dict[str, Any]]:
    """
    Retrieve flight data from MongoDB, grouped by flight_id.
    Returns: {flight_id: {nodes: [...], carrier, tailnum, origin, dest}}
    """
    print("Fetching flight IDs...")
    pipeline = [{"$group": {"_id": "$flight_id"}}]
    if sampling == "first":
        pipeline.extend([{"$sort": {"_id": 1}}, {"$limit": int(max_flights)}])
    else:
        # Random sampling gives much better variety and usually yields more scenarios
        pipeline.extend([{"$sample": {"size": int(max_flights)}}])

    flight_id_docs = list(collection.aggregate(pipeline, allowDiskUse=True))
    flight_ids = [d["_id"] for d in flight_id_docs if d.get("_id") is not None]

    print(f"Fetching nodes for {len(flight_ids)} flights...")
    pipeline = [
        {"$match": {"flight_id": {"$in": flight_ids}}},
        {"$sort": {"flight_id": 1, "time_index": 1}},
        {
            "$group": {
                "_id": "$flight_id",
                "nodes": {
                    "$push": {
                        "timestamp": "$timestamp",
                        "lat": "$lat",
                        "lon": "$lon",
                        "time_index": "$time_index",
                    }
                },
                "carrier": {"$first": "$carrier"},
                "tailnum": {"$first": "$tailnum"},
                "origin": {"$first": "$origin"},
                "dest": {"$first": "$dest"},
            }
        },
    ]

    flights: Dict[int, Dict[str, Any]] = {}
    for doc in collection.aggregate(pipeline, allowDiskUse=True):
        flight_id = doc["_id"]
        flights[int(flight_id)] = {
            "nodes": doc.get("nodes", []),
            "carrier": doc.get("carrier"),
            "tailnum": doc.get("tailnum"),
            "origin": doc.get("origin"),
            "dest": doc.get("dest"),
        }

    print(f"Retrieved {len(flights)} unique flights")
    return flights


def get_time_window(flight_data: Dict[str, Any]) -> Tuple[Optional[datetime], Optional[datetime]]:
    nodes = flight_data.get("nodes") or []
    timestamps = [_to_dt(n.get("timestamp")) for n in nodes]
    timestamps = [t for t in timestamps if t is not None]
    if not timestamps:
        return None, None
    return min(timestamps), max(timestamps)


def flights_overlap_in_time(flight1: Dict[str, Any], flight2: Dict[str, Any], max_diff_minutes: int = 60) -> bool:
    start1, end1 = get_time_window(flight1)
    start2, end2 = get_time_window(flight2)
    if None in [start1, end1, start2, end2]:
        return False
    tolerance = timedelta(minutes=max_diff_minutes)
    return (start1 - tolerance <= end2) and (start2 - tolerance <= end1)


def find_formation_segment(
    flight1: Dict[str, Any],
    flight2: Dict[str, Any],
    max_separation_km: float,
    max_time_diff_minutes: int,
) -> Optional[Dict[str, Any]]:
    """
    Find a segment where two flights can fly in formation.
    More efficient than O(n^2): only compares nodes within the time window.
    """
    nodes1 = flight1.get("nodes") or []
    nodes2 = flight2.get("nodes") or []
    if len(nodes1) < 2 or len(nodes2) < 2:
        return None

    # Pre-parse timestamps
    t2_list = [_to_dt(n.get("timestamp")) for n in nodes2]
    if any(t is None for t in t2_list):
        # If timestamps are missing/unparseable, fall back to no segment
        return None

    max_dt = timedelta(minutes=max_time_diff_minutes)

    compatible_points: List[Dict[str, Any]] = []
    j0 = 0

    for i, n1 in enumerate(nodes1):
        t1 = _to_dt(n1.get("timestamp"))
        if t1 is None:
            continue

        # Advance j0 so nodes2[j0] is within (t1 - max_dt)
        while j0 < len(nodes2) and t2_list[j0] < (t1 - max_dt):
            j0 += 1

        j = j0
        while j < len(nodes2) and t2_list[j] <= (t1 + max_dt):
            n2 = nodes2[j]
            dist = haversine_distance(n1["lat"], n1["lon"], n2["lat"], n2["lon"])
            if dist <= max_separation_km:
                time_diff_min = abs((t1 - t2_list[j]).total_seconds() / 60.0)
                compatible_points.append(
                    {
                        "idx1": i,
                        "idx2": j,
                        "time1": t1,
                        "time2": t2_list[j],
                        "lat1": n1["lat"],
                        "lon1": n1["lon"],
                        "lat2": n2["lat"],
                        "lon2": n2["lon"],
                        "distance_km": dist,
                        "time_diff_min": time_diff_min,
                    }
                )
            j += 1

    if not compatible_points:
        return None

    # Find the longest "continuous" segment (by idx1 continuity, simple heuristic)
    compatible_points.sort(key=lambda x: (x["idx1"], x["idx2"]))

    best_segment: List[Dict[str, Any]] = []
    current_segment: List[Dict[str, Any]] = []

    for point in compatible_points:
        if not current_segment:
            current_segment = [point]
            continue

        prev = current_segment[-1]
        if point["idx1"] == prev["idx1"] + 1 or point["idx1"] == prev["idx1"]:
            current_segment.append(point)
        else:
            if len(current_segment) > len(best_segment):
                best_segment = current_segment
            current_segment = [point]

    if len(current_segment) > len(best_segment):
        best_segment = current_segment

    if len(best_segment) < 2:
        return None

    join_idx1 = min(p["idx1"] for p in best_segment)
    split_idx1 = max(p["idx1"] for p in best_segment)
    join_idx2 = min(p["idx2"] for p in best_segment)
    split_idx2 = max(p["idx2"] for p in best_segment)

    return {
        "join_index_flight1": join_idx1,
        "split_index_flight1": split_idx1,
        "join_index_flight2": join_idx2,
        "split_index_flight2": split_idx2,
        "formation_points": best_segment,
    }


def calculate_formation_metrics(
    segment_info: Dict[str, Any],
    min_formation_minutes: int,
) -> Optional[Dict[str, Any]]:
    points = segment_info.get("formation_points") or []
    if len(points) < 2:
        return None

    start_time = points[0]["time1"]
    end_time = points[-1]["time1"]
    formation_minutes = (end_time - start_time).total_seconds() / 60.0
    if formation_minutes < min_formation_minutes:
        return None

    formation_distance_km = 0.0
    for i in range(1, len(points)):
        p1 = points[i - 1]
        p2 = points[i]
        formation_distance_km += haversine_distance(p1["lat1"], p1["lon1"], p2["lat1"], p2["lon1"])

    avg_separation = sum(p["distance_km"] for p in points) / len(points)
    detour_km = avg_separation * 0.5

    fuel_saved_kg = formation_distance_km * FUEL_BURN_RATE_KG_PER_KM * FUEL_SAVINGS_RATE
    co2_saved_kg = fuel_saved_kg * CO2_PER_KG_FUEL

    detour_penalty = detour_km * 0.5
    score = co2_saved_kg - detour_penalty

    return {
        "formation_minutes": round(formation_minutes, 1),
        "formation_distance_km": round(formation_distance_km, 1),
        "detour_km": round(detour_km, 1),
        "fuel_saved_kg": round(fuel_saved_kg, 1),
        "co2_saved_kg": round(co2_saved_kg, 1),
        "avg_separation_km": round(avg_separation, 2),
        "score": round(score, 1),
    }


def _clamp(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else hi if x > hi else x


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def resample_nodes_to_points(
    nodes: List[Dict[str, Any]],
    n_points: int,
    *,
    round_decimals: int = 5,
    base_step_seconds: float = 20.0,
) -> List[Dict[str, Any]]:
    """
    Resample raw flight nodes into a fixed-length list of {t, lon, lat} points.

    Why: the frontend replay interpolates by array index (uniform progress), not
    by timestamp. If the raw nodes are sparse/irregular, the plane can appear
    to "jump". Resampling both leader and follower to the same length yields
    smooth, consistent motion and smoother split transitions.
    """
    if not nodes:
        return []
    if len(nodes) == 1:
        n = nodes[0]
        return [{"t": 0, "lon": round(float(n["lon"]), round_decimals), "lat": round(float(n["lat"]), round_decimals)}]

    raw_len = len(nodes)
    n_points = int(_clamp(n_points, 2, MAX_REPLAY_POINTS))

    # Preserve "nominal" duration implied by prior i*20 encoding.
    total_duration = (raw_len - 1) * float(base_step_seconds)
    if n_points <= 1 or total_duration <= 0:
        total_duration = float(base_step_seconds)

    out: List[Dict[str, Any]] = []
    for i in range(n_points):
        # Position along the raw polyline in "node index space"
        u = (i / (n_points - 1)) * (raw_len - 1)
        j = int(math.floor(u))
        t = u - j
        j2 = min(j + 1, raw_len - 1)

        n1 = nodes[j]
        n2 = nodes[j2]
        lon = _lerp(float(n1["lon"]), float(n2["lon"]), t)
        lat = _lerp(float(n1["lat"]), float(n2["lat"]), t)

        # Time in seconds across the resampled track (not used by current replay,
        # but useful for debugging and future improvements).
        tt = (i / (n_points - 1)) * total_duration

        out.append({"t": round(tt, 3), "lon": round(lon, round_decimals), "lat": round(lat, round_decimals)})

    return out


def build_scenario(
    flight1_id: int,
    flight2_id: int,
    flight1_data: Dict[str, Any],
    flight2_data: Dict[str, Any],
    segment_info: Dict[str, Any],
    metrics: Dict[str, Any],
    scenario_id: str,
) -> Dict[str, Any]:
    nodes1 = flight1_data["nodes"]
    nodes2 = flight2_data["nodes"]

    # Build a denser, equal-length replay track for leader & follower so the
    # follower doesn't "jump" when rejoining its own path after split.
    target_points = int(_clamp(TARGET_REPLAY_POINTS, 2, MAX_REPLAY_POINTS))

    leader_points = resample_nodes_to_points(nodes1, target_points)
    follower_points = resample_nodes_to_points(nodes2, target_points)

    # Map formation join/split from raw leader indices into resampled indices.
    # (Formation segment detection is done on raw nodes.)
    denom = max(1, (len(nodes1) - 1))
    join_frac = float(segment_info["join_index_flight1"]) / denom
    split_frac = float(segment_info["split_index_flight1"]) / denom
    join_idx = int(round(join_frac * (target_points - 1)))
    split_idx = int(round(split_frac * (target_points - 1)))
    join_idx = int(_clamp(join_idx, 0, target_points - 1))
    split_idx = int(_clamp(split_idx, 0, target_points - 1))
    if split_idx < join_idx:
        join_idx, split_idx = split_idx, join_idx

    if metrics["score"] > 5000:
        savings_preset = "optimistic"
    elif metrics["score"] > 2000:
        savings_preset = "expected"
    else:
        savings_preset = "conservative"

    def first_date(nodes: List[Dict[str, Any]]) -> str:
        ts = _to_dt(nodes[0].get("timestamp")) if nodes else None
        return ts.strftime("%Y-%m-%d") if ts else ""

    carrier1 = flight1_data.get("carrier") or ""
    carrier2 = flight2_data.get("carrier") or ""

    scenario = {
        "id": scenario_id,
        "title": f"{flight1_data.get('origin','?')}-{flight1_data.get('dest','?')} / {flight2_data.get('origin','?')}-{flight2_data.get('dest','?')} Formation",
        "description": f"Formation opportunity between {carrier1} and {carrier2}",
        "savingsPreset": savings_preset,
        "leader": {
            "id": str(flight1_id),
            "label": f"{carrier1}{flight1_id}",
            "route": f"{flight1_data.get('origin','?')}-{flight1_data.get('dest','?')}",
            "airline": carrier1,
            "aircraft": "Unknown",
            "date": first_date(nodes1),
            "points": leader_points,
        },
        "follower": {
            "id": str(flight2_id),
            "label": f"{carrier2}{flight2_id}",
            "route": f"{flight2_data.get('origin','?')}-{flight2_data.get('dest','?')}",
            "airline": carrier2,
            "aircraft": "Unknown",
            "date": first_date(nodes2),
            "points": follower_points,
        },
        "joinIndex": int(join_idx),
        "splitIndex": int(split_idx),
        "metrics": {
            "formationMinutes": metrics["formation_minutes"],
            "formationDistanceKm": metrics["formation_distance_km"],
            "detourKm": metrics["detour_km"],
            "fuelSavedKg": metrics["fuel_saved_kg"],
            "co2SavedKg": metrics["co2_saved_kg"],
        },
    }
    return scenario


def generate_rankings(scenarios: List[Dict[str, Any]], metrics_by_id: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    rankings = []
    for rank, scenario in enumerate(scenarios, 1):
        metrics = metrics_by_id[scenario["id"]]
        rankings.append(
            {
                "rank": rank,
                "scenarioId": scenario["id"],
                "flightA": scenario["leader"]["label"],
                "flightB": scenario["follower"]["label"],
                "routeA": scenario["leader"]["route"],
                "routeB": scenario["follower"]["route"],
                "formationMinutes": metrics["formation_minutes"],
                "co2SavedKg": metrics["co2_saved_kg"],
                "fuelSavedKg": metrics["fuel_saved_kg"],
                "detourKm": metrics["detour_km"],
                "score": metrics["score"],
            }
        )
    return rankings


def find_candidate_pairs_by_origin_or_dest(
    flights: Dict[int, Dict[str, Any]], max_pairs: int
) -> List[Tuple[int, int]]:
    by_origin: Dict[str, List[int]] = defaultdict(list)
    by_dest: Dict[str, List[int]] = defaultdict(list)
    for flight_id, data in flights.items():
        origin = data.get("origin")
        if origin:
            by_origin[str(origin)].append(flight_id)
        dest = data.get("dest")
        if dest:
            by_dest[str(dest)].append(flight_id)

    candidates: List[Tuple[int, int]] = []

    def add_group(ids: List[int]) -> None:
        nonlocal candidates
        ids = sorted(set(ids))
        for f1, f2 in combinations(ids, 2):
            if len(candidates) >= max_pairs:
                return
            if flights_overlap_in_time(flights[f1], flights[f2]):
                candidates.append((f1, f2))

    # Prefer same-origin groups first (often yields similar routes),
    # then same-destination groups to increase coverage.
    for _, ids in sorted(by_origin.items(), key=lambda kv: len(kv[1]), reverse=True):
        if len(candidates) >= max_pairs:
            break
        add_group(ids)

    for _, ids in sorted(by_dest.items(), key=lambda kv: len(kv[1]), reverse=True):
        if len(candidates) >= max_pairs:
            break
        add_group(ids)

    # Deduplicate exact flight-id pairs (origin and dest grouping can overlap)
    uniq = []
    seen = set()
    for a, b in candidates:
        key = (a, b) if a < b else (b, a)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(key)
        if len(uniq) >= max_pairs:
            break

    return uniq


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-scenarios", default=DEFAULT_OUT_SCENARIOS)
    parser.add_argument("--out-matches", default=DEFAULT_OUT_MATCHES)
    parser.add_argument("--max-flights", type=int, default=5000)
    parser.add_argument("--max-scenarios", type=int, default=100)
    parser.add_argument("--max-pairs", type=int, default=20000)
    parser.add_argument("--max-separation-km", type=float, default=MAX_SEPARATION_KM_DEFAULT)
    parser.add_argument("--max-time-diff-minutes", type=int, default=MAX_TIME_DIFF_MINUTES_DEFAULT)
    parser.add_argument("--min-formation-minutes", type=int, default=MIN_FORMATION_TIME_MINUTES_DEFAULT)
    parser.add_argument(
        "--flight-id-sampling",
        choices=["random", "first"],
        default="random",
        help="How to choose flight_ids from flight_nodes (random yields more variety).",
    )
    args = parser.parse_args()

    mongo_uri = os.getenv("MONGODB_URI") or os.getenv("MONGO_ATLAS_URI") or "mongodb://localhost:27017/"
    db_name = os.getenv("MONGODB_DB_NAME", "flights")
    collection_name = "flight_nodes"

    print("=" * 60)
    print("Generate frontend demo data from flight_nodes")
    print("=" * 60)

    print("\nConnecting to MongoDB...")
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=10000)
    client.admin.command("ping")
    print("✓ Connected")

    db = client[db_name]
    col = db[collection_name]

    flights = get_flight_data(col, max_flights=args.max_flights, sampling=args.flight_id_sampling)
    if len(flights) < 2:
        print("Not enough flights to generate scenarios.")
        return 1

    print("Finding candidate pairs (same origin OR same destination + overlapping time windows)...")
    candidates = find_candidate_pairs_by_origin_or_dest(flights, max_pairs=args.max_pairs)
    print(f"Candidates: {len(candidates)}")

    scenarios: List[Dict[str, Any]] = []
    metrics_by_id: Dict[str, Dict[str, Any]] = {}

    for idx, (f1_id, f2_id) in enumerate(candidates):
        if len(scenarios) >= args.max_scenarios:
            break

        flight1 = flights[f1_id]
        flight2 = flights[f2_id]

        segment = find_formation_segment(
            flight1,
            flight2,
            max_separation_km=args.max_separation_km,
            max_time_diff_minutes=args.max_time_diff_minutes,
        )
        if not segment:
            continue

        metrics = calculate_formation_metrics(segment, min_formation_minutes=args.min_formation_minutes)
        if not metrics:
            continue
        if metrics["score"] <= 0:
            continue

        scenario_id = f"scenario-{len(scenarios) + 1}"
        scenario = build_scenario(f1_id, f2_id, flight1, flight2, segment, metrics, scenario_id)
        scenarios.append(scenario)
        metrics_by_id[scenario_id] = metrics

        if (idx + 1) % 100 == 0:
            print(f"Processed {idx+1}/{len(candidates)} pairs -> {len(scenarios)} scenarios")

    # Rank scenarios by score (descending) and re-number ranks in matches.json accordingly
    scenarios.sort(key=lambda s: metrics_by_id[s["id"]]["score"], reverse=True)
    rankings = generate_rankings(scenarios, metrics_by_id)

    # Write outputs
    print(f"\nWriting scenarios -> {args.out_scenarios}")
    with open(args.out_scenarios, "w") as f:
        json.dump(scenarios, f, indent=2, default=str)

    print(f"Writing matches -> {args.out_matches}")
    with open(args.out_matches, "w") as f:
        json.dump(rankings, f, indent=2)

    print(f"\n✓ Wrote {len(scenarios)} scenarios and {len(rankings)} ranked matches")
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

