/**
 * Convert optimal departure data to scenario format for replay
 */

/**
 * Convert optimal departure API response to scenario format
 * @param {Object} optimalData - The optimal departure API response
 * @returns {Object|null} Scenario object or null if conversion not possible
 */
export function convertOptimalDepartureToScenario(optimalData) {
  if (!optimalData || !optimalData.path || !optimalData.route) {
    return null;
  }

  const { path, connections, route, cost_analysis } = optimalData;

  // Check if we have a partner flight to follow
  const followedFlightId = connections?.followed_flight_id;
  const partnerFlightPaths = connections?.partner_flight_paths || {};
  const partnerFlightPath = followedFlightId ? partnerFlightPaths[followedFlightId] : null;

  if (!partnerFlightPath || partnerFlightPath.length === 0) {
    // No partner flight - can't create scenario (no formation)
    return null;
  }

  const optimalPath = path.optimal_flight_path || [];
  const connectionDetails = connections?.connection_details || [];

  if (optimalPath.length === 0 || connectionDetails.length === 0) {
    return null;
  }

  // Get the connection details (should be the intercept point)
  const connection = connectionDetails[0];
  const interceptPosition = connection?.position;

  if (!interceptPosition) {
    return null;
  }

  // Find intercept index in optimal path (where we join the partner flight)
  let interceptIndex = -1;
  let minDistance = Infinity;
  for (let i = 0; i < optimalPath.length; i++) {
    const node = optimalPath[i];
    const dist = calculateDistance(
      node.lat,
      node.lon,
      interceptPosition.lat,
      interceptPosition.lon
    );
    if (dist < minDistance) {
      minDistance = dist;
      interceptIndex = i;
    }
  }

  // Find departure index (where we leave the partner flight)
  // This is where the "following" flag changes from true to false, or at the end of overlapping segments
  let departureIndex = interceptIndex;
  for (let i = interceptIndex + 1; i < optimalPath.length; i++) {
    const node = optimalPath[i];
    // If node has a "following" property and it's false, we've left
    // Otherwise, estimate based on distance from partner flight path
    if (node.following === false) {
      departureIndex = i;
      break;
    }
    // Check if we're still close to partner flight
    const closestPartnerNode = findClosestPartnerNode(node, partnerFlightPath);
    const dist = calculateDistance(node.lat, node.lon, closestPartnerNode.lat, closestPartnerNode.lon);
    if (dist > 50) { // More than 50km away - we've left
      departureIndex = i;
      break;
    }
    departureIndex = i;
  }

  // Convert paths to scenario points format
  // Points need: {t: number (minutes from start), lon: number, lat: number}
  const leaderPoints = convertPathToPoints(partnerFlightPath, 0);
  const followerPoints = convertPathToPoints(optimalPath, 0);

  // Normalize points to same length for replay (interpolate if needed)
  const maxLength = Math.max(leaderPoints.length, followerPoints.length);
  const normalizedLeaderPoints = normalizePoints(leaderPoints, maxLength);
  const normalizedFollowerPoints = normalizePoints(followerPoints, maxLength);

  // Calculate join and split indices in normalized arrays
  const joinIndex = Math.floor((interceptIndex / optimalPath.length) * maxLength);
  const splitIndex = Math.floor((departureIndex / optimalPath.length) * maxLength);

  // Calculate formation duration from path nodes
  // Count nodes with following=true flag
  let formationNodeCount = 0;
  for (let i = interceptIndex; i <= departureIndex && i < optimalPath.length; i++) {
    const node = optimalPath[i];
    if (node.following === true || (i >= interceptIndex && i <= departureIndex)) {
      formationNodeCount++;
    }
  }
  
  // Estimate formation minutes (assuming ~1 minute per node, or use actual timestamps)
  const formationMinutes = Math.max(1, formationNodeCount);
  
  // Calculate metrics
  const metrics = {
    formationMinutes: formationMinutes,
    formationDistanceKm: calculatePathDistance(normalizedFollowerPoints.slice(joinIndex, splitIndex + 1)),
    detourKm: cost_analysis?.detour_distance || 0,
    fuelSavedKg: cost_analysis?.total_savings || 0, // Using total savings as fuel saved (approximation)
    co2SavedKg: (cost_analysis?.total_savings || 0) * 3.15, // CO2 is roughly 3.15x fuel
  };

  // Ensure followedFlightId is a string
  const followedFlightIdStr = typeof followedFlightId === 'string' ? followedFlightId : String(followedFlightId || 'PARTNER');
  
  // Create scenario
  const scenario = {
    id: `optimal-departure-${route.origin}-${route.destination}-${Date.now()}`,
    title: `Optimal Departure: ${route.origin} → ${route.destination}`,
    description: `Formation flight with optimal departure time`,
    savingsPreset: 'expected',
    leader: {
      id: followedFlightIdStr,
      label: followedFlightIdStr.length > 8 ? followedFlightIdStr.substring(0, 8) : followedFlightIdStr,
      route: `${route.origin}-${route.destination}`,
      airline: 'Partner Flight',
      aircraft: 'Unknown',
      date: route.scheduled_departure?.split('T')[0] || new Date().toISOString().split('T')[0],
      points: normalizedLeaderPoints,
    },
    follower: {
      id: `${route.origin}-${route.destination}`,
      label: `${route.origin}-${route.destination}`,
      route: `${route.origin}-${route.destination}`,
      airline: 'Your Flight',
      aircraft: 'Unknown',
      date: route.scheduled_departure?.split('T')[0] || new Date().toISOString().split('T')[0],
      points: normalizedFollowerPoints,
    },
    joinIndex: Math.max(0, Math.min(joinIndex, maxLength - 1)),
    splitIndex: Math.max(joinIndex, Math.min(splitIndex, maxLength - 1)),
    metrics,
  };

  return scenario;
}

