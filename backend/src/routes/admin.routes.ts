import { Router } from 'express';
import { createRandomUser, createBatchUsers } from '../services/user-generator.js';
import { User } from '../models/User.js';
import { Game } from '../models/Game.js';
import bcrypt from 'bcrypt';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { storageService } from '../services/storage.service.js';
import { parseCheatsFile } from '../services/split-screen.service.js';
import { GAME_TAGS } from '../constants/game-tags.js';
import sharp from 'sharp';

export const adminRoutes = Router();
const upload = multer({ storage: multer.memoryStorage() });

// === CHUNKED UPLOAD SESSION STORE ===

interface UploadSession {
  id: string;
  filename: string;
  fileSize: number;
  totalChunks: number;
  receivedChunks: Set<number>;
  tempDir: string;
  createdAt: number;
}

const uploadSessions = new Map<string, UploadSession>();

// Auto-cleanup sessions older than 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of uploadSessions) {
    if (now - session.createdAt > 3600000) {
      fs.rm(session.tempDir, { recursive: true, force: true }).catch(() => {});
      uploadSessions.delete(id);
    }
  }
}, 60000);

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
  const { displayName, role, isActive, resetPassword, newPassword: customPassword } = req.body;
  const update: Record<string, unknown> = {};
  if (displayName !== undefined) update.displayName = displayName;
  if (role !== undefined) update.role = role;
  if (isActive !== undefined) update.isActive = isActive;

  let newPassword: string | null = null;
  if (resetPassword) {
    if (customPassword && typeof customPassword === 'string' && customPassword.length > 0) {
      newPassword = customPassword;
    } else {
      const crypto = await import('crypto');
      newPassword = Array.from(crypto.randomBytes(10), b =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]
      ).join('');
    }
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

  const { title, slug, discId, region, minPlayers, maxPlayers, hasSplitScreen, description } = req.body;
  let tags: string[] = [];
  try { tags = JSON.parse(req.body.tags || '[]'); } catch { tags = []; }

  // Save ROM file
  const romPath = await storageService.saveROM(req.file.originalname, req.file.buffer);

  const game = await Game.create({
    title, slug, discId, region, tags,
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

// === COVER UPLOAD ===

adminRoutes.post('/games/:id/cover', upload.single('cover'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Cover image required' });
    return;
  }

  try {
    const game = await Game.findById(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    // Delete old cover if exists
    if (game.coverPath) {
      await storageService.deleteCover(game.coverPath);
    }

    // Resize to 480x270 (16:9), JPEG quality 80
    const processed = await sharp(req.file.buffer)
      .resize(480, 270, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();

    const coverPath = await storageService.saveCover(game._id.toString(), processed);
    game.coverPath = coverPath;
    await game.save();

    res.json(game);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cover upload failed';
    res.status(400).json({ error: msg });
  }
});

// === CHEATS MANAGEMENT ===

const cheatsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1MB max
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.json') || file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Chi chap nhan file .json'));
    }
  },
});

adminRoutes.post('/games/:id/upload-cheats', cheatsUpload.single('cheatsFile'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'File cheats (.json) required' });
    return;
  }

  try {
    const game = await Game.findById(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const json = JSON.parse(req.file.buffer.toString('utf-8'));
    const { config: cheatsConfig, warnings } = parseCheatsFile(json);

    game.splitScreenCheats = cheatsConfig;
    await game.save();

    res.json({
      success: true,
      filename: req.file.originalname,
      splitScreenCheats: cheatsConfig,
      warnings,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Loi parse file cheats';
    res.status(400).json({ error: msg });
  }
});

adminRoutes.get('/games/:id/cheats', async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    res.json({ splitScreenCheats: game.splitScreenCheats });
  } catch {
    res.status(400).json({ error: 'Invalid game ID' });
  }
});

adminRoutes.delete('/games/:id/cheats', async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    game.splitScreenCheats = null;
    await game.save();
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Invalid game ID' });
  }
});

// === CHUNKED UPLOAD ===

adminRoutes.post('/games/upload/init', async (req, res) => {
  const { filename, fileSize, totalChunks } = req.body;
  if (!filename || !fileSize || !totalChunks) {
    res.status(400).json({ error: 'Missing filename, fileSize, or totalChunks' });
    return;
  }

  const sessionId = crypto.randomBytes(16).toString('hex');
  const tempDir = path.join(config.STORAGE_LOCAL_PATH, 'tmp_uploads', sessionId);
  await fs.mkdir(tempDir, { recursive: true });

  uploadSessions.set(sessionId, {
    id: sessionId,
    filename,
    fileSize,
    totalChunks,
    receivedChunks: new Set(),
    tempDir,
    createdAt: Date.now(),
  });

  res.json({ sessionId, totalChunks });
});

adminRoutes.post('/games/upload/chunk/:sessionId/:chunkIndex', upload.single('chunk'), async (req, res) => {
  const sessionId = req.params.sessionId as string;
  const chunkIndex = req.params.chunkIndex as string;
  const session = uploadSessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Upload session not found or expired' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'Chunk data required' });
    return;
  }

  const idx = parseInt(chunkIndex);
  const chunkPath = path.join(session.tempDir, `chunk_${idx}`);
  await fs.writeFile(chunkPath, req.file.buffer);
  session.receivedChunks.add(idx);

  res.json({ received: idx, total: session.totalChunks, done: session.receivedChunks.size });
});

adminRoutes.post('/games/upload/complete/:sessionId', async (req, res) => {
  const session = uploadSessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Upload session not found or expired' });
    return;
  }

  if (session.receivedChunks.size < session.totalChunks) {
    res.status(400).json({
      error: `Missing chunks: received ${session.receivedChunks.size}/${session.totalChunks}`,
    });
    return;
  }

  const { title, slug, discId, region, minPlayers, maxPlayers, description } = req.body;
  let tags: string[] = [];
  try { tags = JSON.parse(req.body.tags || '[]'); } catch { tags = Array.isArray(req.body.tags) ? req.body.tags : []; }

  // Build ordered chunk paths
  const chunkPaths: string[] = [];
  for (let i = 0; i < session.totalChunks; i++) {
    chunkPaths.push(path.join(session.tempDir, `chunk_${i}`));
  }

  // Assemble chunks into final ROM
  const { romPath, sizeBytes } = await storageService.saveROMFromChunks(session.filename, chunkPaths);

  // Create game record
  const game = await Game.create({
    title, slug, discId, region, tags,
    minPlayers: parseInt(minPlayers) || 2,
    maxPlayers: parseInt(maxPlayers) || 2,
    description,
    romFilename: session.filename,
    romPath,
    romSizeBytes: sizeBytes,
  });

  // Cleanup temp chunks
  await fs.rm(session.tempDir, { recursive: true, force: true }).catch(() => {});
  uploadSessions.delete(session.id);

  res.json(game);
});

// === TAGS ===

adminRoutes.get('/tags', (_req, res) => {
  res.json(GAME_TAGS);
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
