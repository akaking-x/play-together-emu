import { api } from '../api/client';

export interface SaveSlotInfo {
  slot: number;
  label: string | null;
  fileSize: number;
  updatedAt: string | null;
  hasScreenshot: boolean;
}

export class SaveManager {
  /** Fetch all 8 slots for a game (empty slots have label=null) */
  async getSlots(gameId: string): Promise<SaveSlotInfo[]> {
    const res = await api.get<SaveSlotInfo[]>(`/saves/${gameId}`);
    return res.data;
  }

  /** Upload save state data to a slot */
  async save(gameId: string, slot: number, data: Uint8Array, label?: string): Promise<void> {
    const formData = new FormData();
    // slice() creates a copy with its own ArrayBuffer, avoiding sending the
    // entire WASM heap when data is a view into a larger buffer
    formData.append('state', new Blob([data.slice().buffer]), `slot_${slot}.state`);
    if (label !== undefined && label !== '') {
      formData.append('label', label);
    }
    await api.post(`/saves/${gameId}/${slot}`, formData);
  }

  /** Download save state data from a slot */
  async load(gameId: string, slot: number): Promise<Uint8Array> {
    const res = await api.get(`/saves/${gameId}/${slot}`, {
      responseType: 'arraybuffer',
    });
    return new Uint8Array(res.data as ArrayBuffer);
  }

  /** Delete a save slot */
  async delete(gameId: string, slot: number): Promise<void> {
    await api.delete(`/saves/${gameId}/${slot}`);
  }
}

export const saveManager = new SaveManager();
