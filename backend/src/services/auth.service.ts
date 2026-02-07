import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { config } from '../config.js';

export interface TokenPayload {
  id: string;
  username: string;
  role: string;
  displayName: string;
}

export async function login(username: string, password: string) {
  const user = await User.findOne({ username, isActive: true });
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  user.lastLogin = new Date();
  await user.save();

  const payload: TokenPayload = {
    id: user._id.toString(),
    username: user.username,
    role: user.role,
    displayName: user.displayName,
  };

  const token = jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as unknown as jwt.SignOptions['expiresIn'],
  });
  return { token, user: payload };
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}
