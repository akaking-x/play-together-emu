# PS1 Web Multiplayer — Bản Thiết Kế Triển Khai (MongoDB)

---

## 1. TỔNG QUAN

### Mục tiêu
- Chơi game PS1 multiplayer realtime trên trình duyệt web
- Admin quản lý users (tạo tài khoản random), quản lý ROM
- Người chơi tạo phòng, chọn game, mời bạn vào chơi (2-8 người tùy game)
- Config mapping phím tùy ý per user
- Save state riêng per user per game, tối đa 8 slots
- ROM lưu trên VPS local (giai đoạn đầu) → S3/R2 (giai đoạn sau)
- Windows dev → Ubuntu production

### Stack công nghệ

| Layer | Công nghệ |
|-------|-----------|
| Frontend | React + Vite + TypeScript + Zustand |
| Emulator | EmulatorJS (Beetle PSX / Mednafen WASM core) |
| Networking | WebRTC DataChannel (P2P) + WebSocket (signaling) |
| Backend | Node.js + Express + TypeScript |
| Database | MongoDB (Mongoose ODM) |
| Auth | JWT (jsonwebtoken + bcrypt) |
| Storage | Local disk → S3-compatible (R2/MinIO) |
| Realtime | ws (WebSocket) cho signaling |

### Kiến trúc tổng thể

```
TRÌNH DUYỆT (mỗi người chơi)
┌───────────────────────────────────────────────────┐
│  React UI ←→ Emulator (WASM) ←→ Input Mapper     │
│       ↕              ↕                            │
│  Signaling      WebRTC P2P  ←──────→  Peer khác  │
│  (WebSocket)    (DataChannel)                     │
└───────┬───────────────────────────────────────────┘
        │ wss://
┌───────▼───────────────────────────────────────────┐
│  BACKEND (Node.js)                                │
│                                                   │
│  ┌──────────┐ ┌───────────┐ ┌──────────────────┐ │
│  │ REST API │ │ Signaling │ │ Static/Storage   │ │
│  │ Auth     │ │ WebSocket │ │ ROM serve        │ │
│  │ Admin    │ │ Room sync │ │ Save states      │ │
│  │ Rooms    │ │ SDP relay │ │                  │ │
│  │ Saves    │ │ ICE relay │ │                  │ │
│  └────┬─────┘ └───────────┘ └────────┬─────────┘ │
│       │                              │            │
│  ┌────▼────┐                  ┌──────▼──────┐    │
│  │ MongoDB │                  │  Filesystem  │    │
│  │         │                  │  hoặc S3     │    │
│  └─────────┘                  └─────────────┘    │
└───────────────────────────────────────────────────┘
```

---

## 2. MONGODB SCHEMAS

### 2.1 User

```typescript
// backend/src/models/User.ts

import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;       // 10 ký tự random, admin tạo
  passwordHash: string;   // bcrypt
  displayName: string;    // tên hiển thị trong game
  role: 'admin' | 'player';
  isActive: boolean;
  lastLogin: Date | null;
  
  // Key mapping — nhúng trực tiếp, không cần collection riêng
  keyProfiles: Array<{
    name: string;         // "Default", "Fighting", ...
    isDefault: boolean;
    mapping: Map<string, string>;  // PS1Button → KeyboardCode
  }>;
  
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
    name: 'Default', isDefault: true, mapping: new Map()
  }]},
}, { timestamps: true });

export const User = model<IUser>('User', UserSchema);
```

### 2.2 Game

```typescript
// backend/src/models/Game.ts

import { Schema, model, Document } from 'mongoose';

export interface IGame extends Document {
  title: string;          // "Chocobo Racing"
  slug: string;           // "chocobo-racing" — dùng cho URL
  discId: string;         // "SLUS-00577" — định danh game
  region: 'US' | 'EU' | 'JP';
  genre: string;
  
  // ROM
  romFilename: string;    // "Chocobo Racing (USA).bin"
  romPath: string;        // đường dẫn trên storage
  romSizeBytes: number;
  
  // Multiplayer config
  minPlayers: number;     // tối thiểu mấy người
  maxPlayers: number;     // tối đa mấy người (2-8)
  hasSplitScreen: boolean;
  
  // Hiển thị
  coverPath: string;      // ảnh cover
  description: string;
  
  isActive: boolean;      // admin ẩn/hiện
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
  minPlayers:     { type: Number, default: 2 },
  maxPlayers:     { type: Number, default: 2, max: 8 },
  hasSplitScreen: { type: Boolean, default: true },
  coverPath:      { type: String, default: '' },
  description:    { type: String, default: '' },
  isActive:       { type: Boolean, default: true },
}, { timestamps: true });

export const Game = model<IGame>('Game', GameSchema);
```

### 2.3 SaveState

```typescript
// backend/src/models/SaveState.ts

import { Schema, model, Document, Types } from 'mongoose';

export interface ISaveState extends Document {
  userId: Types.ObjectId;
  gameId: Types.ObjectId;
  slot: number;           // 0-7 (8 slots)
  filePath: string;       // đường dẫn file .state trên storage
  fileSize: number;
  label: string;          // user tự đặt tên: "Before boss fight"
  screenshotPath: string; // thumbnail nhỏ
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

// Mỗi user chỉ có 1 save per game per slot
SaveStateSchema.index({ userId: 1, gameId: 1, slot: 1 }, { unique: true });
// Query nhanh: lấy tất cả saves của 1 user cho 1 game
SaveStateSchema.index({ userId: 1, gameId: 1 });

export const SaveState = model<ISaveState>('SaveState', SaveStateSchema);
```

### 2.4 Room (persistent log — optional)

```typescript
// backend/src/models/Room.ts

import { Schema, model, Document, Types } from 'mongoose';

// Rooms chủ yếu live trong memory (RoomManager)
// Collection này chỉ để log history + khôi phục khi server restart

export interface IRoomLog extends Document {
  roomId: string;         // nanoid 8 chars
  hostUserId: Types.ObjectId;
  gameId: Types.ObjectId;
  roomName: string;
  maxPlayers: number;
  isPrivate: boolean;
  roomCode: string;       // 6 ký tự, chỉ khi private
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

// Auto-expire rooms đã đóng sau 24h
RoomLogSchema.index({ closedAt: 1 }, { expireAfterSeconds: 86400 });

export const RoomLog = model<IRoomLog>('RoomLog', RoomLogSchema);
```

### Tại sao MongoDB phù hợp?

```
1. Key mappings nhúng trong User → 1 query lấy hết, không cần JOIN
2. Save states query theo { userId, gameId } → compound index nhanh
3. Room logs dùng TTL index → tự xóa, không cần cron
4. Schema linh hoạt → thêm field mới không cần migration
5. Chạy tốt trên cả Windows và Ubuntu, không cần compile
6. Mongoose validation → type-safe ở application level
```

---

