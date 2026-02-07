import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { config } from '../config.js';

export interface IStorageService {
  saveROM(filename: string, data: Buffer): Promise<string>;
  saveROMFromChunks(filename: string, chunkPaths: string[]): Promise<{ romPath: string; sizeBytes: number }>;
  getROMStream(romPath: string): Promise<string>;
  deleteROM(romPath: string): Promise<void>;
  saveSaveState(userId: string, gameId: string, slot: number, data: Buffer): Promise<string>;
  getSaveState(userId: string, gameId: string, slot: number): Promise<Buffer | null>;
  deleteSaveState(userId: string, gameId: string, slot: number): Promise<void>;
}

class LocalStorageService implements IStorageService {
  private base: string;

  constructor() {
    this.base = config.STORAGE_LOCAL_PATH;
  }

  async saveROM(filename: string, data: Buffer) {
    const dir = path.join(this.base, 'roms');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, data);
    return `roms/${filename}`;
  }

  async saveROMFromChunks(filename: string, chunkPaths: string[]) {
    const dir = path.join(this.base, 'roms');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);

    // Stream-concatenate chunks to avoid loading everything into memory
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(filePath);
      let i = 0;
      const next = () => {
        if (i >= chunkPaths.length) { ws.end(); return; }
        const rs = createReadStream(chunkPaths[i++]);
        rs.pipe(ws, { end: false });
        rs.on('end', next);
        rs.on('error', reject);
      };
      ws.on('finish', resolve);
      ws.on('error', reject);
      next();
    });

    const stat = await fs.stat(filePath);
    return { romPath: `roms/${filename}`, sizeBytes: stat.size };
  }

  async getROMStream(romPath: string) {
    return path.join(this.base, romPath);
  }

  async deleteROM(romPath: string) {
    try { await fs.unlink(path.join(this.base, romPath)); } catch { /* ignore */ }
  }

  async saveSaveState(userId: string, gameId: string, slot: number, data: Buffer) {
    const dir = path.join(this.base, 'saves', userId, gameId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `slot_${slot}.state`);
    await fs.writeFile(filePath, data);
    return filePath;
  }

  async getSaveState(userId: string, gameId: string, slot: number) {
    const filePath = path.join(this.base, 'saves', userId, gameId, `slot_${slot}.state`);
    try { return await fs.readFile(filePath); } catch { return null; }
  }

  async deleteSaveState(userId: string, gameId: string, slot: number) {
    const filePath = path.join(this.base, 'saves', userId, gameId, `slot_${slot}.state`);
    try { await fs.unlink(filePath); } catch { /* ignore */ }
  }
}

class S3StorageService implements IStorageService {
  // Implement later with @aws-sdk/client-s3
  // Use getSignedUrl for ROM downloads
  // Use PutObject/GetObject for saves

  async saveROM(filename: string, data: Buffer) { /* TODO */ return ''; }
  async saveROMFromChunks(filename: string, chunkPaths: string[]) { /* TODO */ return { romPath: '', sizeBytes: 0 }; }
  async getROMStream(romPath: string) { /* TODO: signed URL */ return ''; }
  async deleteROM(romPath: string) { /* TODO */ }
  async saveSaveState(userId: string, gameId: string, slot: number, data: Buffer) { /* TODO */ return ''; }
  async getSaveState(userId: string, gameId: string, slot: number) { /* TODO */ return null; }
  async deleteSaveState(userId: string, gameId: string, slot: number) { /* TODO */ }
}

export const storageService: IStorageService =
  config.STORAGE_TYPE === 's3'
    ? new S3StorageService()
    : new LocalStorageService();
