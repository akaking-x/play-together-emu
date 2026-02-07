import { Router } from 'express';
import { User } from '../models/User.js';

export const keymapsRoutes = Router();

const DEFAULT_MAPPING: Record<string, string> = {
  UP: 'ArrowUp',     DOWN: 'ArrowDown',    LEFT: 'ArrowLeft',  RIGHT: 'ArrowRight',
  CROSS: 'KeyX',     CIRCLE: 'KeyZ',       SQUARE: 'KeyC',     TRIANGLE: 'KeyV',
  L1: 'KeyQ',        R1: 'KeyE',           L2: 'KeyA',         R2: 'KeyD',
  START: 'Enter',    SELECT: 'ShiftRight',
};

// Helper: find a subdocument by _id in the keyProfiles array
function findProfile(keyProfiles: any[], profileId: string) {
  return keyProfiles.find(
    (p: any) => p._id?.toString() === profileId
  ) ?? null;
}

function profileToJSON(p: any) {
  const mapping = p.mapping instanceof Map ? Object.fromEntries(p.mapping) : (p.mapping || {});
  // If mapping is empty, return default
  const finalMapping = Object.keys(mapping).length > 0 ? mapping : DEFAULT_MAPPING;
  return {
    id: p._id,
    name: p.name,
    isDefault: p.isDefault,
    mapping: finalMapping,
  };
}

// GET /api/keymaps - list key profiles for current user
keymapsRoutes.get('/', async (req, res) => {
  const user = await User.findById(req.user!.id).select('keyProfiles');
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const profiles = user.keyProfiles.map((p: any) => profileToJSON(p));
  res.json(profiles);
});

// POST /api/keymaps - create a new key profile
keymapsRoutes.post('/', async (req, res) => {
  const { name, mapping } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Profile name is required' });
    return;
  }

  const user = await User.findById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const newProfile = {
    name,
    isDefault: false,
    mapping: mapping ? new Map(Object.entries(mapping)) : new Map(),
  };
  user.keyProfiles.push(newProfile);
  await user.save();

  const created: any = user.keyProfiles[user.keyProfiles.length - 1];
  res.json(profileToJSON(created));
});

// PUT /api/keymaps/:profileId - update mapping for a profile
keymapsRoutes.put('/:profileId', async (req, res) => {
  const { name, mapping } = req.body;

  const user = await User.findById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const profile = findProfile(user.keyProfiles as any, req.params.profileId);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  if (name !== undefined) profile.name = name;
  if (mapping) profile.mapping = new Map(Object.entries(mapping));

  await user.save();

  res.json(profileToJSON(profile));
});

// DELETE /api/keymaps/:profileId - delete a profile
keymapsRoutes.delete('/:profileId', async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const profile = findProfile(user.keyProfiles as any, req.params.profileId);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  // Don't allow deleting the last profile
  if (user.keyProfiles.length <= 1) {
    res.status(400).json({ error: 'Cannot delete the last profile' });
    return;
  }

  // If deleting the default profile, make another one default
  if (profile.isDefault) {
    const other = (user.keyProfiles as any).find(
      (p: any) => p._id.toString() !== req.params.profileId
    );
    if (other) other.isDefault = true;
  }

  profile.deleteOne();
  await user.save();

  res.json({ success: true });
});

// POST /api/keymaps/:profileId/activate - set profile as default
keymapsRoutes.post('/:profileId/activate', async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const profile = findProfile(user.keyProfiles as any, req.params.profileId);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  // Deactivate all others, activate this one
  for (const p of user.keyProfiles) {
    p.isDefault = false;
  }
  profile.isDefault = true;

  await user.save();

  res.json({ success: true });
});