## 3. CẤU TRÚC THƯ MỤC

```
ps1-web/
│
├── backend/
│   ├── src/
│   │   ├── index.ts                  # Express + WS server entry
│   │   ├── config.ts                 # dotenv loader
│   │   │
│   │   ├── db/
│   │   │   └── connection.ts         # mongoose.connect + seed admin
│   │   │
│   │   ├── models/                   # Mongoose schemas (mục 2 ở trên)
│   │   │   ├── User.ts
│   │   │   ├── Game.ts
│   │   │   ├── SaveState.ts
│   │   │   └── RoomLog.ts
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.ts               # JWT verify middleware
│   │   │   └── admin.ts              # Role check
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.routes.ts        # POST /login
│   │   │   ├── admin.routes.ts       # CRUD users + games
│   │   │   ├── games.routes.ts       # List, detail, ROM URL
│   │   │   ├── rooms.routes.ts       # Create, list, join
│   │   │   ├── saves.routes.ts       # CRUD save states (8 slots)
│   │   │   └── keymaps.routes.ts     # CRUD key profiles
│   │   │
│   │   ├── services/
│   │   │   ├── auth.service.ts       # Login, hash, JWT
│   │   │   ├── user-generator.ts     # Random username/password
│   │   │   └── storage.service.ts    # File storage abstraction
│   │   │
│   │   └── signaling/
│   │       ├── ws-server.ts          # WebSocket server
│   │       ├── room-manager.ts       # In-memory room state
│   │       └── handlers.ts           # Message handlers
│   │
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   │
│   │   ├── api/
│   │   │   └── client.ts             # Fetch wrapper + JWT header
│   │   │
│   │   ├── stores/
│   │   │   ├── authStore.ts          # Zustand: user, token
│   │   │   └── gameStore.ts          # Zustand: rooms, current game
│   │   │
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── HomePage.tsx          # Grid games
│   │   │   ├── LobbyPage.tsx         # Rooms cho 1 game
│   │   │   ├── RoomPage.tsx          # Phòng chờ + ready
│   │   │   ├── GamePage.tsx          # Chơi game
│   │   │   ├── SavesPage.tsx         # 8 slot saves
│   │   │   ├── SettingsPage.tsx      # Key mapping
│   │   │   └── admin/
│   │   │       ├── Dashboard.tsx
│   │   │       ├── UserManager.tsx
│   │   │       └── GameManager.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── GameCanvas.tsx        # Emulator canvas
│   │   │   ├── GameCard.tsx
│   │   │   ├── RoomCard.tsx
│   │   │   ├── PlayerSlot.tsx
│   │   │   ├── KeyMapper.tsx         # Gán phím interactive
│   │   │   ├── SaveSlotGrid.tsx      # 8 ô save
│   │   │   ├── ConnectionStatus.tsx  # Ping overlay
│   │   │   └── ChatBox.tsx
│   │   │
│   │   ├── emulator/
│   │   │   ├── core.ts              # EmulatorJS wrapper
│   │   │   ├── input-mapper.ts      # Key → PS1 button
│   │   │   └── save-manager.ts      # Save/load ↔ server
│   │   │
│   │   ├── netplay/
│   │   │   ├── signaling.ts         # WS client
│   │   │   ├── peer.ts             # WebRTC P2P
│   │   │   ├── rollback.ts          # Rollback netcode
│   │   │   └── protocol.ts          # Binary input encode/decode
│   │   │
│   │   └── hooks/
│   │       ├── useAuth.ts
│   │       ├── useEmulator.ts
│   │       ├── useNetplay.ts
│   │       └── useRoom.ts
│   │
│   ├── public/
│   │   └── emulator/                 # EmulatorJS WASM core files
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── storage/                          # Gitignored data
│   ├── roms/
│   ├── saves/{userId}/{gameId}/
│   └── covers/
│
├── docker-compose.yml                # MongoDB + backend (production)
├── .gitignore
└── README.md
```

---

## 4. API ROUTES

### 4.1 Config (.env)

```env
PORT=3000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/ps1web

# JWT
JWT_SECRET=random-secret-min-32-chars-here
JWT_EXPIRES_IN=7d

# Storage
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=./storage

# S3 (khi STORAGE_TYPE=s3)
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# TURN/STUN
STUN_URL=stun:stun.l.google.com:19302
TURN_URL=
TURN_USERNAME=
TURN_PASSWORD=

# Admin seed (chỉ dùng lần đầu)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123456
```

### 4.2 REST API

```
AUTH
  POST   /api/auth/login              { username, password } → { token, user }
  GET    /api/auth/me                  → { user } (cần JWT)

ADMIN — cần JWT + role=admin
  POST   /api/admin/users             Tạo 1 user → trả { username, password } plaintext
  POST   /api/admin/users/batch       Tạo N users → trả danh sách credentials
  GET    /api/admin/users             Danh sách users (phân trang)
  PATCH  /api/admin/users/:id         Sửa: reset password, khóa, đổi role, đổi tên
  DELETE /api/admin/users/:id         Xóa user

  POST   /api/admin/games             Thêm game (multipart: ROM file + info)
  GET    /api/admin/games             Tất cả games kể cả ẩn
  PATCH  /api/admin/games/:id         Sửa info game
  DELETE /api/admin/games/:id         Xóa game + ROM

  GET    /api/admin/stats             Online users, active rooms, storage usage

GAMES — cần JWT
  GET    /api/games                   Games đang active (cho người chơi)
  GET    /api/games/:id               Chi tiết 1 game
  GET    /api/games/:id/rom           Serve ROM file (stream) hoặc signed URL (S3)

ROOMS — cần JWT
  POST   /api/rooms                   Tạo phòng { gameId, roomName, maxPlayers, isPrivate }
  GET    /api/rooms?gameId=xxx        Danh sách phòng đang mở
  GET    /api/rooms/:id               Chi tiết phòng
  POST   /api/rooms/:id/join          Vào phòng { roomCode? }
  POST   /api/rooms/:id/leave         Rời phòng
  POST   /api/rooms/:id/start         Bắt đầu (chỉ host, cần tất cả ready)

SAVES — cần JWT
  GET    /api/saves/:gameId           8 slots của user cho game này
  POST   /api/saves/:gameId/:slot     Upload save state (multipart, slot 0-7)
  GET    /api/saves/:gameId/:slot     Download save state file
  DELETE /api/saves/:gameId/:slot     Xóa save

KEYMAPS — cần JWT (dữ liệu nằm trong User document)
  GET    /api/keymaps                 Danh sách profiles của user
  POST   /api/keymaps                 Tạo profile mới
  PUT    /api/keymaps/:profileId      Cập nhật mapping
  DELETE /api/keymaps/:profileId      Xóa profile
  POST   /api/keymaps/:profileId/activate   Đặt làm default
```

### 4.3 WebSocket Signaling

