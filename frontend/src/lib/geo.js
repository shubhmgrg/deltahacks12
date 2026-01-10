/**
 * Geo utilities for formation flight calculations
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians
 */
export function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Convert radians to degrees
 */
export function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * Calculate haversine distance between two points in km
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon2 - Longitude of second point
 * @param {number} lat2 - Latitude of second point
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lon1, lat1, lon2, lat2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate heading (bearing) between two points in radians
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon2 - Longitude of second point
 * @param {number} lat2 - Latitude of second point
 * @returns {number} Heading in radians (0 = North, clockwise)
 */
export function calculateHeading(lon1, lat1, lon2, lat2) {
  const dLon = toRadians(lon2 - lon1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const x = Math.sin(dLon) * Math.cos(lat2Rad);
  const y =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  return Math.atan2(x, y);
}

/**
 * Calculate offset position for follower aircraft in formation
 * Uses small-distance approximation for efficiency
 * @param {[number, number]} leaderLngLat - Leader position [longitude, latitude]
 * @param {number} headingRad - Leader heading in radians
 * @param {number} behindKm - Distance behind leader in km (positive = behind)
 * @param {number} sideKm - Distance to the side in km (positive = right/starboard)
 * @returns {[number, number]} Follower position [longitude, latitude]
 */
export function offsetLngLat(leaderLngLat, headingRad, behindKm, sideKm) {
  const [leaderLon, leaderLat] = leaderLngLat;

  // Calculate offset in km relative to heading
  // Behind is opposite to heading, side is perpendicular (90° to the right)
  const dxKm =
    -behindKm * Math.sin(headingRad) + sideKm * Math.sin(headingRad + Math.PI / 2);
  const dyKm =
    -behindKm * Math.cos(headingRad) + sideKm * Math.cos(headingRad + Math.PI / 2);

  // Convert km to degrees using small-distance approximation
  const latOffset = dyKm / 111;
  const lonOffset = dxKm / (111 * Math.cos(toRadians(leaderLat)));

  return [leaderLon + lonOffset, leaderLat + latOffset];
}

/**
 * Linear interpolation between two values
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Linear interpolation between two coordinates
 * @param {[number, number]} p1 - First point [lon, lat]
 * @param {[number, number]} p2 - Second point [lon, lat]
 * @param {number} t - Interpolation factor (0-1)
 * @returns {[number, number]} Interpolated point
 */
export function lerpCoords(p1, p2, t) {
  return [lerp(p1[0], p2[0], t), lerp(p1[1], p2[1], t)];
}

/**
 * Get interpolated position along a path at a given progress
 * @param {Array<{lon: number, lat: number}>} points - Path points
 * @param {number} progress - Progress along path (0-1)
 * @returns {{lon: number, lat: number, heading: number, index: number}}
 */
export function getPositionAlongPath(points, progress) {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return { lon: points[0].lon, lat: points[0].lat, heading: 0, index: 0 };
  }

  const totalSegments = points.length - 1;
  const exactIndex = progress * totalSegments;
  const index = Math.min(Math.floor(exactIndex), totalSegments - 1);
  const segmentProgress = exactIndex - index;

  const p1 = points[index];
  const p2 = points[Math.min(index + 1, points.length - 1)];

  const lon = lerp(p1.lon, p2.lon, segmentProgress);
  const lat = lerp(p1.lat, p2.lat, segmentProgress);
  const heading = calculateHeading(p1.lon, p1.lat, p2.lon, p2.lat);

  return { lon, lat, heading, index };
}

/**
 * Calculate total path distance in km
 * @param {Array<{lon: number, lat: number}>} points
 * @returns {number}
 */
export function calculatePathDistance(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistance(
      points[i].lon,
      points[i].lat,
      points[i + 1].lon,
      points[i + 1].lat
    );
  }
  return total;
}

/**
 * Calculate center point of a bounding box
 * @param {Array<{lon: number, lat: number}>} points
 * @returns {[number, number]} Center [lon, lat]
 */
