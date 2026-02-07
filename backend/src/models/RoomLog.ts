import { Schema, model, Document, Types } from 'mongoose';

// Rooms primarily live in memory (RoomManager)
// This collection is only for history/recovery logging

export interface IRoomLog extends Document {
  roomId: string;
  hostUserId: Types.ObjectId;
  gameId: Types.ObjectId;
  roomName: string;
  maxPlayers: number;
  isPrivate: boolean;
  roomCode: string;
  players: Array<{
    userId: Types.ObjectId;
    displayName: string;
    controllerPort: number;
  }>;
  status: 'waiting' | 'playing' | 'closed';
  createdAt: Date;
  closedAt: Date | null;
}

const RoomLogSchema = new Schema<IRoomLog>({
  roomId:     { type: String, required: true, unique: true },
  hostUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  gameId:     { type: Schema.Types.ObjectId, ref: 'Game' },
  roomName:   { type: String, required: true },
  maxPlayers: { type: Number, required: true },
  isPrivate:  { type: Boolean, default: false },
  roomCode:   { type: String, default: '' },
  players:    [{
    userId: Schema.Types.ObjectId,
    displayName: String,
    controllerPort: Number
  }],
  status:     { type: String, enum: ['waiting', 'playing', 'closed'], default: 'waiting' },
  closedAt:   { type: Date, default: null },
}, { timestamps: true });

// Auto-expire closed rooms after 24h
RoomLogSchema.index({ closedAt: 1 }, { expireAfterSeconds: 86400 });

export const RoomLog = model<IRoomLog>('RoomLog', RoomLogSchema);