```
Kết nối: ws://server:3000/ws?token=JWT_TOKEN

=== Client → Server ===

{ type: "list-rooms", gameId: string }
{ type: "create-room", gameId, roomName, maxPlayers, isPrivate }
{ type: "join-room", roomId, roomCode? }
{ type: "leave-room" }
{ type: "ready", ready: boolean }
{ type: "start-game" }                     // chỉ host
{ type: "signal", targetId, sdp }          // WebRTC offer/answer
{ type: "ice", targetId, candidate }       // ICE candidate
{ type: "chat", message }

=== Server → Client ===

{ type: "room-updated", room }             // state change trong phòng
{ type: "room-list", rooms }               // danh sách phòng
{ type: "game-starting", room }            // host bấm start
{ type: "signal", fromId, sdp }
{ type: "ice", fromId, candidate }
{ type: "chat", fromId, displayName, message, timestamp }
{ type: "player-disconnected", userId }
{ type: "error", code, message }
```

---

## 5. CODE BACKEND CHI TIẾT

### 5.1 Entry Point + DB Connection

```typescript
// backend/src/index.ts

import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config';
import { seedAdmin } from './db/connection';
import { authRoutes } from './routes/auth.routes';
import { adminRoutes } from './routes/admin.routes';
import { gamesRoutes } from './routes/games.routes';
import { roomsRoutes } from './routes/rooms.routes';
import { savesRoutes } from './routes/saves.routes';
import { keymapsRoutes } from './routes/keymaps.routes';
import { SignalingServer } from './signaling/ws-server';
import { authMiddleware } from './middleware/auth';
import { adminMiddleware } from './middleware/admin';

async function main() {
  // Kết nối MongoDB
  await mongoose.connect(config.MONGO_URI);
  console.log('✅ MongoDB connected');

  // Seed admin account lần đầu
  await seedAdmin();

  const app = express();
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json());

  // Serve static files (ROM, saves, covers) — giai đoạn dev
  if (config.STORAGE_TYPE === 'local') {
    app.use('/storage', authMiddleware, express.static(config.STORAGE_LOCAL_PATH));
  }

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', authMiddleware, adminMiddleware, adminRoutes);
  app.use('/api/games', authMiddleware, gamesRoutes);
  app.use('/api/rooms', authMiddleware, roomsRoutes);
  app.use('/api/saves', authMiddleware, savesRoutes);
  app.use('/api/keymaps', authMiddleware, keymapsRoutes);

  // HTTP + WebSocket server
  const server = http.createServer(app);
  new SignalingServer(server);

  server.listen(config.PORT, () => {
    console.log(`🚀 Server running on http://localhost:${config.PORT}`);
  });
}

main().catch(console.error);
```

```typescript
// backend/src/db/connection.ts

import bcrypt from 'bcrypt';
import { User } from '../models/User';
import { config } from '../config';

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
  console.log(`🔑 Admin created: ${config.ADMIN_USERNAME}`);
}
```

### 5.2 Auth Service + Middleware

```typescript
// backend/src/services/auth.service.ts

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { User, IUser } from '../models/User';
import { config } from '../config';

export interface TokenPayload {
  id: string;
  username: string;
  role: string;
  displayName: string;
}

export async function login(username: string, password: string) {
  const user = await User.findOne({ username, isActive: true });
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  user.lastLogin = new Date();
  await user.save();

  const payload: TokenPayload = {
    id: user._id.toString(),
    username: user.username,
    role: user.role,
    displayName: user.displayName,
  };

  const token = jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
  return { token, user: payload };
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

// backend/src/middleware/auth.ts

import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../services/auth.service';

// Extend Express Request
declare global {
  namespace Express {
    interface Request { user?: TokenPayload; }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token required' });

  const user = verifyToken(header.slice(7));
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  req.user = user;
  next();
}

// backend/src/middleware/admin.ts

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}
```

### 5.3 Admin — Tạo User Ngẫu Nhiên

```typescript
// backend/src/services/user-generator.ts

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { User } from '../models/User';

const CHARS_USERNAME = 'abcdefghijklmnopqrstuvwxyz0123456789';
const CHARS_PASSWORD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function random(length: number, charset: string): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, b => charset[b % charset.length]).join('');
}

/** Tạo 1 user, trả plaintext credentials (1 lần duy nhất) */
export async function createRandomUser(displayName: string, role: 'admin' | 'player' = 'player') {
  const username = random(10, CHARS_USERNAME);
  const password = random(10, CHARS_PASSWORD);
  const passwordHash = await bcrypt.hash(password, 10);

  await User.create({
    username,
    passwordHash,
    displayName,
    role,
    keyProfiles: [{ name: 'Default', isDefault: true, mapping: new Map() }],
  });

  return { username, password, displayName };
}

/** Tạo nhiều user cùng lúc */
export async function createBatchUsers(count: number, prefix = 'Player') {
  const results: Array<{ username: string; password: string; displayName: string }> = [];

  for (let i = 0; i < count; i++) {
    const displayName = `${prefix} ${i + 1}`;
    const creds = await createRandomUser(displayName);
    results.push(creds);
  }

  return results; // Admin nhận danh sách này để phát cho người chơi
}
```

```typescript
// backend/src/routes/admin.routes.ts

import { Router } from 'express';
import { createRandomUser, createBatchUsers } from '../services/user-generator';
import { User } from '../models/User';
import { Game } from '../models/Game';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { storageService } from '../services/storage.service';

export const adminRoutes = Router();
const upload = multer({ storage: multer.memoryStorage() });

// === USER MANAGEMENT ===

adminRoutes.post('/users', async (req, res) => {
  const { displayName = 'Player', role = 'player' } = req.body;
  const creds = await createRandomUser(displayName, role);
  res.json(creds); // { username, password, displayName }
});

adminRoutes.post('/users/batch', async (req, res) => {
  const { count = 10, prefix = 'Player' } = req.body;
  if (count > 100) return res.status(400).json({ error: 'Max 100 users per batch' });
  const users = await createBatchUsers(count, prefix);
  res.json({ users, count: users.length });
});

adminRoutes.get('/users', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const users = await User.find({}, '-passwordHash -keyProfiles')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  const total = await User.countDocuments();
  res.json({ users, total, page, limit });
});

adminRoutes.patch('/users/:id', async (req, res) => {
  const { displayName, role, isActive, resetPassword } = req.body;
  const update: any = {};
  if (displayName !== undefined) update.displayName = displayName;
  if (role !== undefined) update.role = role;
  if (isActive !== undefined) update.isActive = isActive;

  let newPassword: string | null = null;
  if (resetPassword) {
    const crypto = await import('crypto');
    newPassword = Array.from(crypto.randomBytes(10), b =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]
    ).join('');
    update.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  await User.findByIdAndUpdate(req.params.id, update);
  res.json({ success: true, ...(newPassword ? { newPassword } : {}) });
});

