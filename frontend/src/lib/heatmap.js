/**
 * Heatmap utilities for SkySync
 * Generates heatmap point data from formation flight matches
 */

import { haversineDistance } from './geo';

// Cache for computed heatmap points
const heatmapCache = new Map();

/**
 * Generate heatmap points from matches
 * @param {Array} matches - Array of match objects with scenarios loaded
 * @param {string} metric - 'co2' | 'fuel' | 'density'
 * @param {number} topN - Number of top matches to include (default 50)
 * @returns {Object} GeoJSON FeatureCollection
 */
export function generateHeatmapPoints(matches, metric = 'co2', topN = 50) {
  const cacheKey = `${metric}-${topN}-${matches.map(m => m.id).join(',')}`;

  if (heatmapCache.has(cacheKey)) {
    return heatmapCache.get(cacheKey);
  }

  const features = [];

  // Process top N matches
  const topMatches = matches.slice(0, topN);

  topMatches.forEach((match) => {
    if (!match.scenario) return;

    const { leader, joinIndex, splitIndex, metrics } = match.scenario;
    if (!leader?.points) return;

    // Sample formation segment
    const formationPoints = leader.points.slice(joinIndex, splitIndex + 1);
    if (formationPoints.length < 2) return;

    // Calculate total formation distance
    let totalDist = 0;
    for (let i = 1; i < formationPoints.length; i++) {
      totalDist += haversineDistance(
        formationPoints[i - 1].lon,
        formationPoints[i - 1].lat,
        formationPoints[i].lon,
        formationPoints[i].lat
      );
    }

    if (totalDist === 0) return;

    // Distribute weight along formation segment
    let weight;
    switch (metric) {
      case 'co2':
        weight = metrics?.co2SavedKg || 0;
        break;
      case 'fuel':
        weight = metrics?.fuelSavedKg || 0;
        break;
      case 'density':
      default:
        weight = 1;
    }

    // Sample points along formation (every ~50km or at least 10 points)
    const sampleStep = Math.max(1, Math.floor(formationPoints.length / 20));

    for (let i = 0; i < formationPoints.length; i += sampleStep) {
      const p = formationPoints[i];

      // Weight is distributed proportionally
      const pointWeight = weight / (formationPoints.length / sampleStep);

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.lon, p.lat],
        },
        properties: {
          w: Math.max(0.1, pointWeight),
          matchId: match.id,
        },
      });
    }
  });

  const result = {
    type: 'FeatureCollection',
    features,
  };

  // Cache result
  heatmapCache.set(cacheKey, result);

  return result;
}

/**
 * Clear heatmap cache
 */
export function clearHeatmapCache() {
  heatmapCache.clear();
}

/**
 * Generate heatmap layer configuration for Mapbox
 */
export function getHeatmapLayerConfig(metric = 'co2') {
  // Color ramp based on metric
  const colorRamps = {
    co2: ['rgba(0, 255, 136, 0)', 'rgba(0, 255, 136, 0.5)', 'rgba(255, 200, 0, 0.8)', 'rgba(255, 100, 0, 1)'],
    fuel: ['rgba(0, 200, 255, 0)', 'rgba(0, 200, 255, 0.5)', 'rgba(150, 100, 255, 0.8)', 'rgba(255, 50, 150, 1)'],
    density: ['rgba(33, 150, 243, 0)', 'rgba(33, 150, 243, 0.4)', 'rgba(156, 39, 176, 0.7)', 'rgba(244, 67, 54, 1)'],
  };

  const colors = colorRamps[metric] || colorRamps.density;

  return {
    id: 'heatmap-layer',
    type: 'heatmap',
    source: 'heatmap-source',
    paint: {
      // Weight based on property
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'w'], 0, 0, 100, 1],
      // Intensity based on zoom
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 2, 1, 10, 3],
      // Color ramp
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        colors[0],
        0.3,
        colors[1],
        0.6,
        colors[2],
        1,
        colors[3],
      ],
      // Radius based on zoom
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 30, 10, 50],
      // Opacity - fade at high zoom
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 0.3],
    },
  };
}
