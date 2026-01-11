/**
 * Scenarios API - Fetch detailed flight scenario data
 */

import { apiRequest } from './client';

// Cache for loaded scenarios
const scenarioCache = new Map();

/**
 * Get detailed scenario data for a match
 * @param {string} matchId - Match identifier
 * @param {AbortSignal} signal - Abort signal for cancellation
 */
export async function getScenario(matchId, signal) {
  if (!matchId) {
    throw new Error('Match ID is required');
  }

  if (scenarioCache.has(matchId)) {
    return scenarioCache.get(matchId);
  }

  const data = await apiRequest(`/scenarios/${matchId}`, {
    signal,
    mockPath: `scenario_${matchId}.json`,
  });

  scenarioCache.set(matchId, data);
  return data;
}

/**
 * Preload scenarios for a list of match IDs
 */
export async function preloadScenarios(matchIds, signal) {
  const promises = matchIds
    .filter(id => !scenarioCache.has(id))
    .slice(0, 5) // Limit concurrent loads
    .map(id => getScenario(id, signal).catch(() => null));

  await Promise.all(promises);
}

/**
 * Check if a scenario is cached
 */
export function isScenarioCached(matchId) {
  return scenarioCache.has(matchId);
}

/**
 * Clear scenario cache
 */
export function clearScenarioCache() {
  scenarioCache.clear();
}