adminRoutes.delete('/users/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// === GAME MANAGEMENT ===

adminRoutes.post('/games', upload.single('rom'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ROM file required' });

  const { title, slug, discId, region, genre, minPlayers, maxPlayers, hasSplitScreen, description } = req.body;

  // Lưu ROM file
  const romPath = await storageService.saveROM(req.file.originalname, req.file.buffer);

  const game = await Game.create({
    title, slug, discId, region, genre,
    minPlayers: parseInt(minPlayers) || 2,
    maxPlayers: parseInt(maxPlayers) || 2,
    hasSplitScreen: hasSplitScreen !== 'false',
    description,
    romFilename: req.file.originalname,
    romPath,
    romSizeBytes: req.file.size,
  });

  res.json(game);
});

adminRoutes.patch('/games/:id', async (req, res) => {
  const game = await Game.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(game);
});

adminRoutes.delete('/games/:id', async (req, res) => {
  const game = await Game.findById(req.params.id);
  if (game) {
    await storageService.deleteROM(game.romPath);
    await game.deleteOne();
  }
  res.json({ success: true });
});

// === STATS ===

adminRoutes.get('/stats', async (req, res) => {
  const [totalUsers, activeUsers, totalGames] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ lastLogin: { $gte: new Date(Date.now() - 7 * 86400000) } }),
    Game.countDocuments({ isActive: true }),
  ]);
  res.json({ totalUsers, activeUsers, totalGames });
});
```

### 5.4 Save States Routes

```typescript
// backend/src/routes/saves.routes.ts

import { Router } from 'express';
import multer from 'multer';
import { SaveState } from '../models/SaveState';
import { storageService } from '../services/storage.service';

export const savesRoutes = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

// Lấy tất cả saves của user cho 1 game (8 slots)
savesRoutes.get('/:gameId', async (req, res) => {
  const saves = await SaveState.find({
    userId: req.user!.id,
    gameId: req.params.gameId,
  }).sort({ slot: 1 });

  // Trả đủ 8 slots, slot trống = null
  const slots = Array.from({ length: 8 }, (_, i) => {
    const save = saves.find(s => s.slot === i);
    return save ? {
      slot: i,
      label: save.label,
      fileSize: save.fileSize,
      updatedAt: save.updatedAt,
      hasScreenshot: !!save.screenshotPath,
    } : { slot: i, label: null, fileSize: 0, updatedAt: null, hasScreenshot: false };
  });

  res.json(slots);
});

// Upload save state
savesRoutes.post('/:gameId/:slot', upload.single('state'), async (req, res) => {
  const slot = parseInt(req.params.slot);
  if (slot < 0 || slot > 7) return res.status(400).json({ error: 'Slot must be 0-7' });
  if (!req.file) return res.status(400).json({ error: 'State file required' });

  const userId = req.user!.id;
  const gameId = req.params.gameId;

  // Lưu file
  const filePath = await storageService.saveSaveState(userId, gameId, slot, req.file.buffer);

  // Upsert vào DB
  await SaveState.findOneAndUpdate(
    { userId, gameId, slot },
    {
      filePath,
      fileSize: req.file.size,
      label: req.body.label || '',
      screenshotPath: '', // TODO: extract from emulator
    },
    { upsert: true, new: true }
  );

  res.json({ success: true, slot });
});

