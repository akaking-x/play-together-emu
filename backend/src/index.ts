import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config.js';
import { seedAdmin } from './db/connection.js';
import { authRoutes } from './routes/auth.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { gamesRoutes } from './routes/games.routes.js';
import { createRoomsRoutes } from './routes/rooms.routes.js';
import { savesRoutes } from './routes/saves.routes.js';
import { keymapsRoutes } from './routes/keymaps.routes.js';
import { SignalingServer } from './signaling/ws-server.js';
import { authMiddleware } from './middleware/auth.js';
import { adminMiddleware } from './middleware/admin.js';

async function main() {
  // Connect to MongoDB
  await mongoose.connect(config.MONGO_URI);
  console.log('MongoDB connected');

  // Seed admin account on first run
  await seedAdmin();

  const app = express();
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json());

  // Serve static files (ROM, saves, covers) - dev phase
  if (config.STORAGE_TYPE === 'local') {
    app.use('/storage', authMiddleware, express.static(config.STORAGE_LOCAL_PATH));
  }

  // HTTP + WebSocket server
  const server = http.createServer(app);
  const signaling = new SignalingServer(server);

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', authMiddleware, adminMiddleware, adminRoutes);
  app.use('/api/games', gamesRoutes);
  app.use('/api/rooms', authMiddleware, createRoomsRoutes(signaling));
  app.use('/api/saves', authMiddleware, savesRoutes);
  app.use('/api/keymaps', authMiddleware, keymapsRoutes);

  server.listen(config.PORT, () => {
    console.log(`Server running on http://localhost:${config.PORT}`);
  });
}

main().catch(console.error);
