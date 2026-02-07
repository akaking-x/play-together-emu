import { Router } from 'express';
import { createRandomUser, createBatchUsers } from '../services/user-generator.js';
import { User } from '../models/User.js';
import { Game } from '../models/Game.js';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { storageService } from '../services/storage.service.js';

export const adminRoutes = Router();
const upload = multer({ storage: multer.memoryStorage() });

// === USER MANAGEMENT ===

adminRoutes.post('/users', async (req, res) => {
  const { displayName = 'Player', role = 'player', username, password } = req.body;
  try {
    const creds = await createRandomUser(displayName, role, username, password);
    res.json(creds);
  } catch (err: unknown) {
    const mongoErr = err as { code?: number };
    if (mongoErr.code === 11000) {
      res.status(409).json({ error: 'Username da ton tai' });
      return;
    }
    throw err;
  }
});

adminRoutes.post('/users/batch', async (req, res) => {
  const { count = 10, prefix = 'Player' } = req.body;
  if (count > 100) {
    res.status(400).json({ error: 'Max 100 users per batch' });
    return;
  }
  const users = await createBatchUsers(count, prefix);
  res.json({ users, count: users.length });
});

adminRoutes.get('/users', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const users = await User.find({}, '-passwordHash -keyProfiles')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  const total = await User.countDocuments();
  res.json({ users, total, page, limit });
});

adminRoutes.patch('/users/:id', async (req, res) => {
  const { displayName, role, isActive, resetPassword } = req.body;
  const update: Record<string, unknown> = {};
  if (displayName !== undefined) update.displayName = displayName;
  if (role !== undefined) update.role = role;
  if (isActive !== undefined) update.isActive = isActive;

  let newPassword: string | null = null;
  if (resetPassword) {
    const crypto = await import('crypto');
    newPassword = Array.from(crypto.randomBytes(10), b =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]
    ).join('');
    update.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  await User.findByIdAndUpdate(req.params.id, update);
  res.json({ success: true, ...(newPassword ? { newPassword } : {}) });
});

adminRoutes.delete('/users/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// === GAME MANAGEMENT ===

adminRoutes.get('/games', async (req, res) => {
  const games = await Game.find({}).sort({ createdAt: -1 });
  res.json(games);
});

adminRoutes.post('/games', upload.single('rom'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'ROM file required' });
    return;
  }

  const { title, slug, discId, region, genre, minPlayers, maxPlayers, hasSplitScreen, description } = req.body;

  // Save ROM file
  const romPath = await storageService.saveROM(req.file.originalname, req.file.buffer);

  const game = await Game.create({
    title, slug, discId, region, genre,
    minPlayers: parseInt(minPlayers) || 2,
    maxPlayers: parseInt(maxPlayers) || 2,
    hasSplitScreen: hasSplitScreen !== 'false',
    description,
    romFilename: req.file.originalname,
    romPath,
    romSizeBytes: req.file.size,
  });

  res.json(game);
});

adminRoutes.patch('/games/:id', async (req, res) => {
  const game = await Game.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(game);
});

adminRoutes.delete('/games/:id', async (req, res) => {
  const game = await Game.findById(req.params.id);
  if (game) {
    await storageService.deleteROM(game.romPath);
    await game.deleteOne();
  }
  res.json({ success: true });
});

// === STATS ===

adminRoutes.get('/stats', async (req, res) => {
  const [totalUsers, activeUsers, totalGames] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ lastLogin: { $gte: new Date(Date.now() - 7 * 86400000) } }),
    Game.countDocuments({ isActive: true }),
  ]);
  res.json({ totalUsers, activeUsers, totalGames });
});
