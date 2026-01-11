# Constant Speed Two-Plane Simulation with Path Constraints

## Problem Statement

Simulate two airplanes (Red = leader, Yellow = follower) moving along predefined flight paths with the following constraints:

### Path Constraints (MANDATORY)

1. Each plane moves along its assigned path parameterized by distance (1D along-track motion).
2. The yellow plane is **not allowed to leave its assigned path** at any time (until merge).
3. When paths merge, the yellow plane must **snap to and remain on the merged (red) track**.
4. After merging, both planes share the **same single track** and **same destination endpoint**.
5. The yellow plane must **stop exactly at the destination**, not pass it.

### Motion Constraints

1. Both planes move at **constant speed** for the entire simulation.
2. No acceleration, braking, or speed changes are allowed.
3. Speed coordination must be done **only by initial timing and speed selection**.

### Ordering Constraints (CRITICAL)

1. At the merge point, the red plane must be ahead of the yellow plane.
2. After merging, the yellow plane must **always satisfy**: `distance_yellow(t) < distance_red(t)`
3. Overtaking, crossing, or equality of positions is strictly forbidden.

## Mathematical Formulation

### Notation

- **s**: 1D along-track distance parameter (km)
- **t**: Time (seconds or minutes)
- **v_r**: Constant speed of red plane (km/min or km/s)
- **v_y**: Constant speed of yellow plane (km/min or km/s)
- **t_r0**: Initial start time of red plane
- **t_y0**: Initial start time of yellow plane
- **s_r(t)**: Distance along red path at time t
- **s_y(t)**: Distance along yellow path at time t
- **s_merge**: Distance along path to merge point (km)
- **s_dest**: Distance along path to destination (km)

### Distance-Time Relationships

For constant speed motion:
```
s_r(t) = v_r * (t - t_r0)    for t >= t_r0
s_y(t) = v_y * (t - t_y0)    for t >= t_y0
```

### Phase 1: Before Merge (t < t_merge)

**Red plane:**
- Moves along its own path
- `s_r(t) = v_r * (t - t_r0)`
- Position: `position_red(s_r(t))` along red path

**Yellow plane:**
- Moves along its own path (not allowed to leave)
- `s_y(t) = v_y * (t - t_y0)`
- Position: `position_yellow(s_y(t))` along yellow path
- Constraint: `s_y(t) <= s_y_merge` (cannot exceed merge point on yellow path)

### Phase 2: At Merge (t = t_merge)

**Merge conditions:**
1. Red reaches merge: `s_r(t_merge) = s_r_merge`
2. Yellow reaches merge: `s_y(t_merge) = s_y_merge`
3. Ordering: `s_r(t_merge) > s_y(t_merge)` (red ahead)

From constant speed equations:
```
s_r_merge = v_r * (t_merge - t_r0)
s_y_merge = v_y * (t_merge - t_y0)
```

Solving for merge time:
```
t_merge = t_r0 + s_r_merge / v_r
t_merge = t_y0 + s_y_merge / v_y
```

Equating:
```
t_r0 + s_r_merge / v_r = t_y0 + s_y_merge / v_y
```

### Phase 3: After Merge (t > t_merge)

**After merging:**
- Both planes share the same merged track
- Yellow plane snaps to red's track
- Both use the same distance parameterization `s` along the merged track

**Position on merged track:**
- Red: `s_r_merged(t) = s_merge + v_r * (t - t_merge)`
- Yellow: `s_y_merged(t) = s_merge + v_y * (t - t_merge)`

**Ordering constraint:**
```
s_y_merged(t) < s_r_merged(t)   for all t > t_merge
```

Substituting:
```
s_merge + v_y * (t - t_merge) < s_merge + v_r * (t - t_merge)
v_y * (t - t_merge) < v_r * (t - t_merge)
v_y < v_r   (since t > t_merge)
```

**Therefore:** `v_y < v_r` is required for ordering constraint.

**Destination constraint:**
- Yellow must stop exactly at destination
- Red reaches destination first: `s_r_merged(t_dest) = s_dest`
- Yellow reaches destination: `s_y_merged(t_y_dest) = s_dest`

From red:
```
s_dest = s_merge + v_r * (t_dest - t_merge)
t_dest = t_merge + (s_dest - s_merge) / v_r
```

From yellow:
```
s_dest = s_merge + v_y * (t_y_dest - t_merge)
t_y_dest = t_merge + (s_dest - s_merge) / v_y
```

Since `v_y < v_r`, we have `t_y_dest > t_dest` (yellow arrives later).

**Stop condition for yellow:**
- Yellow must stop at destination when `s_y_merged(t) >= s_dest`
- This happens at `t = t_y_dest`

## Solution Algorithm

### Step 1: Compute Path Distances

1. Compute cumulative distances along red path from origin to merge: `s_r_merge`
2. Compute cumulative distances along yellow path from origin to merge: `s_y_merge`
3. Compute distance from merge to destination along merged track: `s_merge_to_dest = s_dest - s_merge`

### Step 2: Choose Speeds

