// Airport search API
// For now uses mock data, can be easily replaced with real API calls

let airportsCache = null;

/**
 * Load airports data from JSON file
 */
async function loadAirportsData() {
  if (airportsCache) {
    return airportsCache;
  }

  try {
    const response = await fetch('/data/airports_sample.json');
    const data = await response.json();
    airportsCache = data;
    return data;
  } catch (error) {
    console.error('Failed to load airports data:', error);
    return [];
  }
}

/**
 * Search airports by query string
 * @param {string} query - Search query (airport code, name, or city)
 * @param {string|null} near - Optional location (city or coordinates) to prioritize results
 * @param {number} limit - Maximum number of results to return
 * @returns {Promise<Array>} Array of matching airports
 */
export async function searchAirports(query = '', near = null, limit = 10) {
  if (!query || query.length < 1) {
    return [];
  }

  const airports = await loadAirportsData();
  const queryLower = query.toLowerCase().trim();

  // Filter airports matching the query
  let results = airports.filter((airport) => {
    const codeMatch = airport.code.toLowerCase().includes(queryLower);
    const nameMatch = airport.name.toLowerCase().includes(queryLower);
    const cityMatch = airport.city.toLowerCase().includes(queryLower);
    return codeMatch || nameMatch || cityMatch;
  });

  // If "near" is provided, prioritize airports near that location
  if (near) {
    // Simple prioritization: exact city match first, then country match
    results.sort((a, b) => {
      const aCityMatch = a.city.toLowerCase().includes(near.toLowerCase());
      const bCityMatch = b.city.toLowerCase().includes(near.toLowerCase());
      if (aCityMatch && !bCityMatch) return -1;
      if (!aCityMatch && bCityMatch) return 1;
      return 0;
    });
  }

  // Prioritize exact code matches
  results.sort((a, b) => {
    const aExact = a.code.toLowerCase() === queryLower;
    const bExact = b.code.toLowerCase() === queryLower;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return 0;
  });

  return results.slice(0, limit);
}

/**
 * Get airport by code
 * @param {string} code - Airport IATA code
 * @returns {Promise<Object|null>} Airport object or null if not found
 */
export async function getAirportByCode(code) {
  const airports = await loadAirportsData();
  return airports.find((a) => a.code.toUpperCase() === code.toUpperCase()) || null;
}

/**
 * Get a sample list of popular airports for UI suggestions
 * @param {number} limit - Maximum number of airports to return
 * @returns {Promise<Array>} Array of sample airports
 */
export async function getSampleAirports(limit = 10) {
  const airports = await loadAirportsData();

  // Popular airport codes to prioritize
  const popularCodes = ['JFK', 'LAX', 'LHR', 'CDG', 'DXB', 'SIN', 'HND', 'ORD', 'AMS', 'FRA', 'YYZ', 'SFO'];

  // Find airports matching popular codes first
  const popular = popularCodes
    .map(code => airports.find(a => a.code === code))
    .filter(Boolean);

  // If we don't have enough, fill with other airports
  if (popular.length < limit) {
    const remaining = airports
      .filter(a => !popularCodes.includes(a.code))
      .slice(0, limit - popular.length);
    return [...popular, ...remaining].slice(0, limit);
  }

  return popular.slice(0, limit);
}

/**
 * Format airport display string
 * @param {Object} airport - Airport object
 * @returns {string} Formatted string like "YYZ - Toronto"
 */
export function formatAirport(airport) {
  if (!airport) return '';
  return `${airport.code} - ${airport.city}`;
}
