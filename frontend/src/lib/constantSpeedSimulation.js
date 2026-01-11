/**
 * Constant Speed Two-Plane Simulation with Path Constraints
 * 
 * This module implements a simulation where two planes (red leader, yellow follower)
 * move at constant speeds along predefined paths with strict ordering constraints.
 * 
 * Key features:
 * - 1D along-track distance parameterization
 * - Constant speed motion (no acceleration)
 * - Yellow plane snaps to red's track at merge point
 * - Yellow must always be behind red after merge
 * - Yellow stops exactly at destination
 */

import { haversineDistance } from "./geo";

/**
 * Haversine distance calculation (wrapper for consistency)
 */
function haversine(lat1, lon1, lat2, lon2) {
  return haversineDistance(lon1, lat1, lon2, lat2);
}

/**
 * Compute cumulative distances along a path
 * @param {Array} points - Array of points with {lat, lon}
 * @returns {Array} Cumulative distances from start (km)
 */
function computeCumulativeDistances(points) {
  if (!points || points.length === 0) return [];
  
  const distances = [0];
  let totalDistance = 0;
  
  for (let i = 1; i < points.length; i++) {
    const dist = haversine(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
    totalDistance += dist;
    distances.push(totalDistance);
  }
  
  return distances;
}

/**
 * Find position along path at a given distance
 * @param {Array} points - Array of points with {lat, lon}
 * @param {Array} cumulativeDistances - Cumulative distances array
 * @param {number} targetDistance - Target distance along path (km)
 * @returns {Object} Position with {lat, lon, heading, distance}
 */
function positionAtDistance(points, cumulativeDistances, targetDistance) {
  if (!points || points.length === 0) return null;
  if (cumulativeDistances.length !== points.length) return null;
  
  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];
  
  // Clamp to path bounds
  if (targetDistance <= 0) {
    return {
      lat: points[0].lat,
      lon: points[0].lon,
      heading: points.length > 1 
        ? calculateHeading(points[0].lat, points[0].lon, points[1].lat, points[1].lon)
        : 0,
      distance: 0,
    };
  }
  
  if (targetDistance >= totalDistance) {
    const lastIdx = points.length - 1;
    return {
      lat: points[lastIdx].lat,
      lon: points[lastIdx].lon,
      heading: points.length > 1
        ? calculateHeading(points[lastIdx - 1].lat, points[lastIdx - 1].lon, points[lastIdx].lat, points[lastIdx].lon)
        : 0,
      distance: totalDistance,
    };
  }
  
  // Binary search for segment
  let lo = 0;
  let hi = cumulativeDistances.length - 1;
  
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (cumulativeDistances[mid] <= targetDistance) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  
  // Interpolate within segment
  const dist1 = cumulativeDistances[lo];
  const dist2 = cumulativeDistances[hi];
  const segmentDist = dist2 - dist1;
  const fraction = segmentDist > 0 ? (targetDistance - dist1) / segmentDist : 0;
  
  const p1 = points[lo];
  const p2 = points[hi];
  
  const lat = p1.lat + (p2.lat - p1.lat) * fraction;
  const lon = p1.lon + (p2.lon - p1.lon) * fraction;
  const heading = calculateHeading(p1.lat, p1.lon, p2.lat, p2.lon);
  
  return { lat, lon, heading, distance: targetDistance };
}

/**
 * Calculate heading between two points
 */
function calculateHeading(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  return Math.atan2(
    Math.sin(Δλ) * Math.cos(φ2),
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  );
}

/**
 * Find merge point index in paths
 * @param {Array} redPoints - Red plane path points
 * @param {Array} yellowPoints - Yellow plane path points
 * @param {number} joinIndex - Index where paths join (in normalized path)
 * @returns {Object} Merge information
 */
function findMergePoint(redPoints, yellowPoints, joinIndex) {
  // For simplicity, assume joinIndex corresponds to a point in the paths
  // In practice, you'd find the actual merge point based on path geometry
  const redMergeIdx = Math.min(joinIndex, redPoints.length - 1);
  const yellowMergeIdx = Math.min(joinIndex, yellowPoints.length - 1);
  
  return {
    redMergeIdx,
    yellowMergeIdx,
    mergePoint: redPoints[redMergeIdx], // Merge point is on red's track
  };
}

