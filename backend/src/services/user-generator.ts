import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { User } from '../models/User.js';

const CHARS_USERNAME = 'abcdefghijklmnopqrstuvwxyz0123456789';
const CHARS_PASSWORD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function random(length: number, charset: string): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, b => charset[b % charset.length]).join('');
}

/** Create 1 user, return plaintext credentials (one-time only) */
export async function createRandomUser(
  displayName: string,
  role: 'admin' | 'player' = 'player',
  customUsername?: string,
  customPassword?: string,
) {
  const username = customUsername?.trim() || random(10, CHARS_USERNAME);
  const password = customPassword || random(10, CHARS_PASSWORD);
  const passwordHash = await bcrypt.hash(password, 10);

  await User.create({
    username,
    passwordHash,
    displayName,
    role,
    keyProfiles: [{ name: 'Default', isDefault: true }],
  });

  return { username, password, displayName };
}

/** Create multiple users at once */
export async function createBatchUsers(count: number, prefix = 'Player') {
  const results: Array<{ username: string; password: string; displayName: string }> = [];

  for (let i = 0; i < count; i++) {
    const displayName = `${prefix} ${i + 1}`;
    const creds = await createRandomUser(displayName);
    results.push(creds);
  }

  return results;
}
