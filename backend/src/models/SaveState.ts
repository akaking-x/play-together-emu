import { Schema, model, Document, Types } from 'mongoose';

export interface ISaveState extends Document {
  userId: Types.ObjectId;
  gameId: Types.ObjectId;
  slot: number;
  filePath: string;
  fileSize: number;
  label: string;
  screenshotPath: string;
  createdAt: Date;
  updatedAt: Date;
}

const SaveStateSchema = new Schema<ISaveState>({
  userId:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  gameId:         { type: Schema.Types.ObjectId, ref: 'Game', required: true },
  slot:           { type: Number, required: true, min: 0, max: 7 },
  filePath:       { type: String, required: true },
  fileSize:       { type: Number, default: 0 },
  label:          { type: String, default: '' },
  screenshotPath: { type: String, default: '' },
}, { timestamps: true });

// Each user has only 1 save per game per slot
SaveStateSchema.index({ userId: 1, gameId: 1, slot: 1 }, { unique: true });
// Fast query: get all saves for a user for a game
SaveStateSchema.index({ userId: 1, gameId: 1 });

export const SaveState = model<ISaveState>('SaveState', SaveStateSchema);
