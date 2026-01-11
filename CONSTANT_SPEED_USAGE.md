# Constant Speed Simulation Usage Guide

## Overview

The constant speed simulation module provides a solution for simulating two airplanes (red leader, yellow follower) with strict constraints:

- Constant speed motion (no acceleration)
- 1D along-track distance parameterization
- Yellow plane snaps to red's track at merge point
- Yellow must always be behind red after merge
- Yellow stops exactly at destination

## Quick Start

```javascript
import { createConstantSpeedReplayController } from './lib/constantSpeedSimulation';

// Create controller with scenario
const controller = createConstantSpeedReplayController(scenario, {
  speedMultiplier: 1,
  redSpeedKmMin: 13.33, // 800 km/h
  speedRatio: 0.95,     // Yellow is 95% of red speed
  onUpdate: (state) => {
    console.log('Phase:', state.phase);
    console.log('Red position:', state.leaderPosition);
    console.log('Yellow position:', state.followerPosition);
  },
  onComplete: () => {
    console.log('Simulation complete');
  },
});

// Start simulation
controller.play();

// Control playback
controller.pause();
controller.seek(0.5); // Seek to 50% progress
controller.stop();
controller.destroy();
```

## Mathematical Solution Summary

### Key Constraints

1. **Speed relationship**: `v_y < v_r` (yellow slower than red)
2. **Merge timing**: Both planes reach merge point simultaneously
3. **Ordering**: Yellow always behind red after merge
4. **Destination**: Yellow stops exactly at destination

### Solution Algorithm

1. **Compute path distances**:
   - `s_r_merge`: Distance along red path to merge point
   - `s_y_merge`: Distance along yellow path to merge point
   - `s_dest`: Total distance to destination

2. **Choose speeds**:
   - Red speed: `v_r = 13.33 km/min` (800 km/h)
   - Yellow speed: `v_y = v_r * 0.95` (760 km/h, ensures `v_y < v_r`)

3. **Solve for start times**:
   - Red start: `t_r0 = 0` (reference)
   - Yellow start: `t_y0 = s_r_merge/v_r - s_y_merge/v_y`
   - Merge time: `t_merge = s_r_merge/v_r`

4. **Simulate**:
   - Before merge: Each plane moves along its own path
   - After merge: Both planes on merged track (red's track)
   - Yellow stops at destination: `s_y_merged = min(s_dest, s_r_merge + v_y*(t - t_merge))`

## API Reference

### `solveConstantSpeedMotion(scenario, options)`

Solves for initial speeds and start times given a scenario.

**Parameters:**
- `scenario`: Object with `leader` and `follower` paths
- `options`: Configuration object
  - `redSpeedKmMin` (default: 13.33): Red plane speed in km/min
  - `speedRatio` (default: 0.95): Yellow speed as fraction of red speed

**Returns:**
```javascript
{
  v_r: number,        // Red speed (km/min)
  v_y: number,        // Yellow speed (km/min)
  t_r0: number,       // Red start time (min)
  t_y0: number,       // Yellow start time (min)
  t_merge: number,    // Merge time (min)
  s_r_merge: number,  // Red path distance to merge (km)
  s_y_merge: number,  // Yellow path distance to merge (km)
  s_dest: number,     // Destination distance (km)
  redDistances: Array,      // Cumulative distances along red path
  yellowDistances: Array,   // Cumulative distances along yellow path
  mergeInfo: Object,        // Merge point information
}
```

### `simulateAtTime(t, solution, scenario)`

Computes plane positions at a given time.

**Parameters:**
- `t`: Current time (minutes)
- `solution`: Solution from `solveConstantSpeedMotion`
- `scenario`: Scenario with paths

**Returns:**
```javascript
{
  redPos: {lat, lon, heading, distance},
  yellowPos: {lat, lon, heading, distance},
  phase: "before_merge" | "after_merge",
  t: number,
  distances: {red: number, yellow: number},
}
```

### `createConstantSpeedReplayController(scenario, options)`

Creates a replay controller compatible with the existing replay system.

**Parameters:**
- `scenario`: Object with `leader` and `follower` paths
- `options`: Configuration object
  - `speedMultiplier` (default: 1): Playback speed multiplier
  - `redSpeedKmMin` (default: 13.33): Red plane speed
  - `speedRatio` (default: 0.95): Yellow speed ratio
  - `onUpdate`: Callback function `(state) => {}`
  - `onPhaseChange`: Callback function `(phase) => {}`
  - `onComplete`: Callback function `() => {}`

**Returns:** Controller object with methods:
- `play()`: Start simulation
- `pause()`: Pause simulation
- `stop()`: Stop and reset simulation
- `seek(progress)`: Seek to progress (0-1)
- `isPlaying()`: Returns playing state
- `getState()`: Returns current state
- `getSolution()`: Returns solution object
- `destroy()`: Cleanup

## Integration with Existing Replay System

The constant speed controller is compatible with the existing replay system structure:

```javascript
// In ExistingApp.jsx or similar
import { createConstantSpeedReplayController } from '../lib/constantSpeedSimulation';

// Option 1: Use constant speed simulation
const replayController = createConstantSpeedReplayController(scenario, {
  speedMultiplier: playbackSpeed,
  onUpdate: (state) => {
    setReplayState({
      isPlaying: state.isPlaying,
      progress: state.progress,
      phase: state.phase,
      leaderPosition: state.leaderPosition,
      followerPosition: state.followerPosition,
      // ... other state
    });
  },
  onComplete: () => {
    setReplayState((prev) => ({ ...prev, isPlaying: false }));
  },
});

// Option 2: Use existing time-based simulation (default)
// const replayController = createReplayController(scenario, options);
```

## Constraint Validation

The implementation includes automatic validation:

1. **Ordering at merge**: Verifies red is ahead at merge point
2. **Speed ordering**: Ensures `v_y < v_r`
3. **Destination stopping**: Yellow stops exactly at destination (no overshoot)

If constraints cannot be satisfied, the solver throws descriptive errors.

## Example: Distance vs Time

The solution can be visualized as 1D distance vs time:

```
Distance (km)
    |
s_dest |                    * (Red at destination)
    |                  *
    |                *
    |              *
s_merge |         *  (Merge point)
    |        *  *
    |     *     *
    |  *        *
    |*          *
    |___________________________ Time (min)
    0   t_y0  t_merge          t_dest
         |      |                |
         |      Yellow snaps to  |
         |      red's track      Yellow stops
         |
    Yellow starts
    
Key:
- Solid line: Red plane path
- Dashed line: Yellow plane path (before merge)
- After merge: Both on same track, yellow always behind
```

## Notes

- Time units are in minutes (can be converted to seconds if needed)
- Distance units are in kilometers
- The simulation uses 1D along-track distance parameterization
- Paths are assumed to be pre-defined with merge point identified
- The merge point is determined from `scenario.joinIndex`