Select speeds such that:
- `v_r > v_y > 0` (ordering constraint)
- Speeds are reasonable (e.g., 800 km/h = 13.33 km/min for typical cruise)

Typical approach:
- Set `v_r = 13.33` km/min (800 km/h)
- Set `v_y = 0.95 * v_r = 12.67` km/min (760 km/h) to ensure ordering

### Step 3: Solve for Start Times

From merge condition:
```
t_r0 + s_r_merge / v_r = t_y0 + s_y_merge / v_y
```

Choose `t_r0 = 0` (red starts at time 0), then:
```
t_y0 = s_r_merge / v_r - s_y_merge / v_y
```

This gives the yellow plane's start time relative to red.

### Step 4: Verify Constraints

1. **Merge ordering:** At merge, verify `s_r(t_merge) > s_y(t_merge)`
   - Since `v_r > v_y` and both start from origin, red is ahead if paths are similar length
   - If `s_r_merge < s_y_merge`, may need to adjust (yellow starts later to compensate)

2. **Post-merge ordering:** `v_y < v_r` ensures this constraint

3. **Destination stopping:** Yellow stops when `s_y_merged(t) >= s_dest`

### Step 5: Simulation

For each time step `t`:

1. **Before merge (`t < t_merge`):**
   - `s_r = v_r * (t - t_r0)`
   - `s_y = v_y * (t - t_y0)`
   - If `s_y > s_y_merge`, clamp to `s_y = s_y_merge`
   - Position red at `position_along_red_path(s_r)`
   - Position yellow at `position_along_yellow_path(s_y)`

2. **At merge (`t = t_merge`):**
   - Both at merge point
   - Yellow snaps to red's track

3. **After merge (`t > t_merge`):**
   - `s_r_merged = s_merge + v_r * (t - t_merge)`
   - `s_y_merged = s_merge + v_y * (t - t_merge)`
   - If `s_y_merged >= s_dest`, clamp to `s_y_merged = s_dest` (yellow stops)
   - Position both at `position_along_merged_track(s_r_merged)` and `position_along_merged_track(s_y_merged)`

## Implementation Pseudocode

```
function computePathDistances(redPath, yellowPath, mergePoint, destination):
    s_r_merge = cumulativeDistance(redPath, origin, mergePoint)
    s_y_merge = cumulativeDistance(yellowPath, origin, mergePoint)
    s_dest = cumulativeDistance(redPath, origin, destination)  // or merged track
    s_merge_to_dest = s_dest - s_r_merge
    return (s_r_merge, s_y_merge, s_dest, s_merge_to_dest)

function solveStartTimesAndSpeeds(s_r_merge, s_y_merge, s_dest):
    // Choose speeds
    v_r = 13.33  // km/min (800 km/h)
    v_y = 12.67  // km/min (760 km/h), must be < v_r
    
    // Choose red start time (reference)
    t_r0 = 0
    
    // Solve for yellow start time from merge condition
    t_merge = s_r_merge / v_r  // Time for red to reach merge
    t_y0 = t_merge - s_y_merge / v_y
    
    // Verify ordering at merge
    if s_r_merge <= s_y_merge and t_y0 >= t_r0:
        // Yellow path is longer, but yellow starts later - check if ordering works
        // May need to adjust speeds or start times
        pass
    
    return (v_r, v_y, t_r0, t_y0, t_merge)

function simulate(t, v_r, v_y, t_r0, t_y0, s_r_merge, s_y_merge, s_merge, s_dest):
    if t < t_merge:
        // Before merge
        s_r = v_r * (t - t_r0)
        s_y = v_y * (t - t_y0)
        
        // Clamp to merge point
        if s_r > s_r_merge:
            s_r = s_r_merge
        if s_y > s_y_merge:
            s_y = s_y_merge
            
        pos_r = positionAtDistance(redPath, s_r)
        pos_y = positionAtDistance(yellowPath, s_y)
    else:
        // After merge
        dt = t - t_merge
        s_r_merged = s_merge + v_r * dt
        s_y_merged = s_merge + v_y * dt
        
        // Yellow stops at destination
        if s_y_merged >= s_dest:
            s_y_merged = s_dest
            
        // Red continues (may also stop if desired)
        if s_r_merged >= s_dest:
            s_r_merged = s_dest
            
        pos_r = positionAtDistance(mergedTrack, s_r_merged)
        pos_y = positionAtDistance(mergedTrack, s_y_merged)
    
    return (pos_r, pos_y, s_r, s_y)
```

## Key Insights

1. **Speed relationship:** `v_y < v_r` is mathematically necessary for post-merge ordering.

2. **Start time coordination:** Yellow start time is determined by the merge condition to ensure both planes reach the merge point simultaneously.

3. **Destination stopping:** Yellow stops exactly at destination by clamping `s_y_merged` to `s_dest`.

4. **1D parameterization:** Using distance along track (not time) ensures consistent motion and makes constraints easier to enforce.

5. **Merge snap:** Yellow plane's position computation switches from yellow path to merged track at `t_merge`.

