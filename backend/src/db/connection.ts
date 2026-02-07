import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { config } from '../config.js';

export async function seedAdmin() {
  const exists = await User.findOne({ role: 'admin' });
  if (exists) return;

  const hash = await bcrypt.hash(config.ADMIN_PASSWORD, 10);
  await User.create({
    username: config.ADMIN_USERNAME,
    passwordHash: hash,
    displayName: 'Administrator',
    role: 'admin',
    isActive: true,
    keyProfiles: [{
      name: 'Default',
      isDefault: true,
      mapping: new Map(),
    }],
  });
  console.log(`Admin created: ${config.ADMIN_USERNAME}`);
}
