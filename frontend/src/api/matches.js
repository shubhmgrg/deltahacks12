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
 * Get formation pairs from backend (Airline Route)
 */
export async function getFormationPairs(filters = {}) {
    // Direct fetch to avoid mock fallback logic issues during debugging
    // Note: Backend now ignores filters and returns top 100,
    // but we keep sending them in case we switch logic back later.
    const query = new URLSearchParams({
        tolerance: filters.headingTolerance,
        maxTimeApart: filters.timeOverlap,
        maxDetour: filters.maxDetour,
        minDuration: filters.minFormationDuration,
        limit: 100
    });

    try {
        const res = await fetch(`http://localhost:3000/api/airline/formation-pairs?${query}`);
        return await res.json();
    } catch (err) {
        console.error("Direct fetch failed", err);
        return { pairs: [] };
    }
}

/**
 * Clear matches cache
 */
export function clearMatchCache() {
    matchCache.clear();
}
