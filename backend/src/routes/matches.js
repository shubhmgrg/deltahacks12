import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load matches data
let matches = [];
try {
  const dataPath = join(__dirname, '../data/matches.json');
  matches = JSON.parse(readFileSync(dataPath, 'utf-8'));
} catch (error) {
  console.warn('Could not load matches data:', error.message);
}

/**
 * GET /api/matches
 * Get all formation matches with optional filtering
 * Query params:
 *   - from: Origin airport code
 *   - to: Destination airport code
 *   - minDuration: Minimum formation duration (minutes)
 *   - maxDetour: Maximum detour distance (km)
 *   - sortBy: Sort field (co2, fuel, duration)
 *   - limit: Max results (default 20)
 */
router.get('/', (req, res) => {
  const {
    from,
    to,
    minDuration = 0,
    maxDetour = 100,
    sortBy = 'co2',
    limit = 20
  } = req.query;

  let results = [...matches];

  // Filter by origin/destination if provided
  if (from) {
    results = results.filter(m =>
      m.routeA?.includes(from.toUpperCase()) ||
      m.routeB?.includes(from.toUpperCase())
    );
  }

  if (to) {
    results = results.filter(m =>
      m.routeA?.includes(to.toUpperCase()) ||
      m.routeB?.includes(to.toUpperCase())
    );
  }

  // Filter by minimum formation duration
  results = results.filter(m => m.formationMinutes >= parseInt(minDuration));

  // Sort results
  if (sortBy === 'co2') {
    results.sort((a, b) => b.co2SavedKg - a.co2SavedKg);
  } else if (sortBy === 'fuel') {
    results.sort((a, b) => b.fuelSavedKg - a.fuelSavedKg);
  } else if (sortBy === 'duration') {
    results.sort((a, b) => b.formationMinutes - a.formationMinutes);
  }

  res.json(results.slice(0, parseInt(limit)));
});

/**
 * GET /api/matches/:id
 * Get a specific match by scenario ID
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const match = matches.find(m => m.scenarioId === id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  res.json(match);
});

export default router;