/**
 * Solve for initial start times and constant speeds
 * @param {Object} scenario - Scenario with leader (red) and follower (yellow) paths
 * @param {Object} options - Options for speed selection
 * @returns {Object} Solution with speeds and start times
 */
export function solveConstantSpeedMotion(scenario, options = {}) {
  const {
    redSpeedKmMin = 13.33, // 800 km/h = 13.33 km/min
    speedRatio = 0.95, // Yellow is 95% of red speed (ensures v_y < v_r)
  } = options;
  
  if (!scenario?.leader || !scenario?.follower) {
    throw new Error("Scenario must have leader and follower paths");
  }
  
  const redPoints = scenario.leader.points;
  const yellowPoints = scenario.follower.points;
  const joinIndex = scenario.joinIndex ?? 0;
  
  // Compute cumulative distances
  const redDistances = computeCumulativeDistances(redPoints);
  const yellowDistances = computeCumulativeDistances(yellowPoints);
  
  // Find merge point
  const mergeInfo = findMergePoint(redPoints, yellowPoints, joinIndex);
  const s_r_merge = redDistances[mergeInfo.redMergeIdx];
  const s_y_merge = yellowDistances[mergeInfo.yellowMergeIdx];
  
  // Destination distance (end of red path, which is the merged track)
  const s_dest = redDistances[redDistances.length - 1];
  
  // Choose speeds
  const v_r = redSpeedKmMin;
  const v_y = v_r * speedRatio; // Must be < v_r for ordering constraint
  
  // Choose red start time (reference time = 0)
  const t_r0 = 0;
  
  // Solve for yellow start time from merge condition:
  // t_r0 + s_r_merge / v_r = t_y0 + s_y_merge / v_y
  const t_merge = s_r_merge / v_r; // Time for red to reach merge
  const t_y0 = t_merge - s_y_merge / v_y;
  
  // Verify ordering at merge
  const s_r_at_merge = v_r * (t_merge - t_r0);
  const s_y_at_merge = v_y * (t_merge - t_y0);
  
  // Validation: Ordering constraint
  if (s_r_at_merge <= s_y_at_merge) {
    throw new Error(
      `Ordering constraint violation at merge: red distance (${s_r_at_merge.toFixed(2)} km) ` +
      `must be greater than yellow distance (${s_y_at_merge.toFixed(2)} km). ` +
      `Consider adjusting speeds or start times.`
    );
  }
  
  // Validation: Speed ordering (required for post-merge)
  if (v_y >= v_r) {
    throw new Error(
      `Speed constraint violation: yellow speed (${v_y.toFixed(2)} km/min) ` +
      `must be less than red speed (${v_r.toFixed(2)} km/min) for post-merge ordering.`
    );
  }
  
  // Validation: Yellow start time should be reasonable
  if (t_y0 < 0 && Math.abs(t_y0) > 1000) {
    console.warn(`Yellow start time is very negative (${t_y0.toFixed(2)} min). This may indicate path configuration issues.`);
  }
  
  return {
    v_r, // km/min
    v_y, // km/min
    t_r0, // minutes
    t_y0, // minutes
    t_merge, // minutes
    s_r_merge, // km
    s_y_merge, // km
    s_dest, // km
    redDistances,
    yellowDistances,
    mergeInfo,
  };
}

/**
 * Simulate plane positions at a given time
 * @param {number} t - Current time (minutes)
 * @param {Object} solution - Solution from solveConstantSpeedMotion
 * @param {Object} scenario - Scenario with paths
 * @returns {Object} Positions of red and yellow planes
 */
