import { Router } from 'express';
import { createReadStream, existsSync } from 'fs';
import path from 'path';
import { Game } from '../models/Game.js';
import { storageService } from '../services/storage.service.js';
import { config } from '../config.js';

export const gamesRoutes = Router();

// GET /api/games - list active games
gamesRoutes.get('/', async (req, res) => {
  const games = await Game.find({ isActive: true })
    .select('-romPath')
    .sort({ title: 1 });
  res.json(games);
});

// GET /api/games/bios/:filename - serve BIOS file (must be BEFORE /:id)
gamesRoutes.get('/bios/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const biosPath = path.join(config.STORAGE_LOCAL_PATH, 'bios', filename);

  if (!existsSync(biosPath)) {
    res.status(404).json({ error: 'BIOS file not found. Place BIOS in storage/bios/' });
    return;
  }

  res.set('Content-Type', 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  const stream = createReadStream(biosPath);
  stream.on('error', () => {
    res.status(500).json({ error: 'Failed to read BIOS file' });
  });
  stream.pipe(res);
});

// GET /api/games/:id - game detail
gamesRoutes.get('/:id', async (req, res) => {
  try {
    const game = await Game.findById(req.params.id).select('-romPath');
    if (!game || !game.isActive) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    res.json(game);
  } catch {
    res.status(400).json({ error: 'Invalid game ID' });
  }
});

// GET /api/games/:id/rom - stream ROM file
gamesRoutes.get('/:id/rom', async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game || !game.isActive) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const filePath = await storageService.getROMStream(game.romPath);
    if (!filePath) {
      res.status(404).json({ error: 'ROM file not found' });
      return;
    }

    res.set('Content-Type', 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=86400');
    if (game.romSizeBytes) {
      res.set('Content-Length', String(game.romSizeBytes));
    }

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      res.status(500).json({ error: 'Failed to read ROM file' });
    });
    stream.pipe(res);
  } catch {
    res.status(400).json({ error: 'Invalid game ID' });
  }
});
