"""
Upsample existing frontend demo JSON so replay motion is smooth.

Why this exists:
- The frontend replay interpolates along point arrays by index (uniform progress).
- If a scenario's leader/follower tracks are sparse, the planes can "jump",
  especially when the follower transitions back to its own path after split.

This script rewrites:
- frontend/src/data/scenarios.json
- frontend/src/data/matches.json (re-ranked by score, but otherwise same fields)
"""

from __future__ import annotations

import argparse
import json
import math
from typing import Any, Dict, List

# Keep these aligned with scripts/generate_frontend_demo_data.py
TARGET_REPLAY_POINTS = 600
MAX_REPLAY_POINTS = 2000


def _clamp(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else hi if x > hi else x


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def resample_points(points: List[Dict[str, Any]], n_points: int, *, round_decimals: int = 5) -> List[Dict[str, Any]]:
    if not points:
        return []
    if len(points) == 1:
        p = points[0]
        return [{"t": 0, "lon": round(float(p["lon"]), round_decimals), "lat": round(float(p["lat"]), round_decimals)}]

    raw_len = len(points)
    n_points = int(_clamp(n_points, 2, MAX_REPLAY_POINTS))

    # Preserve existing t-span if present, else fallback to [0..raw_len-1]
    t0 = float(points[0].get("t", 0))
    t1 = float(points[-1].get("t", raw_len - 1))
    total_duration = (t1 - t0) if t1 > t0 else float(raw_len - 1)

    out: List[Dict[str, Any]] = []
    for i in range(n_points):
        u = (i / (n_points - 1)) * (raw_len - 1)
        j = int(math.floor(u))
        t = u - j
        j2 = min(j + 1, raw_len - 1)

        p1 = points[j]
        p2 = points[j2]
        lon = _lerp(float(p1["lon"]), float(p2["lon"]), t)
        lat = _lerp(float(p1["lat"]), float(p2["lat"]), t)
        tt = t0 + (i / (n_points - 1)) * total_duration

        out.append({"t": round(tt, 3), "lon": round(lon, round_decimals), "lat": round(lat, round_decimals)})

    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenarios", default="frontend/src/data/scenarios.json")
    ap.add_argument("--matches", default="frontend/src/data/matches.json")
    ap.add_argument("--target-points", type=int, default=TARGET_REPLAY_POINTS)
    args = ap.parse_args()

    with open(args.scenarios, "r") as f:
        scenarios = json.load(f)

    # Upsample scenarios in-place
    for s in scenarios:
        leader_pts = s.get("leader", {}).get("points") or []
        follower_pts = s.get("follower", {}).get("points") or []

        if max(len(leader_pts), len(follower_pts)) < 2:
            continue

        target_points = int(_clamp(args.target_points, 2, MAX_REPLAY_POINTS))

        # Map join/split from old leader indices -> fraction -> new indices.
        denom = max(1, (len(leader_pts) - 1))
        join_frac = float(s.get("joinIndex", 0)) / denom
        split_frac = float(s.get("splitIndex", 0)) / denom

        s["leader"]["points"] = resample_points(leader_pts, target_points)
        s["follower"]["points"] = resample_points(follower_pts, target_points)

        join_idx = int(round(join_frac * (target_points - 1)))
        split_idx = int(round(split_frac * (target_points - 1)))
        join_idx = int(_clamp(join_idx, 0, target_points - 1))
        split_idx = int(_clamp(split_idx, 0, target_points - 1))
        if split_idx < join_idx:
            join_idx, split_idx = split_idx, join_idx

        s["joinIndex"] = join_idx
        s["splitIndex"] = split_idx

    with open(args.scenarios, "w") as f:
        json.dump(scenarios, f, indent=2)

    # Re-rank matches (by score desc) so ranks remain consistent after regenerating.
    with open(args.matches, "r") as f:
        matches = json.load(f)

    matches.sort(key=lambda m: float(m.get("score", 0.0)), reverse=True)
    for i, m in enumerate(matches, 1):
        m["rank"] = i

    with open(args.matches, "w") as f:
        json.dump(matches, f, indent=2)

    print(f"✓ Upsampled {len(scenarios)} scenarios; re-ranked {len(matches)} matches")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

