import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);

/**
 * GET /api/optimal-departure
 * Get optimal departure time for a flight route
 * 
 * Query params:
 *   - origin: Origin airport code (IATA, e.g., JFK) [required]
 *   - dest: Destination airport code (IATA, e.g., LAX) [required]
 *   - scheduled: Scheduled departure time (YYYY-MM-DD HH:MM:SS) [required]
 *   - duration: Flight duration in minutes (optional, will estimate if not provided)
 *   - distance: Flight distance in km (optional, will calculate if not provided)
 */
router.get('/', async (req, res) => {
  try {
    const { origin, dest, scheduled, duration, distance } = req.query;

    // Validate required parameters
    if (!origin || !dest || !scheduled) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['origin', 'dest', 'scheduled'],
        received: { origin, dest, scheduled }
      });
    }

    // Build command to run the Python script
    const scriptPath = join(__dirname, '../../../scripts/optimal_departure_time.py');
    let command = `python3 "${scriptPath}" --origin "${origin}" --dest "${dest}" --scheduled "${scheduled}" --json`;
    
    if (duration) {
      command += ` --duration ${duration}`;
    }
    
    if (distance) {
      command += ` --distance ${distance}`;
    }

    // Execute the Python script
    const { stdout, stderr } = await execAsync(command, {
      cwd: join(__dirname, '../../..'),
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    if (stderr && !stderr.includes('WARNING')) {
      console.error('Script stderr:', stderr);
    }

    // Parse JSON output (the script outputs JSON when --json is used)
    // Extract JSON from stdout (the last JSON object in the output)
    // The script may output progress messages before the JSON
    const jsonMatch = stdout.match(/\{[\s\S]*\}$/m);
    if (!jsonMatch) {
      // Try to find any JSON object in the output
      const fallbackMatch = stdout.match(/\{[\s\S]*\}/);
      if (!fallbackMatch) {
        throw new Error('Could not parse JSON output from script. stdout: ' + stdout.substring(0, 500));
      }
      const result = JSON.parse(fallbackMatch[0]);
      return res.json(result);
    }

    const result = JSON.parse(jsonMatch[0]);
    
    res.json(result);

  } catch (error) {
    console.error('Error in optimal-departure endpoint:', error);
    res.status(500).json({
      error: 'Failed to calculate optimal departure time',
      message: error.message,
      details: error.stderr || error.stdout
    });
  }
});

/**
 * POST /api/optimal-departure
 * Get optimal departure time with request body (for complex requests)
 * 
 * Body:
 *   {
 *     "origin": "JFK",
 *     "dest": "LAX",
 *     "scheduled": "2013-01-01 08:00:00",
 *     "duration": 300,  // optional
 *     "distance": 3000  // optional
 *   }
 */
router.post('/', async (req, res) => {
  try {
    const { origin, dest, scheduled, duration, distance } = req.body;

    // Validate required parameters
    if (!origin || !dest || !scheduled) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['origin', 'dest', 'scheduled'],
        received: { origin, dest, scheduled }
      });
    }

    // Build command to run the Python script
    const scriptPath = join(__dirname, '../../../scripts/optimal_departure_time.py');
    let command = `python3 "${scriptPath}" --origin "${origin}" --dest "${dest}" --scheduled "${scheduled}" --json`;
    
    if (duration) {
      command += ` --duration ${duration}`;
    }
    
    if (distance) {
      command += ` --distance ${distance}`;
    }

    // Execute the Python script
    const { stdout, stderr } = await execAsync(command, {
      cwd: join(__dirname, '../../..'),
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    if (stderr && !stderr.includes('WARNING')) {
      console.error('Script stderr:', stderr);
    }

    // Parse JSON output
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON output from script');
    }

    const result = JSON.parse(jsonMatch[0]);
    
    res.json(result);

  } catch (error) {
    console.error('Error in optimal-departure endpoint:', error);
    res.status(500).json({
      error: 'Failed to calculate optimal departure time',
      message: error.message,
      details: error.stderr || error.stdout
    });
  }
});

export default router;

