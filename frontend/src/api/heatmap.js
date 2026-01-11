/**
 * Heatmap API - Fetch heatmap data from backend
 */

import { apiRequest } from './client';

/**
 * Get heatmap data for a specific time bucket
 * @param {string} timeBucket - Time bucket (e.g., "00:00", "00:20")
 * @param {boolean} includeFormation - Include formation weighting data
 * @returns {Promise<Object>} Heatmap data
 */
export async function getHeatmapData(timeBucket = null, includeFormation = false) {
  const params = {};
  if (timeBucket) params.timeBucket = timeBucket;
  if (includeFormation) params.includeFormation = 'true';

  try {
    const data = await apiRequest('/api/heatmap', {
      params,
      mockPath: 'heatmap.json', // Fallback to mock data if available
    });
    return data;
  } catch (error) {
    console.warn('Failed to fetch heatmap data:', error);
    // Return empty structure if fetch fails
    return {
      metadata: {
        grid_resolution_degrees: 0.1,
        time_step_minutes: 20,
        time_buckets: [],
      },
      data: [],
      source: 'error',
    };
  }
}

/**
 * Get list of available time buckets
 * @returns {Promise<string[]>} Array of time bucket strings
 */
export async function getTimeBuckets() {
  try {
    const data = await apiRequest('/api/heatmap/time-buckets', {
      mockPath: 'heatmap.json',
    });
    return data.timeBuckets || [];
  } catch (error) {
    console.warn('Failed to fetch time buckets:', error);
    return [];
  }
}

/**
 * Get heatmap statistics
 * @returns {Promise<Object>} Heatmap statistics
 */
export async function getHeatmapStats() {
  try {
    const data = await apiRequest('/api/heatmap/stats', {
      mockPath: 'heatmap.json',
    });
    return data;
  } catch (error) {
    console.warn('Failed to fetch heatmap stats:', error);
    return {
      maxIntensity: 0,
      totalFlights: 0,
      totalCells: 0,
      timeBuckets: 0,
      source: 'error',
    };
  }
}

/**
 * Convert heatmap data to GeoJSON format for Mapbox
 * @param {Array} heatmapData - Array of heatmap grid cells
 * @returns {Object} GeoJSON FeatureCollection
 */
export function convertToGeoJSON(heatmapData) {
  if (!Array.isArray(heatmapData)) {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  const features = heatmapData.map((cell) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [cell.lon, cell.lat], // GeoJSON: [lon, lat]
    },
    properties: {
      intensity: cell.intensity || cell.flight_count || 0,
      flight_count: cell.flight_count || 0,
      node_count: cell.node_count || 0,
      time_bucket: cell.time_bucket,
      ...(cell.formation_count !== undefined && { formation_count: cell.formation_count }),
      ...(cell.weighted_intensity !== undefined && { weighted_intensity: cell.weighted_intensity }),
    },
  }));

  return {
    type: 'FeatureCollection',
    features,
  };
}

