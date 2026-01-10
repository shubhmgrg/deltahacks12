import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load airports data
let airports = [];
try {
  const dataPath = join(__dirname, '../data/airports.json');
  airports = JSON.parse(readFileSync(dataPath, 'utf-8'));
} catch (error) {
  console.warn('Could not load airports data:', error.message);
}

/**
 * GET /api/airports/search
 * Search airports by query string
 * Query params: q (search query), near (optional location), limit (default 10)
 */
router.get('/search', (req, res) => {
  const { q = '', near, limit = 10 } = req.query;

  if (!q || q.length < 1) {
    return res.json([]);
  }

  const queryLower = q.toLowerCase().trim();

  // Filter airports matching the query
  let results = airports.filter((airport) => {
    const codeMatch = airport.code.toLowerCase().includes(queryLower);
    const nameMatch = airport.name.toLowerCase().includes(queryLower);
    const cityMatch = airport.city.toLowerCase().includes(queryLower);
    return codeMatch || nameMatch || cityMatch;
  });

  // If "near" is provided, prioritize airports near that location
  if (near) {
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

  res.json(results.slice(0, parseInt(limit)));
});

/**
 * GET /api/airports/:code
 * Get airport by IATA code
 */
router.get('/:code', (req, res) => {
  const { code } = req.params;
  const airport = airports.find(
    (a) => a.code.toUpperCase() === code.toUpperCase()
  );

  if (!airport) {
    return res.status(404).json({ error: 'Airport not found' });
  }

  res.json(airport);
});

/**
 * GET /api/airports
 * Get all airports (or popular ones)
 */
router.get('/', (req, res) => {
  const { popular } = req.query;

  if (popular === 'true') {
    const popularCodes = ['JFK', 'LAX', 'LHR', 'CDG', 'DXB', 'SIN', 'HND', 'ORD', 'AMS', 'FRA', 'YYZ', 'SFO'];
    const popularAirports = popularCodes
      .map(code => airports.find(a => a.code === code))
      .filter(Boolean);
    return res.json(popularAirports);
  }

  res.json(airports);
});

export default router;
