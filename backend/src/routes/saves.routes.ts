import { Router } from 'express';
import multer from 'multer';
import { SaveState } from '../models/SaveState.js';
import { storageService } from '../services/storage.service.js';

export const savesRoutes = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/saves/:gameId - 8 slots for user for this game
savesRoutes.get('/:gameId', async (req, res) => {
  const saves = await SaveState.find({
    userId: req.user!.id,
    gameId: req.params.gameId,
  }).sort({ slot: 1 });

  // Return all 8 slots, empty slots = null label
  const slots = Array.from({ length: 8 }, (_, i) => {
    const save = saves.find(s => s.slot === i);
    return save ? {
      slot: i,
      label: save.label,
      fileSize: save.fileSize,
      updatedAt: save.updatedAt,
      hasScreenshot: !!save.screenshotPath,
    } : { slot: i, label: null, fileSize: 0, updatedAt: null, hasScreenshot: false };
  });

  res.json(slots);
});

// POST /api/saves/:gameId/:slot - upload save state
savesRoutes.post('/:gameId/:slot', upload.single('state'), async (req, res) => {
  const slot = parseInt(req.params.slot as string);
  if (slot < 0 || slot > 7) {
    res.status(400).json({ error: 'Slot must be 0-7' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'State file required' });
    return;
  }

  const userId = req.user!.id;
  const gameId = req.params.gameId as string;

  // Save file to storage
  const filePath = await storageService.saveSaveState(userId, gameId, slot, req.file.buffer);

  // Upsert DB record
  await SaveState.findOneAndUpdate(
    { userId, gameId, slot },
    {
      filePath,
      fileSize: req.file.size,
      label: req.body.label || '',
      screenshotPath: '',
    },
    { upsert: true, new: true }
  );

  res.json({ success: true, slot });
});

// GET /api/saves/:gameId/:slot - download save state
savesRoutes.get('/:gameId/:slot', async (req, res) => {
  const save = await SaveState.findOne({
    userId: req.user!.id,
    gameId: req.params.gameId,
    slot: parseInt(req.params.slot),
  });
  if (!save) {
    res.status(404).json({ error: 'Save not found' });
    return;
  }

  const buffer = await storageService.getSaveState(
    req.user!.id, req.params.gameId, parseInt(req.params.slot)
  );
  if (!buffer) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename=slot_${req.params.slot}.state`);
  res.send(buffer);
});

// DELETE /api/saves/:gameId/:slot - delete save state
savesRoutes.delete('/:gameId/:slot', async (req, res) => {
  const userId = req.user!.id;
  const gameId = req.params.gameId;
  const slot = parseInt(req.params.slot);

  await storageService.deleteSaveState(userId, gameId, slot);
  await SaveState.findOneAndDelete({ userId, gameId, slot });

  res.json({ success: true });
});
