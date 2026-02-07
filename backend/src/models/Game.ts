import { Schema, model, Document } from 'mongoose';

export interface IGame extends Document {
  title: string;
  slug: string;
  discId: string;
  region: 'US' | 'EU' | 'JP';
  genre: string;
  romFilename: string;
  romPath: string;
  romSizeBytes: number;
  minPlayers: number;
  maxPlayers: number;
  hasSplitScreen: boolean;
  coverPath: string;
  description: string;
  isActive: boolean;
  createdAt: Date;
}

const GameSchema = new Schema<IGame>({
  title:          { type: String, required: true },
  slug:           { type: String, required: true, unique: true, index: true },
  discId:         { type: String, default: '' },
  region:         { type: String, enum: ['US', 'EU', 'JP'], default: 'US' },
  genre:          { type: String, default: '' },
  romFilename:    { type: String, required: true },
  romPath:        { type: String, required: true },
  romSizeBytes:   { type: Number, default: 0 },
  minPlayers:     { type: Number, default: 1 },
  maxPlayers:     { type: Number, default: 2, max: 8 },
  hasSplitScreen: { type: Boolean, default: true },
  coverPath:      { type: String, default: '' },
  description:    { type: String, default: '' },
  isActive:       { type: Boolean, default: true },
}, { timestamps: true });

export const Game = model<IGame>('Game', GameSchema);
