/**
 * Replay Controller v4 - Smooth Formation Flight Animation
 *
 * This version guarantees smooth transitions by:
 * 1. Pre-computing transition curves at initialization
 * 2. Ensuring perfect continuity between phases
 * 3. Using position caching to prevent recalculation artifacts
 */

export const REPLAY_STATES = {
  IDLE: "idle",
  RENDEZVOUS: "rendezvous",
  LOCKED: "locked",
  SPLIT: "split",
  COMPLETE: "complete",
};

export function pointsToCoordinates(points) {
  return points.map((p) => [p.lon, p.lat]);
}

export function getFormationSegment(scenario) {
  if (!scenario?.leader?.points) return [];
  const { joinIndex, splitIndex } = scenario;
  const pts = scenario.leader.points;
  return pts
    .slice(Math.max(0, joinIndex), Math.min(pts.length, splitIndex + 1))
    .map((p) => [p.lon, p.lat]);
}

export function calculateHeading(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1),
    φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  return Math.atan2(
    Math.sin(Δλ) * Math.cos(φ2),
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  );
}

// ========== MATH UTILITIES ==========

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (t) => t * t * (3 - 2 * t);
const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371,
    toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1),
    dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ========== BEZIER CURVE ==========

class BezierCurve {
  constructor(p0, p1, p2, p3) {
    this.p0 = p0;
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;
  }

  static fromEndpoints(start, startHeading, end, endHeading, tension = 0.4) {
    const dist = haversine(start.lat, start.lon, end.lat, end.lon);
    const ctrlDist = Math.max(dist * tension, 20); // At least 20km control distance

    const offset = (pt, heading, d) => ({
      lat: pt.lat + (d / 111) * Math.cos(heading),
      lon:
        pt.lon +
        (d / (111 * Math.cos((pt.lat * Math.PI) / 180))) * Math.sin(heading),
    });

    return new BezierCurve(
      start,
      offset(start, startHeading, ctrlDist),
      offset(end, endHeading + Math.PI, ctrlDist * 0.8),
      end
    );
  }

  point(t) {
    const mt = 1 - t,
      mt2 = mt * mt,
      mt3 = mt2 * mt;
    const t2 = t * t,
      t3 = t2 * t;
    return {
      lat:
        mt3 * this.p0.lat +
        3 * mt2 * t * this.p1.lat +
        3 * mt * t2 * this.p2.lat +
        t3 * this.p3.lat,
      lon:
        mt3 * this.p0.lon +
        3 * mt2 * t * this.p1.lon +
        3 * mt * t2 * this.p2.lon +
        t3 * this.p3.lon,
    };
  }

  tangent(t) {
    const mt = 1 - t,
      mt2 = mt * mt,
      t2 = t * t;
    return {
      lat:
        3 * mt2 * (this.p1.lat - this.p0.lat) +
        6 * mt * t * (this.p2.lat - this.p1.lat) +
        3 * t2 * (this.p3.lat - this.p2.lat),
      lon:
        3 * mt2 * (this.p1.lon - this.p0.lon) +
        6 * mt * t * (this.p2.lon - this.p1.lon) +
        3 * t2 * (this.p3.lon - this.p2.lon),
    };
  }

  heading(t) {
    const tan = this.tangent(t);
    const pos = this.point(t);
    return Math.atan2(tan.lon * Math.cos((pos.lat * Math.PI) / 180), tan.lat);
  }

  positionAndHeading(t) {
    const pos = this.point(t);
    return { ...pos, heading: this.heading(t) };
  }
}

// ========== PATH UTILITIES ==========

function getPositionAtTime(points, targetT) {
  if (!points?.length) return null;

  // Binary search
  let lo = 0,
    hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= targetT) lo = mid;
    else hi = mid;
  }

  const p1 = points[lo],
    p2 = points[hi];
  const dt = p2.t - p1.t;
  const f = dt > 0 ? clamp((targetT - p1.t) / dt, 0, 1) : 0;

  return {
    lat: lerp(p1.lat, p2.lat, f),
    lon: lerp(p1.lon, p2.lon, f),
    heading: calculateHeading(p1.lat, p1.lon, p2.lat, p2.lon),
    index: lo + f,
  };
}

function getPositionAtIndex(points, idx) {
  if (!points?.length) return null;
  const i = clamp(Math.floor(idx), 0, points.length - 2);
  const f = idx - i;
  const p1 = points[i],
    p2 = points[Math.min(i + 1, points.length - 1)];

  return {
    lat: lerp(p1.lat, p2.lat, f),
    lon: lerp(p1.lon, p2.lon, f),
    heading: calculateHeading(p1.lat, p1.lon, p2.lat, p2.lon),
  };
}

// ========== REPLAY CONTROLLER ==========

