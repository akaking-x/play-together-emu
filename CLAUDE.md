# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PS1 Web Multiplayer — a browser-based PS1 multiplayer gaming platform. Players can play PS1 games together in real-time via WebRTC P2P connections, with an admin system for managing users and ROMs. The design document is in Vietnamese (`ps1-web-multiplayer-design.md`).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + Zustand |
| Emulator | EmulatorJS (Beetle PSX / Mednafen WASM core) |
| Networking | WebRTC DataChannel (P2P) + WebSocket (signaling) |
| Backend | Node.js + Express + TypeScript |
| Database | MongoDB (Mongoose ODM) |
| Auth | JWT (jsonwebtoken + bcrypt) |
| Storage | Local disk → S3-compatible (R2/MinIO) |
| Realtime | ws (WebSocket) for signaling |

## Build & Development Commands

```bash
# Install dependencies
cd backend && npm install
cd frontend && npm install

# Development
cd backend && npm run dev       # nodemon + ts-node on port 3000
cd frontend && npm run dev      # vite dev server on port 5173

# Production build
cd backend && npm ci && npm run build
cd frontend && npm ci && npm run build

# MongoDB must be running locally (default: mongodb://localhost:27017)
# Backend needs .env file — copy from .env.example
```

## Architecture

### Monorepo Structure: `backend/` and `frontend/` as separate npm packages

**Backend** (`backend/src/`):
- `index.ts` — Express + HTTP + WebSocket server entry point
- `config.ts` — dotenv loader for all environment variables
- `db/connection.ts` — Mongoose connection + admin seed on first run
- `models/` — Mongoose schemas: User, Game, SaveState, RoomLog
- `middleware/auth.ts` — JWT verification (extends `req.user`), `middleware/admin.ts` — role check
- `routes/` — REST endpoints: auth, admin, games, rooms, saves, keymaps
- `services/storage.service.ts` — Abstraction over local filesystem and S3 (implements `IStorageService`)
- `signaling/ws-server.ts` — WebSocket server at `/ws`, authenticates via `?token=JWT` query param
- `signaling/room-manager.ts` — In-memory room state (rooms are NOT primarily stored in MongoDB)

**Frontend** (`frontend/src/`):
- `stores/` — Zustand stores: authStore (user/token), gameStore (rooms/current game)
- `pages/` — Route pages: Login, Home (game grid), Lobby, Room, Game, Saves, Settings, admin/*
- `emulator/core.ts` — EmulatorJS WASM wrapper
- `emulator/input-mapper.ts` — Keyboard/gamepad → PS1 button bitmask (16-bit), polled at 60Hz
- `netplay/peer.ts` — WebRTC PeerConnection with DataChannel, ping/pong latency measurement
- `netplay/signaling.ts` — WebSocket client for room signaling
- `netplay/protocol.ts` — Binary input encoding: 8 bytes per frame `[frame:u32][buttons:u16][analogLX:i8][analogLY:i8]`
- `netplay/rollback.ts` — Rollback netcode engine
- `api/client.ts` — Fetch/axios wrapper with JWT Authorization header

### Key Design Decisions

- **Rooms live in memory** (`RoomManager`), not MongoDB. `RoomLog` collection is only for history/recovery. Closed room logs auto-expire via TTL index (24h).
- **Key mappings are embedded** in the User document (not a separate collection) — each user has an array of `keyProfiles` with a `Map<string, string>` for PS1Button→KeyboardCode.
- **Save states**: 8 slots per user per game, enforced by compound unique index `{userId, gameId, slot}`. Binary files stored on filesystem/S3, metadata in MongoDB.
- **WebRTC signaling flow**: Client connects to `/ws?token=JWT` → create/join room → when game starts, peers exchange SDP offers/answers and ICE candidates through the server → establish P2P DataChannel for game input.
- **Ping protocol on DataChannel**: marker byte `0xFF` = ping, `0xFE` = pong, followed by 8-byte float64 timestamp.
- **Storage abstraction**: `LocalStorageService` and `S3StorageService` implement `IStorageService`. Selected by `STORAGE_TYPE` env var.
- **Admin creates accounts**: usernames are 10 random chars, passwords are 10 random chars. Players cannot self-register.

### Important Production Headers

Nginx must set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for SharedArrayBuffer (required by the WASM emulator).

## Environment Variables

Backend requires `.env` with: `PORT`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `STORAGE_TYPE`, `STORAGE_LOCAL_PATH`, `STUN_URL`, `TURN_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. See `.env.example`.

## Language

The design document and UI strings are in Vietnamese. Code identifiers, comments in code, and API field names are in English.
