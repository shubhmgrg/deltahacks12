/**
 * Geo utilities for formation flight visualization
 */

/**
 * Convert degrees to radians
 */
export function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians) {
  return radians * 180 / Math.PI;
}

/**
 * Calculate bounding box for an array of points
 */
export function calculateBounds(points) {
  if (!points || points.length === 0) {
    return [[-180, -90], [180, 90]];
  }
  
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  
  for (const point of points) {
    const lon = point.lon ?? point.lng ?? point[0];
    const lat = point.lat ?? point[1];
    
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  
  // Add some padding
  const lonPadding = (maxLon - minLon) * 0.1 || 1;
  const latPadding = (maxLat - minLat) * 0.1 || 1;
  
  return [
    [minLon - lonPadding, minLat - latPadding],
    [maxLon + lonPadding, maxLat + latPadding]
  ];
}

/**
 * Calculate center point of an array of points
 */
export function calculateCenter(points) {
  if (!points || points.length === 0) {
    return { lat: 0, lon: 0 };
  }
  
  let sumLat = 0, sumLon = 0;
  
  for (const point of points) {
    sumLon += point.lon ?? point.lng ?? point[0];
    sumLat += point.lat ?? point[1];
  }
  
  return {
    lat: sumLat / points.length,
    lon: sumLon / points.length
  };
}

/**
 * Calculate bearing/heading between two points (in radians)
 */
export function calculateHeading(lat1, lon1, lat2, lon2) {
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δλ = toRadians(lon2 - lon1);
  
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  
  return Math.atan2(y, x);
}

/**
 * Calculate distance between two points using Haversine formula (in km)
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Offset a lat/lon point by a distance and bearing
 */
export function offsetLngLat(lat, lon, distanceKm, bearingRadians) {
  const R = 6371; // Earth's radius in km
  const φ1 = toRadians(lat);
  const λ1 = toRadians(lon);
  const δ = distanceKm / R; // Angular distance
  const θ = bearingRadians;
  
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );
  
  return {
    lat: toDegrees(φ2),
    lon: toDegrees(λ2)
  };
}

/**
 * Interpolate between two points
 */
export function interpolatePosition(p1, p2, t) {
  return {
    lat: p1.lat + (p2.lat - p1.lat) * t,
    lon: p1.lon + (p2.lon - p1.lon) * t
  };
}

/**
 * Calculate the midpoint between two points (great circle)
 */
export function midpoint(lat1, lon1, lat2, lon2) {
  const φ1 = toRadians(lat1);
  const λ1 = toRadians(lon1);
  const φ2 = toRadians(lat2);
  const Δλ = toRadians(lon2 - lon1);
  
  const Bx = Math.cos(φ2) * Math.cos(Δλ);
  const By = Math.cos(φ2) * Math.sin(Δλ);
  
  const φ3 = Math.atan2(
    Math.sin(φ1) + Math.sin(φ2),
    Math.sqrt((Math.cos(φ1) + Bx) * (Math.cos(φ1) + Bx) + By * By)
  );
  const λ3 = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);
  
  return {
    lat: toDegrees(φ3),
    lon: toDegrees(λ3)
  };
}

/**
 * Build planned points (if needed for route visualization)
 */
export function buildPlannedPoints(originLat, originLon, destLat, destLon, numPoints = 100) {
  const points = [];
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    // Use great circle interpolation for more accurate paths
    const point = interpolateGreatCircle(originLat, originLon, destLat, destLon, t);
    points.push({
      t: i,
      lat: point.lat,
      lon: point.lon
    });
  }
  
  return points;
}

/**
 * Great circle interpolation between two points
 */
export function interpolateGreatCircle(lat1, lon1, lat2, lon2, fraction) {
  const φ1 = toRadians(lat1);
  const λ1 = toRadians(lon1);
  const φ2 = toRadians(lat2);
  const λ2 = toRadians(lon2);
  
  // Calculate angular distance
  const Δφ = φ2 - φ1;
  const Δλ = λ2 - λ1;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const δ = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  if (δ < 0.0001) {
    // Points are very close, use linear interpolation
    return {
      lat: lat1 + (lat2 - lat1) * fraction,
      lon: lon1 + (lon2 - lon1) * fraction
    };
  }
  
  const A = Math.sin((1 - fraction) * δ) / Math.sin(δ);
  const B = Math.sin(fraction * δ) / Math.sin(δ);
  
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  
  const φ3 = Math.atan2(z, Math.sqrt(x * x + y * y));
  const λ3 = Math.atan2(y, x);
  
  return {
    lat: toDegrees(φ3),
    lon: toDegrees(λ3)
  };
}

/**
 * Smooth a path using Catmull-Rom spline
 */
export function smoothPath(points, tension = 0.5, numSegments = 10) {
  if (points.length < 2) return points;
  
  const smoothed = [];
  
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    
    for (let j = 0; j < numSegments; j++) {
      const t = j / numSegments;
      const point = catmullRomInterpolate(p0, p1, p2, p3, t, tension);
      smoothed.push(point);
    }
  }
  
  // Add the last point
  smoothed.push(points[points.length - 1]);
  
  return smoothed;
}

/**
 * Catmull-Rom spline interpolation
 */
function catmullRomInterpolate(p0, p1, p2, p3, t, tension = 0.5) {
  const t2 = t * t;
  const t3 = t2 * t;
  
  const v0lat = (p2.lat - p0.lat) * tension;
  const v1lat = (p3.lat - p1.lat) * tension;
  const v0lon = (p2.lon - p0.lon) * tension;
  const v1lon = (p3.lon - p1.lon) * tension;
  
  const lat = (2 * t3 - 3 * t2 + 1) * p1.lat +
              (t3 - 2 * t2 + t) * v0lat +
              (-2 * t3 + 3 * t2) * p2.lat +
              (t3 - t2) * v1lat;
              
  const lon = (2 * t3 - 3 * t2 + 1) * p1.lon +
              (t3 - 2 * t2 + t) * v0lon +
              (-2 * t3 + 3 * t2) * p2.lon +
              (t3 - t2) * v1lon;
  
  return { lat, lon, t: p1.t + (p2.t - p1.t) * t };
}

export default {
  toRadians,
  toDegrees,
  calculateBounds,
  calculateCenter,
  calculateHeading,
  haversineDistance,
  offsetLngLat,
  interpolatePosition,
  midpoint,
  buildPlannedPoints,
  interpolateGreatCircle,
  smoothPath
};