export function simulateAtTime(t, solution, scenario) {
  const {
    v_r,
    v_y,
    t_r0,
    t_y0,
    t_merge,
    s_r_merge,
    s_y_merge,
    s_dest,
    redDistances,
    yellowDistances,
    mergeInfo,
  } = solution;
  
  const redPoints = scenario.leader.points;
  const yellowPoints = scenario.follower.points;
  
  let redPos, yellowPos;
  let phase;
  
  if (t < t_merge) {
    // Phase 1: Before merge
    phase = "before_merge";
    
    // Red plane: moves along its path
    const s_r = Math.max(0, Math.min(s_r_merge, v_r * (t - t_r0)));
    redPos = positionAtDistance(redPoints, redDistances, s_r);
    
    // Yellow plane: moves along its path (not allowed to leave)
    const s_y = Math.max(0, Math.min(s_y_merge, v_y * (t - t_y0)));
    yellowPos = positionAtDistance(yellowPoints, yellowDistances, s_y);
  } else {
    // Phase 2: After merge (both on merged track = red's track)
    phase = "after_merge";
    
    const dt = t - t_merge;
    
    // Red plane: continues along merged track
    const s_r_merged = Math.min(s_dest, s_r_merge + v_r * dt);
    redPos = positionAtDistance(redPoints, redDistances, s_r_merged);
    
    // Yellow plane: snapped to merged track, must stay behind red
    let s_y_merged = s_r_merge + v_y * dt;
    
    // Ordering constraint: yellow must be behind red (strict inequality)
    // Since v_y < v_r, this should naturally hold, but enforce it strictly
    const minGap = 0.001; // Minimum gap in km (1 meter) to ensure strict inequality
    if (s_y_merged >= s_r_merged - minGap) {
      s_y_merged = s_r_merged - minGap;
    }
    
    // Yellow stops exactly at destination (must not overshoot)
    if (s_y_merged >= s_dest) {
      s_y_merged = s_dest;
    }
    
    yellowPos = positionAtDistance(redPoints, redDistances, s_y_merged);
  }
  
  return {
    redPos,
    yellowPos,
    phase,
    t,
    distances: {
      red: redPos?.distance ?? 0,
      yellow: yellowPos?.distance ?? 0,
    },
  };
}

/**
 * Create a constant speed replay controller
 * @param {Object} scenario - Scenario with leader and follower paths
 * @param {Object} options - Options for simulation
 * @returns {Object} Replay controller
 */
export function createConstantSpeedReplayController(scenario, options = {}) {
  const {
    speedMultiplier = 1,
    onUpdate = () => {},
    onPhaseChange = () => {},
    onComplete = () => {},
  } = options;
  
  // Solve for speeds and start times
  const solution = solveConstantSpeedMotion(scenario, options);
  
  // Animation state
  let animFrame = null;
  let playing = false;
  let currentTime = 0;
  let lastTs = null;
  
  const DURATION = 30000; // 30 seconds total animation
  const maxTime = Math.max(
    solution.t_merge + (solution.s_dest - solution.s_r_merge) / solution.v_r,
    solution.t_merge + (solution.s_dest - solution.s_r_merge) / solution.v_y
  );
  
  function update() {
    const state = simulateAtTime(currentTime, solution, scenario);
    
    onUpdate({
      isPlaying: playing,
      progress: currentTime / maxTime,
      phase: state.phase,
      leaderPosition: state.redPos ? {
        lat: state.redPos.lat,
        lon: state.redPos.lon,
        heading: state.redPos.heading,
      } : null,
      followerPosition: state.yellowPos ? {
        lat: state.yellowPos.lat,
        lon: state.yellowPos.lon,
        heading: state.yellowPos.heading,
      } : null,
      distances: state.distances,
    });
    
    if (currentTime >= maxTime) {
      playing = false;
      onComplete();
    }
  }
  
  function animate(ts) {
    if (!playing) return;
    if (lastTs === null) lastTs = ts;
    
    const dt = (ts - lastTs) / 1000 * (maxTime / (DURATION / speedMultiplier));
    lastTs = ts;
    currentTime = Math.min(maxTime, currentTime + dt);
    
    update();
    
    if (currentTime < maxTime && playing) {
      animFrame = requestAnimationFrame(animate);
    }
  }
  
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
      currentTime = 0;
      update();
    },
    
    seek(progress) {
      currentTime = Math.max(0, Math.min(maxTime, progress * maxTime));
      update();
    },
    
    isPlaying: () => playing,
    getState: () => ({
      isPlaying: playing,
      progress: currentTime / maxTime,
      currentTime,
      maxTime,
    }),
    
    destroy() {
      this.stop();
      if (animFrame) cancelAnimationFrame(animFrame);
    },
    
    // Expose solution for inspection
    getSolution: () => solution,
  };
}

export default {
  solveConstantSpeedMotion,
  simulateAtTime,
  createConstantSpeedReplayController,
};

