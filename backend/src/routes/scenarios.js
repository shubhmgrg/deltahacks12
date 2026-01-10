import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load scenarios data
let scenarios = [];
try {
  const dataPath = join(__dirname, '../data/scenarios.json');
  scenarios = JSON.parse(readFileSync(dataPath, 'utf-8'));
} catch (error) {
  console.warn('Could not load scenarios data:', error.message);
}

/**
 * GET /api/scenarios
 * Get all scenarios
 */
router.get('/', (req, res) => {
  res.json(scenarios);
});

/**
 * GET /api/scenarios/:id
 * Get a specific scenario by ID with full flight data
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const scenario = scenarios.find(s => s.id === id);

  if (!scenario) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  res.json(scenario);
});

/**
 * GET /api/scenarios/:id/replay
 * Get replay data for a scenario (positions over time)
 */
router.get('/:id/replay', (req, res) => {
  const { id } = req.params;
  const scenario = scenarios.find(s => s.id === id);

  if (!scenario) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  // Return the tracked positions for replay
  res.json({
    id: scenario.id,
    leader: {
      label: scenario.leader.label,
      positions: scenario.leader.tracked || []
    },
    follower: {
      label: scenario.follower.label,
      positions: scenario.follower.tracked || []
    },
    formation: scenario.formation,
    metrics: scenario.metrics
  });
});

export default router;
