import { Schema, model, Document } from 'mongoose';

export interface ICheatCode {
  code: string;
  description: string;
}

export interface ISplitScreenCheats {
  splitType: 'horizontal' | 'vertical' | 'quad';
  cheats: {
    player1_fullscreen: ICheatCode[];
    player2_fullscreen: ICheatCode[];
    player3_fullscreen: ICheatCode[];
    player4_fullscreen: ICheatCode[];
  };
  notes: string;
}

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
  splitScreenCheats: ISplitScreenCheats | null;
  coverPath: string;
  description: string;
  isActive: boolean;
  createdAt: Date;
}

const CheatCodeSchema = new Schema({
  code:        { type: String, required: true },
  description: { type: String, default: '' },
}, { _id: false });

const SplitScreenCheatsSchema = new Schema({
  splitType: { type: String, enum: ['horizontal', 'vertical', 'quad'], required: true },
  cheats: {
    player1_fullscreen: { type: [CheatCodeSchema], default: [] },
    player2_fullscreen: { type: [CheatCodeSchema], default: [] },
    player3_fullscreen: { type: [CheatCodeSchema], default: [] },
    player4_fullscreen: { type: [CheatCodeSchema], default: [] },
  },
  notes: { type: String, default: '' },
}, { _id: false });

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
  splitScreenCheats: { type: SplitScreenCheatsSchema, default: null },
  coverPath:      { type: String, default: '' },
  description:    { type: String, default: '' },
  isActive:       { type: Boolean, default: true },
}, { timestamps: true });

export const Game = model<IGame>('Game', GameSchema);
