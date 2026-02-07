import { Schema, model, Document, Types } from 'mongoose';

export interface IKeyProfile {
  name: string;
  isDefault: boolean;
  mapping: Map<string, string>;
}

export interface IUser extends Document {
  username: string;
  passwordHash: string;
  displayName: string;
  role: 'admin' | 'player';
  isActive: boolean;
  lastLogin: Date | null;
  keyProfiles: Types.DocumentArray<IKeyProfile>;
  createdAt: Date;
  updatedAt: Date;
}

const KeyProfileSchema = new Schema({
  name:      { type: String, default: 'Default' },
  isDefault: { type: Boolean, default: false },
  mapping:   {
    type: Map,
    of: String,
    default: () => new Map([
      ['UP', 'ArrowUp'],       ['DOWN', 'ArrowDown'],
      ['LEFT', 'ArrowLeft'],   ['RIGHT', 'ArrowRight'],
      ['CROSS', 'KeyX'],       ['CIRCLE', 'KeyZ'],
      ['SQUARE', 'KeyC'],      ['TRIANGLE', 'KeyV'],
      ['L1', 'KeyQ'],          ['R1', 'KeyE'],
      ['L2', 'KeyA'],          ['R2', 'KeyD'],
      ['START', 'Enter'],      ['SELECT', 'ShiftRight'],
    ])
  }
}, { _id: true });

const UserSchema = new Schema<IUser>({
  username:     { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  displayName:  { type: String, default: '' },
  role:         { type: String, enum: ['admin', 'player'], default: 'player' },
  isActive:     { type: Boolean, default: true },
  lastLogin:    { type: Date, default: null },
  keyProfiles:  { type: [KeyProfileSchema], default: () => [{
    name: 'Default', isDefault: true,
  }]},
}, { timestamps: true });

export const User = model<IUser>('User', UserSchema);