// Download save state
savesRoutes.get('/:gameId/:slot', async (req, res) => {
  const save = await SaveState.findOne({
    userId: req.user!.id,
    gameId: req.params.gameId,
    slot: parseInt(req.params.slot),
  });
  if (!save) return res.status(404).json({ error: 'Save not found' });

  const buffer = await storageService.getSaveState(
    req.user!.id, req.params.gameId, parseInt(req.params.slot)
  );
  if (!buffer) return res.status(404).json({ error: 'File not found' });

  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename=slot_${req.params.slot}.state`);
  res.send(buffer);
});

// Xóa save state
savesRoutes.delete('/:gameId/:slot', async (req, res) => {
  const userId = req.user!.id;
  const gameId = req.params.gameId;
  const slot = parseInt(req.params.slot);

  await storageService.deleteSaveState(userId, gameId, slot);
  await SaveState.findOneAndDelete({ userId, gameId, slot });

  res.json({ success: true });
});
```

### 5.5 Storage Service (Local + S3)

```typescript
// backend/src/services/storage.service.ts

import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';

interface IStorageService {
  saveROM(filename: string, data: Buffer): Promise<string>;
  getROMStream(romPath: string): Promise<string>;  // URL hoặc file path
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

  async getROMStream(romPath: string) {
    return path.join(this.base, romPath); // trả absolute path để stream
  }

  async deleteROM(romPath: string) {
    try { await fs.unlink(path.join(this.base, romPath)); } catch {}
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
    try { await fs.unlink(filePath); } catch {}
  }
}

class S3StorageService implements IStorageService {
  // Triển khai sau với @aws-sdk/client-s3
  // Dùng getSignedUrl cho ROM downloads
  // Dùng PutObject/GetObject cho saves
  // Tương tự LocalStorageService nhưng thao tác trên S3 bucket
  
  async saveROM(filename: string, data: Buffer) { /* TODO */ return ''; }
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
```

### 5.6 Signaling WebSocket Server

```typescript
// backend/src/signaling/ws-server.ts

import { WebSocketServer, WebSocket } from 'ws';
import { parse } from 'url';
import { verifyToken, TokenPayload } from '../services/auth.service';
import { RoomManager, LiveRoom } from './room-manager';

interface ConnectedUser {
  ws: WebSocket;
  user: TokenPayload;
  roomId: string | null;
}

export class SignalingServer {
  private wss: WebSocketServer;
  private connections = new Map<string, ConnectedUser>();  // userId → conn
  private rooms = new RoomManager();

  constructor(server: any) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      verifyClient: (info, cb) => {
        const { query } = parse(info.req.url || '', true);
        const user = verifyToken(query.token as string);
        if (!user) return cb(false, 401, 'Unauthorized');
        (info.req as any).user = user;
        cb(true);
      },
    });

    this.wss.on('connection', (ws, req) => {
      const user = (req as any).user as TokenPayload;
      this.onConnect(ws, user);
    });
  }

  private onConnect(ws: WebSocket, user: TokenPayload) {
    // Kick connection cũ
    const old = this.connections.get(user.id);
    if (old) old.ws.close(1000, 'Replaced');

    const conn: ConnectedUser = { ws, user, roomId: null };
    this.connections.set(user.id, conn);

    ws.on('message', (raw) => {
      try {
        this.onMessage(conn, JSON.parse(raw.toString()));
      } catch {
        this.send(ws, { type: 'error', code: 'BAD_MSG', message: 'Invalid JSON' });
      }
    });

    ws.on('close', () => {
      if (conn.roomId) this.leaveRoom(conn);
      this.connections.delete(user.id);
    });
  }

  private onMessage(conn: ConnectedUser, msg: any) {
    switch (msg.type) {
      case 'list-rooms':
        this.send(conn.ws, {
          type: 'room-list',
          rooms: this.rooms.listByGame(msg.gameId),
        });
        break;

      case 'create-room': {
        const room = this.rooms.create({
          hostId: conn.user.id,
          gameId: msg.gameId,
          roomName: msg.roomName,
          maxPlayers: msg.maxPlayers,
          isPrivate: msg.isPrivate || false,
        });
        this.rooms.addPlayer(room.id, conn.user.id, conn.user.displayName, 0);
        conn.roomId = room.id;
        this.send(conn.ws, { type: 'room-updated', room: this.rooms.get(room.id) });
        break;
      }

      case 'join-room': {
        const room = this.rooms.get(msg.roomId);
        if (!room) return this.send(conn.ws, { type: 'error', code: 'NOT_FOUND', message: 'Phòng không tồn tại' });
        if (room.players.length >= room.maxPlayers) return this.send(conn.ws, { type: 'error', code: 'FULL', message: 'Phòng đầy' });
        if (room.isPrivate && msg.roomCode !== room.roomCode) return this.send(conn.ws, { type: 'error', code: 'BAD_CODE', message: 'Sai mã phòng' });

        const port = this.rooms.nextPort(room.id);
        this.rooms.addPlayer(room.id, conn.user.id, conn.user.displayName, port);
        conn.roomId = room.id;
        this.broadcastRoom(room.id);
        break;
      }

      case 'leave-room':
        this.leaveRoom(conn);
        break;

      case 'ready':
        if (conn.roomId) {
          this.rooms.setReady(conn.roomId, conn.user.id, msg.ready);
          this.broadcastRoom(conn.roomId);
        }
        break;

      case 'start-game': {
        if (!conn.roomId) return;
        const room = this.rooms.get(conn.roomId);
        if (!room || room.hostId !== conn.user.id) return;
        const allReady = room.players.every(p => p.userId === room.hostId || p.isReady);
        if (!allReady) return this.send(conn.ws, { type: 'error', code: 'NOT_READY', message: 'Chưa tất cả sẵn sàng' });

        room.status = 'playing';
        this.broadcastToRoom(conn.roomId, { type: 'game-starting', room });
        break;
      }

      // WebRTC signaling relay
      case 'signal': {
        const target = this.connections.get(msg.targetId);
        if (target) this.send(target.ws, { type: 'signal', fromId: conn.user.id, sdp: msg.sdp });
        break;
      }
      case 'ice': {
        const target = this.connections.get(msg.targetId);
        if (target) this.send(target.ws, { type: 'ice', fromId: conn.user.id, candidate: msg.candidate });
        break;
      }

      case 'chat': {
        if (!conn.roomId) return;
        this.broadcastToRoom(conn.roomId, {
          type: 'chat', fromId: conn.user.id,
          displayName: conn.user.displayName,
          message: msg.message,
          timestamp: Date.now(),
        });
        break;
      }
    }
  }

  private leaveRoom(conn: ConnectedUser) {
    if (!conn.roomId) return;
    const roomId = conn.roomId;
    this.rooms.removePlayer(roomId, conn.user.id);
    conn.roomId = null;

    const room = this.rooms.get(roomId);
    if (!room || room.players.length === 0) {
      this.rooms.delete(roomId);
    } else {
      this.broadcastToRoom(roomId, { type: 'player-disconnected', userId: conn.user.id });
      this.broadcastRoom(roomId);
    }
  }

  private broadcastRoom(roomId: string) {
    this.broadcastToRoom(roomId, { type: 'room-updated', room: this.rooms.get(roomId) });
  }

  private broadcastToRoom(roomId: string, msg: any) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const p of room.players) {
      const conn = this.connections.get(p.userId);
      if (conn) this.send(conn.ws, msg);
    }
  }

  private send(ws: WebSocket, msg: any) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
}
```

```typescript
// backend/src/signaling/room-manager.ts

import { nanoid } from 'nanoid';

export interface LivePlayer {
  userId: string;
  displayName: string;
  controllerPort: number;
  isReady: boolean;
}

export interface LiveRoom {
  id: string;
  hostId: string;
  gameId: string;
  roomName: string;
  maxPlayers: number;
  isPrivate: boolean;
  roomCode: string;
  players: LivePlayer[];
  status: 'waiting' | 'playing' | 'closed';
  createdAt: number;
}

export class RoomManager {
  private rooms = new Map<string, LiveRoom>();

  create(opts: { hostId: string; gameId: string; roomName: string; maxPlayers: number; isPrivate: boolean }): LiveRoom {
    const room: LiveRoom = {
      id: nanoid(8),
      hostId: opts.hostId,
      gameId: opts.gameId,
      roomName: opts.roomName,
      maxPlayers: Math.min(opts.maxPlayers, 8),
      isPrivate: opts.isPrivate,
      roomCode: opts.isPrivate ? nanoid(6).toUpperCase() : '',
      players: [],
      status: 'waiting',
      createdAt: Date.now(),
    };
    this.rooms.set(room.id, room);
    return room;
  }

  get(id: string) { return this.rooms.get(id) || null; }

  listByGame(gameId: string) {
    return [...this.rooms.values()].filter(r => r.gameId === gameId && r.status === 'waiting');
  }

  addPlayer(roomId: string, userId: string, displayName: string, port: number) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.players.find(p => p.userId === userId)) return; // đã trong phòng
    room.players.push({ userId, displayName, controllerPort: port, isReady: false });
  }

  removePlayer(roomId: string, userId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter(p => p.userId !== userId);
    // Nếu host rời → chuyển host
    if (room.hostId === userId && room.players.length > 0) {
      room.hostId = room.players[0].userId;
    }
  }

  setReady(roomId: string, userId: string, ready: boolean) {
    const room = this.rooms.get(roomId);
    const player = room?.players.find(p => p.userId === userId);
    if (player) player.isReady = ready;
  }

  nextPort(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    const usedPorts = new Set(room.players.map(p => p.controllerPort));
    for (let i = 0; i < 8; i++) {
      if (!usedPorts.has(i)) return i;
    }
    return 0;
  }

  delete(roomId: string) { this.rooms.delete(roomId); }
}
```

---

## 6. CODE FRONTEND CHI TIẾT

### 6.1 Input Mapper — PS1 Buttons

```typescript
// frontend/src/emulator/input-mapper.ts

export enum PS1Button {
  UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3,
  CROSS = 4, CIRCLE = 5, SQUARE = 6, TRIANGLE = 7,
  L1 = 8, R1 = 9, L2 = 10, R2 = 11,
  START = 12, SELECT = 13,
}

export interface PS1Input {
  buttons: number;    // 16-bit bitmask
  analogLX: number;   // -128..127
  analogLY: number;
}

export const DEFAULT_KEYMAP: Record<string, string> = {
  UP: 'ArrowUp',     DOWN: 'ArrowDown',    LEFT: 'ArrowLeft',  RIGHT: 'ArrowRight',
  CROSS: 'KeyX',     CIRCLE: 'KeyZ',       SQUARE: 'KeyC',     TRIANGLE: 'KeyV',
  L1: 'KeyQ',        R1: 'KeyE',           L2: 'KeyA',         R2: 'KeyD',
  START: 'Enter',    SELECT: 'ShiftRight',
};

export class InputMapper {
  private pressed = new Set<string>();
  private keyMap: Record<string, string>;
  private reverseMap: Record<string, PS1Button>;  // keyCode → button

  constructor(keyMap: Record<string, string> = DEFAULT_KEYMAP) {
    this.keyMap = keyMap;
    this.reverseMap = this.buildReverse();
    this.bind();
  }

  private buildReverse(): Record<string, PS1Button> {
    const map: Record<string, PS1Button> = {};
    for (const [btnName, keyCode] of Object.entries(this.keyMap)) {
      const btnEnum = PS1Button[btnName as keyof typeof PS1Button];
      if (btnEnum !== undefined) map[keyCode] = btnEnum;
    }
    return map;
  }

  private bind() {
    window.addEventListener('keydown', (e) => {
      if (this.reverseMap[e.code] !== undefined) {
        this.pressed.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
  }

  /** Gọi mỗi frame (60Hz) — trả input compact */
  poll(): PS1Input {
    let buttons = 0;
    for (const code of this.pressed) {
      const btn = this.reverseMap[code];
      if (btn !== undefined) buttons |= (1 << btn);
    }
    // Gamepad support
    const gp = navigator.getGamepads?.()?.[0];
    if (gp) {
      if (gp.buttons[12]?.pressed) buttons |= (1 << PS1Button.UP);
      if (gp.buttons[13]?.pressed) buttons |= (1 << PS1Button.DOWN);
      if (gp.buttons[14]?.pressed) buttons |= (1 << PS1Button.LEFT);
      if (gp.buttons[15]?.pressed) buttons |= (1 << PS1Button.RIGHT);
      if (gp.buttons[0]?.pressed)  buttons |= (1 << PS1Button.CROSS);
      if (gp.buttons[1]?.pressed)  buttons |= (1 << PS1Button.CIRCLE);
      if (gp.buttons[2]?.pressed)  buttons |= (1 << PS1Button.SQUARE);
      if (gp.buttons[3]?.pressed)  buttons |= (1 << PS1Button.TRIANGLE);
      if (gp.buttons[4]?.pressed)  buttons |= (1 << PS1Button.L1);
      if (gp.buttons[5]?.pressed)  buttons |= (1 << PS1Button.R1);
      if (gp.buttons[6]?.pressed)  buttons |= (1 << PS1Button.L2);
      if (gp.buttons[7]?.pressed)  buttons |= (1 << PS1Button.R2);
      if (gp.buttons[9]?.pressed)  buttons |= (1 << PS1Button.START);
      if (gp.buttons[8]?.pressed)  buttons |= (1 << PS1Button.SELECT);
    }
    return { buttons, analogLX: 0, analogLY: 0 };
  }

  updateKeyMap(newMap: Record<string, string>) {
    this.keyMap = newMap;
    this.reverseMap = this.buildReverse();
  }

  destroy() { this.pressed.clear(); }
}

// Binary protocol: 8 bytes per input packet
// [frame:u32][buttons:u16][analogLX:i8][analogLY:i8]
export function encodeInput(frame: number, input: PS1Input): ArrayBuffer {
  const buf = new ArrayBuffer(8);
  const v = new DataView(buf);
  v.setUint32(0, frame, true);
  v.setUint16(4, input.buttons, true);
  v.setInt8(6, input.analogLX);
  v.setInt8(7, input.analogLY);
  return buf;
}

export function decodeInput(buf: ArrayBuffer): { frame: number; input: PS1Input } {
  const v = new DataView(buf);
  return {
    frame: v.getUint32(0, true),
    input: { buttons: v.getUint16(4, true), analogLX: v.getInt8(6), analogLY: v.getInt8(7) },
  };
}
```

### 6.2 WebRTC Peer Connection

```typescript
// frontend/src/netplay/peer.ts

export type PeerState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export class PeerConnection {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  
  state: PeerState = 'new';
  latencyMs = 0;

  constructor(
    public readonly peerId: string,
    private iceServers: RTCIceServer[],
    private onState: (s: PeerState) => void,
    private onData: (data: ArrayBuffer) => void,
    private onLatency: (ms: number) => void,
  ) {
    this.pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 2 });
    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') this.setState('connected');
      else if (s === 'disconnected') this.setState('disconnected');
      else if (s === 'failed') this.setState('failed');
    };
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dc = this.pc.createDataChannel('game', { ordered: true, maxRetransmits: 2 });
    this.setupDC(this.dc);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.pc.ondatachannel = (e) => { this.dc = e.channel; this.setupDC(this.dc); };
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(answer);
  }

  async addICE(candidate: RTCIceCandidateInit) {
    await this.pc.addIceCandidate(candidate);
  }

  onICE(cb: (c: RTCIceCandidate) => void) {
    this.pc.onicecandidate = (e) => { if (e.candidate) cb(e.candidate); };
  }

  send(data: ArrayBuffer): boolean {
    if (this.dc?.readyState !== 'open') return false;
    this.dc.send(data);
    return true;
  }

  private setupDC(dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => { this.setState('connected'); this.startPing(); };
    dc.onclose = () => this.setState('disconnected');
    dc.onmessage = (e) => {
      const d = e.data as ArrayBuffer;
      const marker = new Uint8Array(d)[0];
      if (marker === 0xFF || marker === 0xFE) { this.handlePing(d); return; }
      this.onData(d);
    };
  }

  private startPing() {
    this.pingTimer = setInterval(() => {
      if (this.dc?.readyState !== 'open') return;
      const buf = new ArrayBuffer(9);
      const v = new DataView(buf);
      v.setUint8(0, 0xFF);
      v.setFloat64(1, performance.now(), true);
      this.dc.send(buf);
    }, 1000);
  }

  private handlePing(data: ArrayBuffer) {
    const v = new DataView(data);
    if (v.getUint8(0) === 0xFF) {
      // Ping → trả pong
      const buf = new ArrayBuffer(9);
      const pv = new DataView(buf);
      pv.setUint8(0, 0xFE);
      pv.setFloat64(1, v.getFloat64(1, true), true);
      this.dc!.send(buf);
    } else {
      // Pong → tính latency
      this.latencyMs = Math.round((performance.now() - v.getFloat64(1, true)) / 2);
      this.onLatency(this.latencyMs);
    }
  }

  private setState(s: PeerState) {
    if (this.state === s) return;
    this.state = s;
    this.onState(s);
  }

  destroy() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.dc?.close();
    this.pc.close();
  }
}
```

### 6.3 Key Mapper UI Component

```tsx
// frontend/src/components/KeyMapper.tsx

import { useState, useEffect, useCallback } from 'react';

const PS1_BUTTONS = [
  { key: 'UP',    label: '↑ Up',    group: 'D-Pad' },
  { key: 'DOWN',  label: '↓ Down',  group: 'D-Pad' },
  { key: 'LEFT',  label: '← Left',  group: 'D-Pad' },
  { key: 'RIGHT', label: '→ Right', group: 'D-Pad' },
  { key: 'CROSS',    label: '✕ Cross',    group: 'Face' },
  { key: 'CIRCLE',   label: '○ Circle',   group: 'Face' },
  { key: 'SQUARE',   label: '□ Square',   group: 'Face' },
  { key: 'TRIANGLE', label: '△ Triangle', group: 'Face' },
  { key: 'L1', label: 'L1', group: 'Shoulder' },
  { key: 'R1', label: 'R1', group: 'Shoulder' },
  { key: 'L2', label: 'L2', group: 'Shoulder' },
  { key: 'R2', label: 'R2', group: 'Shoulder' },
  { key: 'START',  label: 'Start',  group: 'System' },
  { key: 'SELECT', label: 'Select', group: 'System' },
];

interface Props {
  mapping: Record<string, string>;
  onSave: (mapping: Record<string, string>) => void;
}

export function KeyMapper({ mapping, onSave }: Props) {
  const [current, setCurrent] = useState(mapping);
  const [listening, setListening] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      // Xóa phím trùng
      const updated = { ...current };
      for (const [btn, code] of Object.entries(updated)) {
        if (code === e.code && btn !== listening) updated[btn] = '';
      }
      updated[listening] = e.code;
      setCurrent(updated);
      setListening(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [listening, current]);

  const formatKey = (code: string) =>
    !code ? '—' : code.replace('Key', '').replace('Arrow', '').replace('Shift', '⇧ ');

  return (
    <div style={{ maxWidth: 500 }}>
      {['D-Pad', 'Face', 'Shoulder', 'System'].map(group => (
        <div key={group} style={{ marginBottom: 16 }}>
          <h4>{group}</h4>
          {PS1_BUTTONS.filter(b => b.group === group).map(btn => (
            <div key={btn.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{btn.label}</span>
              <button
                onClick={() => setListening(btn.key)}
                style={{
                  minWidth: 120,
                  background: listening === btn.key ? '#ff6b35' : '#333',
                  color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 4, cursor: 'pointer'
                }}
              >
                {listening === btn.key ? '⌨ Nhấn phím...' : formatKey(current[btn.key])}
              </button>
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={() => onSave(current)}>💾 Lưu</button>
        <button onClick={() => setCurrent(mapping)}>↩ Hủy</button>
      </div>
    </div>
  );
}
```

### 6.4 Save Slot Grid Component

```tsx
// frontend/src/components/SaveSlotGrid.tsx

import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface SlotInfo {
  slot: number;
  label: string | null;
  fileSize: number;
  updatedAt: string | null;
  hasScreenshot: boolean;
}

interface Props {
  gameId: string;
  onLoad: (slot: number) => void;   // load save vào emulator
  onSave: (slot: number) => void;   // save từ emulator
}

export function SaveSlotGrid({ gameId, onLoad, onSave }: Props) {
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/saves/${gameId}`).then(res => { setSlots(res.data); setLoading(false); });
  }, [gameId]);

  const formatSize = (bytes: number) =>
    bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleString('vi-VN') : '';

  if (loading) return <div>Đang tải...</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {slots.map(slot => (
        <div key={slot.slot} style={{
          border: '1px solid #444', borderRadius: 8, padding: 12,
          background: slot.label ? '#1a1a2e' : '#111',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
            Slot {slot.slot + 1}
          </div>

          {slot.label ? (
            <>
              <div style={{ fontSize: 12, color: '#aaa' }}>{slot.label || 'No label'}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{formatSize(slot.fileSize)}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{formatDate(slot.updatedAt)}</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <button onClick={() => onLoad(slot.slot)} title="Load">▶ Load</button>
                <button onClick={() => onSave(slot.slot)} title="Overwrite">💾 Save</button>
                <button onClick={() => handleDelete(slot.slot)} title="Delete">🗑</button>
              </div>
            </>
          ) : (
            <button onClick={() => onSave(slot.slot)} style={{ marginTop: 8 }}>
              💾 Save vào slot này
            </button>
          )}
        </div>
      ))}
    </div>
  );

  async function handleDelete(slot: number) {
    if (!confirm('Xóa save state này?')) return;
    await api.delete(`/saves/${gameId}/${slot}`);
    setSlots(prev => prev.map(s => s.slot === slot
      ? { slot, label: null, fileSize: 0, updatedAt: null, hasScreenshot: false }
      : s
    ));
  }
}
```

---

## 7. FLOW HOẠT ĐỘNG

### 7.1 Flow Tổng Thể

```
ADMIN SETUP:
  Admin đăng nhập → Thêm games (upload ROM) → Tạo accounts cho người chơi