/**
 * Convert path nodes to scenario points format
 * @param {Array} pathNodes - Array of path nodes with lat, lon, timestamp
 * @param {number} startTime - Starting time offset in minutes
 * @returns {Array} Array of points with {t, lon, lat}
 */
function convertPathToPoints(pathNodes, startTime = 0) {
  if (!pathNodes || pathNodes.length === 0) {
    return [];
  }

  const points = [];
  let currentTime = startTime;

  for (let i = 0; i < pathNodes.length; i++) {
    const node = pathNodes[i];
    if (node.lat != null && node.lon != null) {
      points.push({
        t: currentTime,
        lon: node.lon,
        lat: node.lat,
      });
      // Increment time by 1 minute per point (or use time_index if available)
      currentTime += node.time_index ? 1 : 1;
    }
  }

  return points;
}

/**
 * Normalize points array to target length by interpolating
 * @param {Array} points - Array of points
 * @param {number} targetLength - Target length
 * @returns {Array} Normalized points array
 */
function normalizePoints(points, targetLength) {
  if (points.length === 0) {
    return points;
  }

  if (points.length === targetLength) {
    return points;
  }

  if (points.length > targetLength) {
    // Downsample
    const step = points.length / targetLength;
    const normalized = [];
    for (let i = 0; i < targetLength; i++) {
      const index = Math.floor(i * step);
      normalized.push(points[index]);
    }
    return normalized;
  } else {
    // Upsample by interpolating
    const normalized = [];
    const step = (points.length - 1) / (targetLength - 1);
    for (let i = 0; i < targetLength; i++) {
      const index = i * step;
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const fraction = index - lower;

      if (upper >= points.length) {
        normalized.push(points[points.length - 1]);
      } else if (lower === upper) {
        normalized.push(points[lower]);
      } else {
        // Interpolate
        const p1 = points[lower];
        const p2 = points[upper];
        normalized.push({
          t: p1.t + (p2.t - p1.t) * fraction,
          lon: p1.lon + (p2.lon - p1.lon) * fraction,
          lat: p1.lat + (p2.lat - p1.lat) * fraction,
        });
      }
    }
    return normalized;
  }
}

/**
 * Calculate distance between two points (Haversine formula, simplified)
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in km
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find closest node in partner flight path to a given node
 * @param {Object} node - Node with lat, lon
 * @param {Array} partnerPath - Partner flight path
 * @returns {Object} Closest node
 */
function findClosestPartnerNode(node, partnerPath) {
  if (!partnerPath || partnerPath.length === 0) {
    return node;
  }

  let closest = partnerPath[0];
  let minDist = calculateDistance(node.lat, node.lon, partnerPath[0].lat, partnerPath[0].lon);

  for (let i = 1; i < partnerPath.length; i++) {
    const dist = calculateDistance(node.lat, node.lon, partnerPath[i].lat, partnerPath[i].lon);
    if (dist < minDist) {
      minDist = dist;
      closest = partnerPath[i];
    }
  }

  return closest;
}

/**
 * Calculate total distance along a path
 * @param {Array} points - Array of points
 * @returns {number} Total distance in km
 */
function calculatePathDistance(points) {
  if (points.length < 2) {
    return 0;
  }

  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistance += calculateDistance(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }

  return totalDistance;
}

