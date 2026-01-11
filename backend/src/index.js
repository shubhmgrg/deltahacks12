import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import airportsRouter from './routes/airports.js';
import matchesRouter from './routes/matches.js';
import scenariosRouter from './routes/scenarios.js';
import airlineRouter from './routes/airline.js';
import agentRouter, { setupAgentSocket } from './routes/agent.js';
import { itemsRouter } from './routes/items.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

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
app.use('/api/airline', airlineRouter);
app.use('/api/agent', agentRouter);
app.use('/api/items', itemsRouter);

// Setup Socket.io for agent chat
setupAgentSocket(io);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`SkySync API running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Socket.io agent chat ready on /agent namespace`);
});