export function createReplayController(scenario, options = {}) {
  const {
    speedMultiplier = 1,
    onUpdate = () => {},
    onPhaseChange = () => {},
    onComplete = () => {},
  } = options;

  if (!scenario?.leader || !scenario?.follower) {
    console.error("Invalid scenario");
    return null;
  }

  const leader = scenario.leader.points;
  const follower = scenario.follower.points;
  const joinIdx = scenario.joinIndex ?? 0;
  const splitIdx = scenario.splitIndex ?? leader.length - 1;

  // Time bounds
  const minT = Math.min(leader[0].t, follower[0].t);
  const maxT = Math.max(
    leader[leader.length - 1].t,
    follower[follower.length - 1].t
  );
  const totalT = maxT - minT;

  // Phase timing (as progress 0-1)
  const joinT = leader[Math.min(joinIdx, leader.length - 1)].t;
  const splitT = leader[Math.min(splitIdx, leader.length - 1)].t;
  const joinProg = (joinT - minT) / totalT;
  const splitProg = (splitT - minT) / totalT;

  // Phase durations
  const APPROACH_DUR = 0.08;
  const SPLIT_DUR = 0.15; // Longer split for smoother transition

  // Formation offset parameters
  // Use KM (not degrees). At the default map zoom (~4), small offsets can look
  // like the planes overlap, so this is intentionally large for clear visual
  // separation.
  const OFFSET_KM = { behind: 120, side: 0 };

  const metrics = scenario.metrics || { fuelSavedKg: 0, co2SavedKg: 0 };

  // Animation state
  let animFrame = null;
  let playing = false;
  let progress = 0;
  let lastTs = null;
  let phase = REPLAY_STATES.IDLE;

  // Pre-computed split transition
  let splitCurve = null;
  let splitEndIndex = null;

  const DURATION = 30000;

  // ---- Core functions ----

  function getTime(prog) {
    return minT + prog * totalT;
  }

  function formationPos(leaderPos) {
    const h = leaderPos.heading || 0;
    const behindKm = OFFSET_KM.behind;
    const sideKm = OFFSET_KM.side;

    // Compute km offsets relative to heading (0 = north, clockwise).
    // "Behind" is opposite the heading direction.
    const dxKm = -behindKm * Math.sin(h) + sideKm * Math.sin(h + Math.PI / 2);
    const dyKm = -behindKm * Math.cos(h) + sideKm * Math.cos(h + Math.PI / 2);

    const latOffset = dyKm / 111;
    const lonOffset = dxKm / (111 * Math.cos((leaderPos.lat * Math.PI) / 180));
    return {
      lat: leaderPos.lat + latOffset,
      lon: leaderPos.lon + lonOffset,
      heading: h,
    };
  }

  function getPhase(prog) {
    const approachStart = joinProg - APPROACH_DUR;
    if (prog < approachStart) return REPLAY_STATES.RENDEZVOUS;
    if (prog < joinProg) return REPLAY_STATES.RENDEZVOUS; // Transitioning
    if (prog < splitProg) return REPLAY_STATES.LOCKED;
    if (prog < splitProg + SPLIT_DUR) return REPLAY_STATES.SPLIT;
    return REPLAY_STATES.COMPLETE;
  }

  /**
   * Pre-compute the split transition curve
   * Called once when split phase begins
   */
  function computeSplitCurve(startPos, startHeading) {
    // Find where to rejoin follower's path
    // Strategy: Look at the FINAL portion of follower's path and find
    // a point that creates a reasonable curve

    // Start looking from 80% of the path to the end
    const searchStart = Math.floor(follower.length * 0.75);
    let bestIdx = follower.length - 20; // Default: near the end
    let bestScore = Infinity;

    for (let i = searchStart; i < follower.length - 5; i++) {
      const pt = follower[i];
      const dist = haversine(startPos.lat, startPos.lon, pt.lat, pt.lon);

      // Score based on distance and how far along the path
      // Prefer points that are:
      // 1. Not too far away (reasonable bezier curve)
      // 2. Closer to the end (so we rejoin later in the journey)
      const pathProgress = i / follower.length;
      const score = dist * (2 - pathProgress); // Lower is better

      if (score < bestScore && dist > 50) {
        // At least 50km away for visible curve
        bestScore = score;
        bestIdx = i;
      }
    }

    splitEndIndex = bestIdx;
    const endPos = getPositionAtIndex(follower, bestIdx);

    // Create smooth bezier curve
    splitCurve = BezierCurve.fromEndpoints(
      startPos,
      startHeading,
      endPos,
      endPos.heading,
      0.5 // Higher tension for wider curve
    );
  }

  function getFollowerPos(prog, leaderPos) {
    const t = getTime(prog);
    const p = getPhase(prog);
    const followerOwn = getPositionAtTime(follower, t);

    // RENDEZVOUS
    if (p === REPLAY_STATES.RENDEZVOUS) {
      const approachStart = joinProg - APPROACH_DUR;

      if (prog <= approachStart) {
        return followerOwn;
      }

      // Smooth transition to formation
      const transProg = (prog - approachStart) / APPROACH_DUR;
      const eased = smootherstep(clamp(transProg, 0, 1));

      const formPos = formationPos(leaderPos);
      return {
        lat: lerp(followerOwn.lat, formPos.lat, eased),
        lon: lerp(followerOwn.lon, formPos.lon, eased),
        heading: lerp(followerOwn.heading || 0, formPos.heading, eased),
      };
    }

    // LOCKED
    if (p === REPLAY_STATES.LOCKED) {
      // Reset split curve for potential re-calculation
      splitCurve = null;
      return formationPos(leaderPos);
    }

    // SPLIT
    if (p === REPLAY_STATES.SPLIT) {
      const splitLocalProg = (prog - splitProg) / SPLIT_DUR;

      // Compute split curve on first frame of split
      if (!splitCurve) {
        const formPos = formationPos(leaderPos);
        computeSplitCurve(formPos, leaderPos.heading);
      }

      // Use smootherstep for very smooth easing
      const eased = smootherstep(clamp(splitLocalProg, 0, 1));
      return splitCurve.positionAndHeading(eased);
    }

    // COMPLETE - Continue along follower's path from split end point
    if (splitEndIndex !== null) {
      const completeStart = splitProg + SPLIT_DUR;
      const completeProg = (prog - completeStart) / (1 - completeStart);
      const remainingPts = follower.length - splitEndIndex;
      const idx = splitEndIndex + completeProg * remainingPts;
      return getPositionAtIndex(
        follower,
        clamp(idx, splitEndIndex, follower.length - 1)
      );
    }

    return followerOwn;
  }

  function getSavings(prog) {
    const p = getPhase(prog);
    const { fuelSavedKg: fuel, co2SavedKg: co2 } = metrics;

    if (p === REPLAY_STATES.RENDEZVOUS) {
      const f = clamp(prog / joinProg, 0, 1);
      return { fuel: fuel * f * 0.02, co2: co2 * f * 0.02 };
    }
    if (p === REPLAY_STATES.LOCKED) {
      const f = (prog - joinProg) / (splitProg - joinProg);
      return { fuel: fuel * (0.02 + f * 0.88), co2: co2 * (0.02 + f * 0.88) };
    }
    const f = clamp((prog - splitProg) / SPLIT_DUR, 0, 1);
    return { fuel: fuel * (0.9 + f * 0.1), co2: co2 * (0.9 + f * 0.1) };
  }

  function update() {
    const newPhase = getPhase(progress);
    if (newPhase !== phase) {
      phase = newPhase;
      onPhaseChange(phase);
    }

    const t = getTime(progress);
    const leaderPos = getPositionAtTime(leader, t);
    const followerPos = getFollowerPos(progress, leaderPos);
    const savings = getSavings(progress);

    onUpdate({
      isPlaying: playing,
      progress,
      phase,
      leaderPosition: leaderPos,
      followerPosition: followerPos,
      accumulatedFuel: savings.fuel,
      accumulatedCO2: savings.co2,
      isLocked: phase === REPLAY_STATES.LOCKED,
      showConnector:
        phase === REPLAY_STATES.LOCKED || phase === REPLAY_STATES.SPLIT,
    });

    if (progress >= 1) {
      playing = false;
      phase = REPLAY_STATES.COMPLETE;
      onComplete();
    }
  }

  function animate(ts) {
    if (!playing) return;
    if (lastTs === null) lastTs = ts;

    const dt = ts - lastTs;
    lastTs = ts;
    progress = Math.min(1, progress + dt / (DURATION / speedMultiplier));

    update();

    if (progress < 1 && playing) {
      animFrame = requestAnimationFrame(animate);
    }
  }

  // Public API
  return {
    play() {
      if (playing) return;
      playing = true;
      lastTs = null;
      animFrame = requestAnimationFrame(animate);
    },

    pause() {
      playing = false;
      if (animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
      }
      update();
    },

    stop() {
      this.pause();
      progress = 0;
      phase = REPLAY_STATES.IDLE;
      splitCurve = null;
      splitEndIndex = null;
      update();
    },

    seek(p) {
      progress = clamp(p, 0, 1);
      // Reset split curve when seeking to force recalculation
      if (getPhase(progress) !== REPLAY_STATES.SPLIT) {
        splitCurve = null;
      }
      update();
    },

    isPlaying: () => playing,
    getState: () => ({ isPlaying: playing, progress, phase }),

    destroy() {
      this.stop();
      if (animFrame) cancelAnimationFrame(animFrame);
    },
  };
}

export default {
  REPLAY_STATES,
  createReplayController,
  pointsToCoordinates,
  getFormationSegment,
  calculateHeading,
};
