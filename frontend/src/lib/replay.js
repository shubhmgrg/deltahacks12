/**
 * Enhanced Replay Controller for Formation Flight Visualization
 * 
 * This module handles the animation of two aircraft flying in formation,
 * with smooth transitions during join and split phases using bezier curves.
 */

// Replay states
export const REPLAY_STATES = {
  IDLE: 'idle',
  RENDEZVOUS: 'rendezvous',  // Follower approaching leader
  LOCKED: 'locked',          // In formation
  SPLIT: 'split',            // Separating from formation
  COMPLETE: 'complete'
};

/**
 * Convert scenario points to coordinate arrays for Mapbox
 */
export function pointsToCoordinates(points) {
  return points.map(p => [p.lon, p.lat]);
}

/**
 * Get the formation segment coordinates from a scenario
 */
export function getFormationSegment(scenario) {
  if (!scenario || !scenario.leader || !scenario.leader.points) {
    return [];
  }
  
  const { joinIndex, splitIndex } = scenario;
  const leaderPoints = scenario.leader.points;
  
  // Extract formation segment from leader's path
  const startIdx = Math.max(0, joinIndex);
  const endIdx = Math.min(leaderPoints.length - 1, splitIndex);
  
  return leaderPoints.slice(startIdx, endIdx + 1).map(p => [p.lon, p.lat]);
}

/**
 * Calculate heading (bearing) between two points in radians
 */
export function calculateHeading(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  
  return Math.atan2(y, x);
}

/**
 * Linear interpolation between two values
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Cubic bezier interpolation for smooth curves
 * P0 = start, P1 = control1, P2 = control2, P3 = end
 */
function cubicBezier(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  
  return mt3 * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3 * p3;
}

/**
 * Quadratic bezier for simpler curves
 */
