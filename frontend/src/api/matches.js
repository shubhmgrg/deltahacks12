/**
 * Matches API - Fetch formation flight match opportunities
 */

import { apiRequest } from './client';

// Cache for loaded matches
const matchCache = new Map();

/**
 * Get list of formation flight matches
 * @param {Object} params - Filter parameters
 * @param {AbortSignal} signal - Abort signal for cancellation
 */
export async function getMatches(params = {}, signal) {
  const cacheKey = JSON.stringify(params);

  if (matchCache.has(cacheKey)) {
    return matchCache.get(cacheKey);
  }

  const raw = await apiRequest('/api/matches', {
    params,
    signal,
    mockPath: 'matches_index.json',
  });

  // Normalize backend vs mock shapes.
  // - Backend returns: Match[]
  // - Mock returns: { matches: Match[] }
  const data = Array.isArray(raw) ? raw : Array.isArray(raw?.matches) ? raw.matches : [];

  matchCache.set(cacheKey, data);
  return data;
}

/**
 * Clear matches cache
 */
export function clearMatchCache() {
  matchCache.clear();
}