NGƯỜI CHƠI:
  Đăng nhập (username + password admin cấp)
  → Trang chủ: grid games
  → Chọn game → Xem lobby (danh sách phòng)
  → Tạo phòng (đặt tên, max players, private?) HOẶC Vào phòng có sẵn
  → Trong phòng: chờ đủ người, bấm Ready
  → Host bấm Start → Tất cả load emulator + ROM
  → WebRTC P2P connect giữa các players
  → Chơi game realtime
```

### 7.2 Flow Tạo Phòng & Chơi Game

```
Player A (Host)                    Server                     Player B (Client)
      │                              │                              │
      ├─ create-room ───────────────►│                              │
      │◄─ room-updated ─────────────┤                              │
      │                              │                              │
      │                              │◄──── join-room ──────────────┤
      │◄─ room-updated ─────────────┤─── room-updated ────────────►│
      │                              │                              │
      ├─ ready: true ───────────────►│                              │
      │                              │◄──── ready: true ────────────┤
      │◄─ room-updated ─────────────┤─── room-updated ────────────►│
      │                              │                              │
      ├─ start-game ────────────────►│                              │
      │◄─ game-starting ────────────┤─── game-starting ───────────►│
      │                              │                              │
      │  ┌─── Load emulator + ROM ──────── Load emulator + ROM ──┐ │
      │  │                                                        │ │
      ├──┼─ signal (SDP offer) ─────►│                            │ │
      │  │                           ├── signal (SDP offer) ─────►│ │
      │  │                           │◄── signal (SDP answer) ────┤ │
      │◄─┼── signal (SDP answer) ───┤                            │ │
      │  │                           │                            │ │
      │  │  ◄═══ WebRTC P2P Connected (DataChannel) ═══►         │ │
      │  │                                                        │ │
      │  │  Mỗi frame (60fps):                                   │ │
      │  │  A gửi input → B                                      │ │
      │  │  B gửi input → A                                      │ │
      │  │  Cả 2 chạy emulator đồng bộ                          │ │
      │  └────────────────────────────────────────────────────────┘ │