export function calculateCenter(points) {
  if (points.length === 0) return [0, 0];

  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  points.forEach((p) => {
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
  });

  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

/**
 * Calculate bounding box for points
 * @param {Array<{lon: number, lat: number}>} points
 * @returns {[[number, number], [number, number]]} [[sw], [ne]]
 */
export function calculateBounds(points) {
  if (points.length === 0) return [[-180, -90], [180, 90]];

  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  points.forEach((p) => {
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
  });

  // Add padding
  const padding = 0.5;
  return [
    [minLon - padding, minLat - padding],
    [maxLon + padding, maxLat + padding],
  ];
}

/**
 * Build planned route points using approximate great-circle interpolation
 * Note: Uses linear interpolation for simplicity; this is "approx great-circle"
 * @param {Object} origin - {lon, lat, code}
 * @param {Object} destination - {lon, lat, code}
 * @param {number} durationSec - Total flight duration in seconds
 * @param {number} stepSec - Time step between points in seconds (default 10)
 * @returns {Array} Array of {t, lon, lat} points
 */
export function buildPlannedPoints(origin, destination, durationSec, stepSec = 10) {
  const points = [];
  const numSteps = Math.ceil(durationSec / stepSec);

  for (let i = 0; i <= numSteps; i++) {
    const t = Math.min(i * stepSec, durationSec);
    const progress = durationSec > 0 ? t / durationSec : 0;

    // Approximate great-circle: linear lat/lon interpolation
    // Production would use true spherical interpolation
    const lon = origin.lon + (destination.lon - origin.lon) * progress;
    const lat = origin.lat + (destination.lat - origin.lat) * progress;

    points.push({ t, lon, lat });
  }

  return points;
}

/**
 * Find position and heading at a given time within a points array
 * @param {Array} points - Array of {t, lon, lat} objects
 * @param {number} time - Time to find position for
 * @returns {Object} {position: [lon, lat], heading: radians, index: number}
 */
export function getPositionAtTime(points, time) {
  if (!points || points.length === 0) {
    return { position: [0, 0], heading: 0, index: 0 };
  }

  if (time <= points[0].t) {
    const heading =
      points.length > 1
        ? calculateHeading(points[0].lon, points[0].lat, points[1].lon, points[1].lat)
        : 0;
    return { position: [points[0].lon, points[0].lat], heading, index: 0 };
  }

  if (time >= points[points.length - 1].t) {
    const lastIdx = points.length - 1;
    const heading =
      points.length > 1
        ? calculateHeading(
            points[lastIdx - 1].lon,
            points[lastIdx - 1].lat,
            points[lastIdx].lon,
            points[lastIdx].lat
          )
        : 0;
    return { position: [points[lastIdx].lon, points[lastIdx].lat], heading, index: lastIdx };
  }

  // Binary search for the segment
  let low = 0;
  let high = points.length - 1;

  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].t <= time) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const p1 = points[low];
  const p2 = points[high];
  const segmentDuration = p2.t - p1.t;
  const t = segmentDuration > 0 ? (time - p1.t) / segmentDuration : 0;

  const position = lerpCoords([p1.lon, p1.lat], [p2.lon, p2.lat], t);
  const heading = calculateHeading(p1.lon, p1.lat, p2.lon, p2.lat);

  return { position, heading, index: low };
}

/**
 * Find closest approach index between two flight paths
 * Useful for computing join point when not provided
 */
export function findClosestApproachIndex(points1, points2) {
  let minDist = Infinity;
  let minIndex = 0;

  const step = Math.max(1, Math.floor(points1.length / 100));

  for (let i = 0; i < points1.length; i += step) {
    const p1 = points1[i];
    const p2Data = getPositionAtTime(points2, p1.t);
    const dist = haversineDistance(p1.lon, p1.lat, p2Data.position[0], p2Data.position[1]);

    if (dist < minDist) {
      minDist = dist;
      minIndex = i;
    }
  }

  return minIndex;
}
