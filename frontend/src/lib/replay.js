/**
 * Replay system for formation flight visualization
 */

import { getPositionAlongPath, offsetLngLat, lerp } from "./geo";

// Formation offset parameters (km)
export const DEFAULT_FORMATION = {
  behindKm: 20,
  sideKm: 25, // Increased from 3 to make V formation farther apart
};

/**
 * Replay state machine states
 */
export const REPLAY_STATES = {
  IDLE: "IDLE",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
  RENDEZVOUS: "RENDEZVOUS",
  LOCKED: "LOCKED",
  SPLIT: "SPLIT",
};

/**
 * Calculate the replay phase based on current index
 * @param {number} currentIndex - Current position index
 * @param {number} joinIndex - Index where formation starts
 * @param {number} splitIndex - Index where formation ends
 * @returns {string} Phase name
 */
export function getReplayPhase(currentIndex, joinIndex, splitIndex) {
  if (currentIndex < joinIndex) {
    return REPLAY_STATES.RENDEZVOUS;
  } else if (currentIndex <= splitIndex) {
    return REPLAY_STATES.LOCKED;
  } else {
    return REPLAY_STATES.SPLIT;
  }
}

/**
 * Create a replay controller for a scenario
 */
export function createReplayController(scenario, options = {}) {
  const {
    onUpdate,
    onPhaseChange,
    onComplete,
    speedMultiplier = 1,
    formation = DEFAULT_FORMATION,
  } = options;

  let state = {
    isPlaying: false,
    progress: 0,
    phase: REPLAY_STATES.IDLE,
    leaderPosition: null,
    followerPosition: null,
    snapProgress: 0, // 0-1 for snap animation
    accumulatedFuel: 0,
    accumulatedCO2: 0,
  };

  let animationFrameId = null;
  let lastTimestamp = null;

  const totalPoints = Math.max(
    scenario.leader.points.length,
    scenario.follower.points.length
  );
  const joinProgress = scenario.joinIndex / (totalPoints - 1);
  const splitProgress = scenario.splitIndex / (totalPoints - 1);

  // Duration in ms (simulated)
  const baseDuration = 30000; // 30 seconds for full replay
  const duration = baseDuration / speedMultiplier;

  function updatePositions(progress) {
    const leaderPos = getPositionAlongPath(scenario.leader.points, progress);
    const followerOwnPos = getPositionAlongPath(
      scenario.follower.points,
      progress
    );

    if (!leaderPos || !followerOwnPos) return;

    const currentIndex = Math.floor(progress * (totalPoints - 1));
    const newPhase = getReplayPhase(
      currentIndex,
      scenario.joinIndex,
      scenario.splitIndex
    );

    if (newPhase !== state.phase) {
      state.phase = newPhase;
      state.snapProgress = 0;
      onPhaseChange?.(newPhase);
    }

    state.leaderPosition = leaderPos;

    // Calculate follower position based on phase
    if (state.phase === REPLAY_STATES.LOCKED) {
      // Snap animation at the start of LOCKED phase
      if (state.snapProgress < 1) {
        state.snapProgress = Math.min(state.snapProgress + 0.05, 1);
      }

      // Calculate formation position
      const formationPos = offsetLngLat(
        [leaderPos.lon, leaderPos.lat],
        leaderPos.heading,
        formation.behindKm,
        formation.sideKm
      );

      // Interpolate between own position and formation position
      state.followerPosition = {
        lon: lerp(followerOwnPos.lon, formationPos[0], state.snapProgress),
        lat: lerp(followerOwnPos.lat, formationPos[1], state.snapProgress),
        heading: leaderPos.heading,
        index: currentIndex,
      };

      // Accumulate savings while locked
      const savingsRate =
        scenario.metrics.fuelSavedKg / scenario.metrics.formationMinutes;
      const co2Rate =
        scenario.metrics.co2SavedKg / scenario.metrics.formationMinutes;
      const deltaMinutes =
        (1 / (totalPoints - 1)) *
        (scenario.metrics.formationMinutes / (splitProgress - joinProgress));

      state.accumulatedFuel += savingsRate * deltaMinutes * 0.1;
      state.accumulatedCO2 += co2Rate * deltaMinutes * 0.1;

      // Cap at max values
      state.accumulatedFuel = Math.min(
        state.accumulatedFuel,
        scenario.metrics.fuelSavedKg
      );
      state.accumulatedCO2 = Math.min(
        state.accumulatedCO2,
        scenario.metrics.co2SavedKg
      );
    } else {
      state.followerPosition = followerOwnPos;
      state.snapProgress = 0;
    }

    state.progress = progress;

    onUpdate?.({
      ...state,
      isLocked: state.phase === REPLAY_STATES.LOCKED,
      showConnector:
        state.phase === REPLAY_STATES.LOCKED && state.snapProgress > 0.5,
    });
  }

  function animate(timestamp) {
    if (!state.isPlaying) return;

    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    const deltaTime = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    const progressDelta = deltaTime / duration;
    const newProgress = Math.min(state.progress + progressDelta, 1);

    updatePositions(newProgress);

    if (newProgress >= 1) {
      stop();
      onComplete?.();
    } else {
      animationFrameId = requestAnimationFrame(animate);
    }
  }

  function play() {
    if (state.isPlaying) return;
    state.isPlaying = true;
    lastTimestamp = null;
    animationFrameId = requestAnimationFrame(animate);
  }

  function pause() {
    state.isPlaying = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function stop() {
    pause();
    state.progress = 0;
    state.phase = REPLAY_STATES.IDLE;
    state.accumulatedFuel = 0;
    state.accumulatedCO2 = 0;
    state.snapProgress = 0;
  }

  function seek(progress) {
    state.progress = Math.max(0, Math.min(1, progress));
    state.accumulatedFuel = 0;
    state.accumulatedCO2 = 0;

    // Recalculate accumulated values up to this point
    if (progress > joinProgress) {
      const lockedProgress = Math.min(progress, splitProgress) - joinProgress;
      const totalLockedProgress = splitProgress - joinProgress;
      const ratio = lockedProgress / totalLockedProgress;
      state.accumulatedFuel = scenario.metrics.fuelSavedKg * ratio;
      state.accumulatedCO2 = scenario.metrics.co2SavedKg * ratio;
    }

    updatePositions(state.progress);
  }

  function setSpeed(multiplier) {
    // Speed change handled by recreating controller
  }

  function destroy() {
    stop();
  }

  return {
    play,
    pause,
    stop,
    seek,
    setSpeed,
    destroy,
    getState: () => ({ ...state }),
    isPlaying: () => state.isPlaying,
  };
}

/**
 * Convert scenario points to GeoJSON LineString coordinates
 */
export function pointsToCoordinates(points) {
  return points.map((p) => [p.lon, p.lat]);
}

/**
 * Get formation segment coordinates
 */
export function getFormationSegment(scenario) {
  const { leader, joinIndex, splitIndex } = scenario;
  const formationPoints = leader.points.slice(joinIndex, splitIndex + 1);
  return pointsToCoordinates(formationPoints);
}
