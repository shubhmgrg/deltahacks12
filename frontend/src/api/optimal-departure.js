/**
 * Optimal Departure Time API
 */

import { apiRequest } from './client';

/**
 * Get optimal departure time for a flight route
 * @param {Object} params - Route parameters
 * @param {string} params.origin - Origin airport code (IATA)
 * @param {string} params.dest - Destination airport code (IATA)
 * @param {string} params.scheduled - Scheduled departure time (YYYY-MM-DD HH:MM:SS)
 * @param {number} [params.duration] - Flight duration in minutes (optional)
 * @param {number} [params.distance] - Flight distance in km (optional)
 * @returns {Promise<Object>} Optimal departure time analysis result
 */
export async function getOptimalDepartureTime(params) {
  const { origin, dest, scheduled, duration, distance } = params;
  
  const queryParams = {
    origin,
    dest,
    scheduled,
  };
  
  if (duration) {
    queryParams.duration = duration;
  }
  
  if (distance) {
    queryParams.distance = distance;
  }
  
  return apiRequest('/api/optimal-departure', {
    params: queryParams,
    mockPath: null, // No mock data for this endpoint
  });
}

