import { Router } from 'express';
import { login } from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.js';

export const authRoutes = Router();

// POST /api/auth/login
authRoutes.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const result = await login(username, password);
  if (!result) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  res.json(result);
});

// GET /api/auth/me
authRoutes.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});