function quadraticBezier(p0, p1, p2, t) {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

/**
 * Ease-in-out function for smoother animations
 */
function easeInOutCubic(t) {
  return t < 0.5 
    ? 4 * t * t * t 
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Ease-out function for deceleration
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Ease-in function for acceleration
 */
function easeInCubic(t) {
  return t * t * t;
}

/**
 * Calculate distance between two lat/lon points (haversine)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find the closest point index on a path to a given position
 */
function findClosestPointIndex(points, targetLat, targetLon) {
  let minDist = Infinity;
  let closestIdx = 0;
  
  for (let i = 0; i < points.length; i++) {
    const dist = haversineDistance(points[i].lat, points[i].lon, targetLat, targetLon);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = i;
    }
  }
  
  return closestIdx;
}

/**
 * Generate control points for a smooth bezier curve transition
 * from formation position back to the follower's original path
 */
function generateSplitTransitionCurve(
  formationPos,      // Where the follower is when leaving formation {lat, lon}
  formationHeading,  // Current heading in radians
  targetPos,         // Target position on follower's original path {lat, lon}
  targetHeading      // Target heading on follower's path
) {
  // Calculate distance to target
  const dist = haversineDistance(formationPos.lat, formationPos.lon, targetPos.lat, targetPos.lon);
  
  // Control point distance (proportional to transition distance)
  const controlDist = dist * 0.4;
  
  // First control point: extend from formation position along current heading
  const cp1 = {
    lat: formationPos.lat + (controlDist / 111) * Math.cos(formationHeading),
    lon: formationPos.lon + (controlDist / (111 * Math.cos(formationPos.lat * Math.PI / 180))) * Math.sin(formationHeading)
  };
  
  // Second control point: extend back from target along opposite of target heading
  const reverseHeading = targetHeading + Math.PI;
  const cp2 = {
    lat: targetPos.lat + (controlDist / 111) * Math.cos(reverseHeading),
    lon: targetPos.lon + (controlDist / (111 * Math.cos(targetPos.lat * Math.PI / 180))) * Math.sin(reverseHeading)
  };
  
  return { cp1, cp2 };
}

/**
 * Interpolate position along a cubic bezier curve
 */
function interpolateBezierPosition(p0, cp1, cp2, p3, t) {
  return {
    lat: cubicBezier(p0.lat, cp1.lat, cp2.lat, p3.lat, t),
    lon: cubicBezier(p0.lon, cp1.lon, cp2.lon, p3.lon, t)
  };
}

/**
 * Calculate heading along a bezier curve at parameter t
 */
function calculateBezierHeading(p0, cp1, cp2, p3, t) {
  // Calculate derivative of bezier curve
  const dt = 0.01;
  const t1 = Math.max(0, t - dt);
  const t2 = Math.min(1, t + dt);
  
  const pos1 = interpolateBezierPosition(p0, cp1, cp2, p3, t1);
  const pos2 = interpolateBezierPosition(p0, cp1, cp2, p3, t2);
  
  return calculateHeading(pos1.lat, pos1.lon, pos2.lat, pos2.lon);
}

/**
 * Interpolate position along a path of points
 */
function interpolateAlongPath(points, progress) {
  if (!points || points.length === 0) return null;
  if (points.length === 1) return { ...points[0], heading: 0 };
  
  // Clamp progress
  progress = Math.max(0, Math.min(1, progress));
  
  // Find segment
  const totalSegments = points.length - 1;
  const segmentProgress = progress * totalSegments;
  const segmentIndex = Math.min(Math.floor(segmentProgress), totalSegments - 1);
  const localProgress = segmentProgress - segmentIndex;
  
  const p1 = points[segmentIndex];
  const p2 = points[segmentIndex + 1];
  
  // Interpolate position
  const lat = lerp(p1.lat, p2.lat, localProgress);
  const lon = lerp(p1.lon, p2.lon, localProgress);
  
  // Calculate heading
  const heading = calculateHeading(p1.lat, p1.lon, p2.lat, p2.lon);
  
  return { lat, lon, heading };
}

/**
 * Get position at a specific point index (with fractional support)
 */
function getPositionAtIndex(points, index) {
  if (!points || points.length === 0) return null;
  
  const floorIdx = Math.floor(index);
  const ceilIdx = Math.ceil(index);
  const frac = index - floorIdx;
  
  if (floorIdx < 0) return { ...points[0], heading: 0 };
  if (ceilIdx >= points.length) return { ...points[points.length - 1], heading: 0 };
  
  if (floorIdx === ceilIdx || frac === 0) {
    const p = points[floorIdx];
    const nextP = points[Math.min(floorIdx + 1, points.length - 1)];
    const heading = calculateHeading(p.lat, p.lon, nextP.lat, nextP.lon);
    return { lat: p.lat, lon: p.lon, heading };
  }
  
  const p1 = points[floorIdx];
  const p2 = points[ceilIdx];
  
  return {
    lat: lerp(p1.lat, p2.lat, frac),
    lon: lerp(p1.lon, p2.lon, frac),
    heading: calculateHeading(p1.lat, p1.lon, p2.lat, p2.lon)
  };
}

/**
 * Create a replay controller for a formation flight scenario
 */
export function createReplayController(scenario, options = {}) {
  const {
    speedMultiplier = 1,
    onUpdate = () => {},
    onPhaseChange = () => {},
    onComplete = () => {}
  } = options;
  
  // Validate scenario
  if (!scenario || !scenario.leader || !scenario.follower) {
    console.error('Invalid scenario provided to replay controller');
    return null;
  }
  
  const leaderPoints = scenario.leader.points;
  const followerPoints = scenario.follower.points;
  const joinIndex = scenario.joinIndex || 0;
  const splitIndex = scenario.splitIndex || leaderPoints.length - 1;
  
  // Calculate metrics for fuel/CO2 accumulation
  const metrics = scenario.metrics || {
    fuelSavedKg: 0,
    co2SavedKg: 0,
    formationMinutes: 0,
    formationDistanceKm: 0
  };
  
  // Animation state
  let animationFrame = null;
  let isPlaying = false;
  let progress = 0; // 0 to 1
  let lastTimestamp = null;
  let currentPhase = REPLAY_STATES.IDLE;
  
  // Transition state for smooth split
  let splitTransition = null;
  
  // Duration calculation (in milliseconds)
  // Use the time values from points if available, otherwise estimate
  const totalTimeUnits = Math.max(
    leaderPoints[leaderPoints.length - 1]?.t || leaderPoints.length,
    followerPoints[followerPoints.length - 1]?.t || followerPoints.length
  );
  
  // Base duration: roughly 30 seconds for full replay at 1x speed
  const baseDuration = 30000;
  
  // Phase boundaries (as fractions of total progress)
  const joinProgress = joinIndex / (leaderPoints.length - 1);
  const splitProgress = splitIndex / (leaderPoints.length - 1);
  
  // Split transition duration (as fraction of total)
  const splitTransitionDuration = 0.08; // 8% of total time for smooth transition
  
  /**
   * Determine current phase based on progress
   */
  function determinePhase(prog) {
    if (prog < joinProgress * 0.8) {
      return REPLAY_STATES.RENDEZVOUS;
    } else if (prog < splitProgress) {
      return REPLAY_STATES.LOCKED;
    } else if (prog < splitProgress + splitTransitionDuration) {
      return REPLAY_STATES.SPLIT;
    } else {
      return REPLAY_STATES.COMPLETE;
    }
  }
  
  /**
   * Calculate follower position with smooth transitions
   */
  function calculateFollowerPosition(prog, leaderPos) {
    const phase = determinePhase(prog);
    
    // Pre-formation: follower on its own path, approaching leader
    if (phase === REPLAY_STATES.RENDEZVOUS) {
      // Interpolate along follower's path
      const followerIdx = prog * (followerPoints.length - 1);
      const pos = getPositionAtIndex(followerPoints, followerIdx);
      
      // Gradually blend towards leader's path as we approach join
      const approachProgress = prog / (joinProgress * 0.8);
      if (approachProgress > 0.7) {
        const blendFactor = (approachProgress - 0.7) / 0.3; // 0 to 1 in last 30%
        const eased = easeInCubic(blendFactor);
        
        // Get leader position at this point
        const leaderIdx = prog * (leaderPoints.length - 1);
        const leaderAtPoint = getPositionAtIndex(leaderPoints, leaderIdx);
        
        // Blend positions
        return {
          lat: lerp(pos.lat, leaderAtPoint.lat, eased * 0.5),
          lon: lerp(pos.lon, leaderAtPoint.lon, eased * 0.5),
          heading: pos.heading
        };
      }
      
      return pos;
    }
    
    // In formation: follower follows leader with slight offset
    if (phase === REPLAY_STATES.LOCKED) {
      // Small offset behind and to the side of leader
      const offsetBehind = 0.02; // degrees (~2km)
      const offsetSide = 0.01;   // degrees (~1km)
      
      // Calculate offset based on leader's heading
      const heading = leaderPos.heading || 0;
      
      return {
        lat: leaderPos.lat - offsetBehind * Math.cos(heading) + offsetSide * Math.sin(heading),
        lon: leaderPos.lon - offsetBehind * Math.sin(heading) - offsetSide * Math.cos(heading),
        heading: heading
      };
    }
    
    // Split phase: smooth bezier transition back to follower's path
    if (phase === REPLAY_STATES.SPLIT) {
      // Calculate transition progress within split phase (0 to 1)
      const splitStart = splitProgress;
      const splitEnd = splitProgress + splitTransitionDuration;
      const transitionProgress = (prog - splitStart) / (splitEnd - splitStart);
      const easedProgress = easeInOutCubic(transitionProgress);
      
      // Initialize split transition if needed
      if (!splitTransition) {
        // Get the position where split starts (following leader)
        const leaderSplitIdx = splitIndex;
        const leaderSplitPos = getPositionAtIndex(leaderPoints, leaderSplitIdx);
        
        // Small offset for follower at split point
        const offsetBehind = 0.02;
        const offsetSide = 0.01;
        const heading = leaderSplitPos.heading || 0;
        
        const startPos = {
          lat: leaderSplitPos.lat - offsetBehind * Math.cos(heading) + offsetSide * Math.sin(heading),
          lon: leaderSplitPos.lon - offsetBehind * Math.sin(heading) - offsetSide * Math.cos(heading)
        };
        
        // Find where on follower's path to rejoin
        // Look ahead on follower's path to find a good rejoin point
        const followerSplitIdx = Math.min(
          splitIndex + Math.floor(followerPoints.length * splitTransitionDuration),
          followerPoints.length - 1
        );
        const targetPos = followerPoints[followerSplitIdx];
        
        // Calculate target heading
        const nextIdx = Math.min(followerSplitIdx + 1, followerPoints.length - 1);
        const targetHeading = calculateHeading(
          targetPos.lat, targetPos.lon,
          followerPoints[nextIdx].lat, followerPoints[nextIdx].lon
        );
        
        // Generate bezier control points
        const { cp1, cp2 } = generateSplitTransitionCurve(
          startPos,
          heading,
          targetPos,
          targetHeading
        );
        
        splitTransition = {
          startPos,
          cp1,
          cp2,
          endPos: targetPos,
          startHeading: heading,
          endHeading: targetHeading,
          rejoinIdx: followerSplitIdx
        };
      }
      
      // Interpolate along bezier curve
      const pos = interpolateBezierPosition(
        splitTransition.startPos,
        splitTransition.cp1,
        splitTransition.cp2,
        splitTransition.endPos,
        easedProgress
      );
      
      // Calculate heading along curve
      const heading = calculateBezierHeading(
        splitTransition.startPos,
        splitTransition.cp1,
        splitTransition.cp2,
        splitTransition.endPos,
        easedProgress
      );
      
      return { ...pos, heading };
    }
    
    // Post-split: follower back on its own path
    // Continue from where the transition ended
    const postSplitProgress = (prog - splitProgress - splitTransitionDuration) / 
                              (1 - splitProgress - splitTransitionDuration);
    
    // Calculate index on follower's path
    const rejoinIdx = splitTransition?.rejoinIdx || splitIndex;
    const remainingPoints = followerPoints.length - rejoinIdx;
    const followerIdx = rejoinIdx + postSplitProgress * remainingPoints;
    
    return getPositionAtIndex(followerPoints, Math.min(followerIdx, followerPoints.length - 1));
  }
  
  /**
   * Calculate accumulated savings based on progress
   */
  function calculateSavings(prog) {
    const phase = determinePhase(prog);
    
    // Only accumulate during LOCKED phase
    if (phase === REPLAY_STATES.RENDEZVOUS) {
      // Ramp up as approaching formation
      const approachProgress = prog / joinProgress;
      return {
        fuel: metrics.fuelSavedKg * approachProgress * 0.1,
        co2: metrics.co2SavedKg * approachProgress * 0.1
      };
    }
    
    if (phase === REPLAY_STATES.LOCKED) {
      // Calculate progress within locked phase
      const lockedProgress = (prog - joinProgress) / (splitProgress - joinProgress);
      return {
        fuel: metrics.fuelSavedKg * (0.1 + lockedProgress * 0.8),
        co2: metrics.co2SavedKg * (0.1 + lockedProgress * 0.8)
      };
    }
    
    // SPLIT and COMPLETE: show final values with slight increase
    const splitPhaseProgress = Math.min(1, (prog - splitProgress) / splitTransitionDuration);
    return {
      fuel: metrics.fuelSavedKg * (0.9 + splitPhaseProgress * 0.1),
      co2: metrics.co2SavedKg * (0.9 + splitPhaseProgress * 0.1)
    };
  }
  
  /**
   * Update state and notify listeners
   */
  function updateState() {
    const phase = determinePhase(progress);
    
    // Notify phase change
    if (phase !== currentPhase) {
      currentPhase = phase;
      onPhaseChange(phase);
      
      // Reset split transition when leaving split phase
      if (phase !== REPLAY_STATES.SPLIT) {
        splitTransition = null;
      }
    }
    
    // Calculate leader position
    const leaderIdx = progress * (leaderPoints.length - 1);
    const leaderPos = getPositionAtIndex(leaderPoints, leaderIdx);
    
    // Calculate follower position with smooth transitions
    const followerPos = calculateFollowerPosition(progress, leaderPos);
    
    // Calculate accumulated savings
    const savings = calculateSavings(progress);
    
    // Determine if connector should be shown
    const showConnector = phase === REPLAY_STATES.LOCKED || phase === REPLAY_STATES.SPLIT;
    
    // Create state object
    const state = {
      isPlaying,
      progress,
      phase,
      leaderPosition: leaderPos,
      followerPosition: followerPos,
      accumulatedFuel: savings.fuel,
      accumulatedCO2: savings.co2,
      isLocked: phase === REPLAY_STATES.LOCKED,
      showConnector
    };
    
    onUpdate(state);
    
    // Check for completion
    if (progress >= 1) {
      isPlaying = false;
      currentPhase = REPLAY_STATES.COMPLETE;
      onComplete();
    }
  }
  
  /**
   * Animation loop
   */
  function animate(timestamp) {
    if (!isPlaying) return;
    
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }
    
    const deltaTime = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    
    // Update progress
    const effectiveDuration = baseDuration / speedMultiplier;
    progress += deltaTime / effectiveDuration;
    progress = Math.min(1, progress);
    
    updateState();
    
    if (progress < 1 && isPlaying) {
      animationFrame = requestAnimationFrame(animate);
    }
  }
  
  /**
   * Public API
   */
  return {
    play() {
      if (isPlaying) return;
      isPlaying = true;
      lastTimestamp = null;
      animationFrame = requestAnimationFrame(animate);
    },
    
    pause() {
      isPlaying = false;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      updateState();
    },
    
    stop() {
      this.pause();
      progress = 0;
      currentPhase = REPLAY_STATES.IDLE;
      splitTransition = null;
      updateState();
    },
    
    seek(newProgress) {
      progress = Math.max(0, Math.min(1, newProgress));
      // Reset split transition when seeking
      if (determinePhase(progress) !== REPLAY_STATES.SPLIT) {
        splitTransition = null;
      }
      updateState();
    },
    
    isPlaying() {
      return isPlaying;
    },
    
    getState() {
      return {
        isPlaying,
        progress,
        phase: currentPhase
      };
    },
    
    destroy() {
      this.stop();
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    }
  };
}

export default {
  REPLAY_STATES,
  createReplayController,
  pointsToCoordinates,
  getFormationSegment,
  calculateHeading
};