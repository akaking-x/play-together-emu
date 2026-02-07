# Play Together Emu

Browser-based PS1 multiplayer gaming platform. Play PS1 games together in real-time via WebRTC P2P connections.

## Features

- **PS1 Emulation** — EmulatorJS (Beetle PSX / Mednafen WASM core) runs directly in the browser
- **Online Multiplayer** — WebRTC DataChannel for P2P input sync at 60Hz with rollback netcode
- **Room System** — Create/join rooms, lobby chat, ready check, private rooms with codes
- **Save States** — 8 slots per user per game, upload/download binary state files
- **Key Mapping** — Customizable keyboard + gamepad controls per user profile
- **Admin Panel** — Manage users (random or custom credentials), upload ROMs, view stats
- **Fullscreen** — Dedicated fullscreen button on the emulator

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 6 + TypeScript + Zustand |
| Emulator | EmulatorJS (Beetle PSX WASM) |
| Networking | WebRTC DataChannel (P2P) + WebSocket (signaling) |
| Backend | Node.js + Express 4 + TypeScript |
| Database | MongoDB (Mongoose ODM) |
| Auth | JWT + bcrypt |
| Storage | Local disk or S3-compatible (R2/MinIO) |

## Project Structure

```
├── backend/
│   └── src/
│       ├── index.ts              # Express + HTTP + WS entry
│       ├── config.ts             # Environment variables
│       ├── db/connection.ts      # MongoDB + admin seed
│       ├── models/               # User, Game, SaveState, RoomLog
│       ├── middleware/           # JWT auth, admin role check
│       ├── routes/               # REST: auth, admin, games, saves, keymaps, rooms
│       ├── services/             # Storage abstraction, user generator
│       └── signaling/            # WebSocket server + room manager
├── frontend/
│   └── src/
│       ├── api/client.ts         # Axios with JWT
│       ├── components/           # GameCanvas, ConnectionStatus, ChatBox, etc.
│       ├── emulator/             # EmulatorCore, InputMapper, SaveManager
│       ├── hooks/                # useEmulator, useNetplay, useGameLoop, useRoom
│       ├── netplay/              # PeerConnection, SignalingClient, Protocol, Rollback
│       ├── pages/                # Login, Home, Lobby, Room, Game, Settings, admin/*
│       └── stores/               # Zustand: authStore, gameStore, roomStore
```

## Local Development

### Prerequisites

- Node.js >= 18
- MongoDB running locally (default: `mongodb://localhost:27017`)

### Setup

```bash
# Backend
cd backend
cp .env.example .env    # Edit .env as needed
npm install
npm run dev             # http://localhost:3000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev             # http://localhost:5173
```

Default admin account (created on first run): `admin` / `admin123456`

## Deploy with Docker Compose + Cloudflare Tunnel

### Architecture

```
Internet → Cloudflare Tunnel → frontend (nginx:80)
                                  ├── static files (React SPA)
                                  ├── /api/* → backend:3000
                                  └── /ws   → backend:3000 (WebSocket)
                               backend (Node.js:3000)
                                  └── mongodb:27017
```

4 containers: `frontend` (nginx), `backend` (Node.js), `mongodb`, `cloudflared` (tunnel)

### Prerequisites

- VPS with Docker + Docker Compose installed
- Cloudflare Tunnel token for your domain

### 1. Install Docker (if not installed)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker --version && docker compose version
```

### 2. Clone project

```bash
cd /opt
git clone https://github.com/akaking-x/play-together-emu.git
cd play-together-emu
```

### 3. Configure backend .env

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Set production values:

```env
PORT=3000
NODE_ENV=production
MONGO_URI=mongodb://mongodb:27017/ps1web
JWT_SECRET=your-secure-random-string-at-least-32-chars
JWT_EXPIRES_IN=7d
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=/app/storage
STUN_URL=stun:stun.l.google.com:19302
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-strong-password
```

> **Note:** `MONGO_URI` uses `mongodb` (container name), not `localhost`.

### 4. Set Cloudflare Tunnel token

```bash
# Create .env file at project root for docker-compose
echo "CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token-here" > .env
```

### 5. Configure Cloudflare Tunnel

In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/):

1. Go to **Networks > Tunnels**
2. Create or edit your tunnel
3. Add a **Public Hostname**:
   - Subdomain: `play-psx`
   - Domain: `tuanbui.click`
   - Service: `http://frontend:80`
4. Under **Additional settings**:
   - Enable **WebSockets**
   - Set **HTTP Host Header**: `play-psx.tuanbui.click`

### 6. Build and start

```bash
docker compose up -d --build
```

Verify all 4 containers are running:

```bash
docker compose ps
```

Site live at: **https://play-psx.tuanbui.click**

### Quick Commands

```bash
# View logs
docker compose logs -f backend        # Backend logs
docker compose logs -f frontend       # Nginx logs
docker compose logs -f cloudflared    # Tunnel logs

# Restart after code update
cd /opt/play-together-emu
git pull origin main
docker compose up -d --build

# Stop everything
docker compose down

# Stop and remove all data (MongoDB + storage)
docker compose down -v

# Rebuild single container
docker compose build backend && docker compose up -d backend

# Shell into container
docker compose exec backend sh
docker compose exec mongodb mongosh ps1web
```

## How to Play

1. Admin logs in at `/login` with admin credentials
2. Admin uploads ROM files via Admin Panel > Game Manager
3. Admin creates player accounts via Admin Panel > User Manager
4. Players log in with their credentials
5. Player selects a game on the home page
6. Player creates or joins a room in the lobby
7. All players ready up, host starts the game
8. WebRTC connects players P2P, 60Hz input sync begins

## License

Private project. All rights reserved.
