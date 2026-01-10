import express from 'express';
import cors from 'cors';
import airportsRouter from './routes/airports.js';
import matchesRouter from './routes/matches.js';
import scenariosRouter from './routes/scenarios.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/airports', airportsRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/scenarios', scenariosRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`SkySync API running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