```

### 7.3 Flow Save State

```
Người chơi đang chơi game
  → Bấm nút Save (hoặc phím tắt)
  → Emulator tạo save state (binary data ~500KB-2MB)
  → Chọn slot (0-7) 
  → Frontend POST /api/saves/{gameId}/{slot} (multipart upload)
  → Backend lưu file vào storage/{userId}/{gameId}/slot_X.state
  → Backend upsert record trong MongoDB SaveState collection
  → Frontend cập nhật UI slot grid

Người chơi muốn load save:
  → Chọn slot có dữ liệu
  → Frontend GET /api/saves/{gameId}/{slot} (download binary)
  → Emulator loadState(binary)
  → Tiếp tục chơi từ điểm đã save
```

---

## 8. TRIỂN KHAI

### 8.1 Giai Đoạn 1 — Windows Dev

```bash
# Prerequisites
- Node.js 20+
- MongoDB Community Server (hoặc MongoDB Atlas free tier)
- Git

# Setup
cd ps1-web
npm install                  # root dependencies
cd backend && npm install
cd ../frontend && npm install

# Chạy MongoDB local
# (MongoDB Community tải từ mongodb.com, cài như Windows app)
# Default: mongodb://localhost:27017

# Backend
cd backend
cp .env.example .env         # sửa MONGO_URI, JWT_SECRET
npm run dev                  # nodemon + ts-node

