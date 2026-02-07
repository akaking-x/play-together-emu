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

## Deploy to VPS

### Prerequisites

- Ubuntu 20.04+ VPS with root/sudo access
- Domain name pointing to your VPS IP (optional but recommended for HTTPS)

### 1. Install dependencies

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# MongoDB 7
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod

# Nginx
sudo apt install -y nginx

# PM2 (process manager)
sudo npm install -g pm2
```

### 2. Clone and build

```bash
cd /opt
sudo git clone https://github.com/akaking-x/play-together-emu.git
sudo chown -R $USER:$USER play-together-emu
cd play-together-emu

# Backend
cd backend
cp .env.example .env
nano .env               # Set production values (see below)
npm ci
npm run build

# Frontend
cd ../frontend
npm ci
npm run build           # Output in frontend/dist/
```

### 3. Configure .env (production)

```env
PORT=3000
NODE_ENV=production
MONGO_URI=mongodb://localhost:27017/ps1web
JWT_SECRET=your-secure-random-string-at-least-32-chars
JWT_EXPIRES_IN=7d
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=/opt/play-together-emu/storage
STUN_URL=stun:stun.l.google.com:19302
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-strong-password
```

### 4. Start backend with PM2

```bash
cd /opt/play-together-emu/backend
mkdir -p /opt/play-together-emu/storage
pm2 start dist/index.js --name ps1-backend
pm2 save
pm2 startup   # Follow the printed command to enable on boot
```

### 5. Nginx config

```bash
sudo nano /etc/nginx/sites-available/ps1
```

Paste (replace `your-domain.com` with your domain or server IP):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Required for SharedArrayBuffer (WASM emulator)
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;

    # Frontend static files
    root /opt/play-together-emu/frontend/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 700M;  # For ROM uploads
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/ps1 /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

### 6. HTTPS with Let's Encrypt (optional but recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 7. Firewall

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### Quick Commands

```bash
# View logs
pm2 logs ps1-backend

# Restart after code update
cd /opt/play-together-emu
git pull
cd backend && npm ci && npm run build && pm2 restart ps1-backend
cd ../frontend && npm ci && npm run build
# Nginx auto-serves new frontend/dist

# Monitor
pm2 monit
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
