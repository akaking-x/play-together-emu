import dotenv from 'dotenv';
dotenv.config();

export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // MongoDB
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/ps1web',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production-min-32-chars',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // Storage
  STORAGE_TYPE: process.env.STORAGE_TYPE || 'local',
  STORAGE_LOCAL_PATH: process.env.STORAGE_LOCAL_PATH || './storage',

  // S3
  S3_ENDPOINT: process.env.S3_ENDPOINT || '',
  S3_BUCKET: process.env.S3_BUCKET || '',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || '',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || '',

  // TURN/STUN
  STUN_URL: process.env.STUN_URL || 'stun:stun.l.google.com:19302',
  TURN_URL: process.env.TURN_URL || '',
  TURN_USERNAME: process.env.TURN_USERNAME || '',
  TURN_PASSWORD: process.env.TURN_PASSWORD || '',

  // Admin seed
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123456',

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
};