# Frontend  
cd frontend
npm run dev                  # vite dev server (port 5173)

# Tạo folder storage
mkdir -p storage/roms storage/saves storage/covers
```

### 8.2 Giai Đoạn 2 — Ubuntu Production

```bash
# VPS Ubuntu 22.04+

# Cài MongoDB
sudo apt install -y gnupg curl
# (theo hướng dẫn mongodb.com cho Ubuntu)

# Cài Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone & build
git clone <repo> /opt/ps1-web
cd /opt/ps1-web/backend && npm ci && npm run build
cd /opt/ps1-web/frontend && npm ci && npm run build

# Dùng PM2 chạy backend
npm install -g pm2
pm2 start /opt/ps1-web/backend/dist/index.js --name ps1-backend

# Nginx reverse proxy
# - game.domain.com → frontend (static files)
# - game.domain.com/api → backend:3000
# - game.domain.com/ws → backend:3000 (WebSocket upgrade)
```

```nginx
# /etc/nginx/sites-available/ps1-web

server {
    listen 443 ssl http2;
    server_name game.yourdomain.com;

    # SSL cert (Let's Encrypt)
    ssl_certificate     /etc/letsencrypt/live/game.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/game.yourdomain.com/privkey.pem;

    # QUAN TRỌNG: Headers cho SharedArrayBuffer (emulator cần)
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;

    # Frontend static
    root /opt/ps1-web/frontend/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket signaling
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

### 8.3 docker-compose.yml (Optional)

```yaml
version: '3.8'

services:
  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    environment:
      MONGO_INITDB_DATABASE: ps1web

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      MONGO_URI: mongodb://mongo:27017/ps1web
      JWT_SECRET: ${JWT_SECRET}
      STORAGE_TYPE: local
      STORAGE_LOCAL_PATH: /data/storage
    volumes:
      - ./storage:/data/storage
    depends_on:
      - mongo

  frontend:
    build: ./frontend
    ports:
      - "80:80"

volumes:
  mongo-data:
```

---

## 9. PACKAGES CẦN CÀI

### Backend (package.json)

```json
{
  "dependencies": {
    "express": "^4.21",
    "cors": "^2.8",
    "mongoose": "^8.9",
    "jsonwebtoken": "^9.0",
    "bcrypt": "^5.1",
    "ws": "^8.18",
    "multer": "^1.4",
    "nanoid": "^5.0",
    "dotenv": "^16.4",
    "@aws-sdk/client-s3": "^3.700",
    "@aws-sdk/s3-request-presigner": "^3.700"
  },
  "devDependencies": {
    "typescript": "^5.6",
    "@types/express": "^5",
    "@types/ws": "^8",
    "@types/bcrypt": "^5",
    "@types/jsonwebtoken": "^9",
    "@types/multer": "^1",
    "tsx": "^4",
    "nodemon": "^3"
  }
}
```

### Frontend (package.json)

```json
{
  "dependencies": {
    "react": "^18.3",
    "react-dom": "^18.3",
    "react-router-dom": "^6.28",
    "zustand": "^5",
    "axios": "^1.7"
  },
  "devDependencies": {
    "vite": "^6",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5.6",
    "@types/react": "^18",
    "@types/react-dom": "^18"
  }
}
```

---

## 10. THỨ TỰ TRIỂN KHAI (ROADMAP)

```
SPRINT 1 — Nền tảng (1-2 tuần)
  ✅ Setup monorepo, MongoDB, Express, Vite
  ✅ Models: User, Game, SaveState
  ✅ Auth: login, JWT middleware
  ✅ Admin: CRUD users (random creds), CRUD games (upload ROM)
  ✅ Frontend: Login page, Admin dashboard

SPRINT 2 — Game Loading (1 tuần)
  ✅ Tích hợp EmulatorJS (Beetle PSX core)
  ✅ Serve ROM từ backend → load vào emulator
  ✅ Input mapper + key config UI
  ✅ Save/load state (8 slots per game per user)
  ✅ Frontend: Home page (game grid), Game page (canvas)

SPRINT 3 — Multiplayer Lobby (1 tuần)
  ✅ WebSocket signaling server
  ✅ Room manager (tạo/vào/rời phòng)
  ✅ Frontend: Lobby page, Room page, ready system
  ✅ Chat trong phòng

SPRINT 4 — Realtime P2P (2 tuần)
  ✅ WebRTC peer connection
  ✅ Input sync binary protocol
  ✅ Rollback netcode engine
  ✅ Ping/latency display
  ✅ Test với 2 players trên LAN

SPRINT 5 — Polish & Deploy (1 tuần)
  ✅ TURN server (coturn) cho NAT traversal
  ✅ Ubuntu deployment + Nginx + SSL
  ✅ COOP/COEP headers
  ✅ S3 storage option
  ✅ Test internet thực tế

SPRINT 6 — Nâng cao (tùy chọn)
  - Full-screen mode (crop split screen)
  - Spectator mode
  - Game-specific patches
  - Mobile touch controls
  - Leaderboard / stats
```
