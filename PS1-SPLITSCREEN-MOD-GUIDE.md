# PS1 Split-Screen to Single-Screen Modding Guide

Tai lieu huong dan chuyen doi game PS1 tu che do chia man hinh (split-screen) sang che do moi nguoi 1 man hinh rieng khi choi multiplayer online.

---

## Muc Luc

1. [Tong Quan Kien Truc](#1-tong-quan-kien-truc)
2. [Cach PS1 Render Split-Screen](#2-cach-ps1-render-split-screen)
3. [Phuong Phap Mod](#3-phuong-phap-mod)
4. [Huong Dan Cu The: Chocobo Racing](#4-huong-dan-cu-the-chocobo-racing)
5. [Quy Trinh Chung Cho Game Bat Ky](#5-quy-trinh-chung-cho-game-bat-ky)
6. [Tich Hop Voi He Thong Multiplayer](#6-tich-hop-voi-he-thong-multiplayer)
7. [Cong Cu Can Thiet](#7-cong-cu-can-thiet)
8. [Luu Y Va Han Che](#8-luu-y-va-han-che)

---

## 1. Tong Quan Kien Truc

### Van De
Khi choi multiplayer online, moi nguoi choi co 1 may tinh rieng chay emulator rieng. Nhung game PS1 split-screen (VD: Chocobo Racing 2P) se render **2 viewport nho** tren **1 man hinh**. Moi nguoi choi deu thay ca 2 man hinh nho — lang phi.

### Giai Phap
Moi emulator chi render **1 viewport full-screen** cua nguoi choi do. Cach lam:
- **Nguoi choi 1**: Emulator chi hien viewport tren/trai (Player 1)
- **Nguoi choi 2**: Emulator chi hien viewport duoi/phai (Player 2)

### 2 Huong Tiep Can Chinh

| Phuong phap | Do kho | Hieu qua | Mo ta |
|-------------|--------|----------|-------|
| **A. GPU Viewport Hack** | Trung binh | Cao | Thay doi vung render cua GPU de chi ve 1 nua man hinh nhung phong to full |
| **B. Memory Patch (GameShark)** | De-Trung binh | Trung binh | Tim dia chi RAM dieu khien viewport, force gia tri de chi render 1 man hinh |
| **C. CSS/Canvas Crop** | De | Thap | Khong sua game, chi crop + zoom canvas HTML de hien 1 nua |

---

## 2. Cach PS1 Render Split-Screen

### PS1 GPU Co Ban
PS1 GPU (Sony GTE + GPU) render vao **VRAM 1MB** (1024x512 pixels, 16-bit). Man hinh output la **320x240** hoac **640x480**.

### Split-Screen Hoat Dong The Nao
Game split-screen thuc hien:

```
Frame render:
1. Set GPU Drawing Area = (0, 0) -> (320, 120)     // Nua tren
2. Render scene cua Player 1 (camera P1)
3. Set GPU Drawing Area = (0, 120) -> (320, 240)   // Nua duoi
4. Render scene cua Player 2 (camera P2)
5. VSync - hien ca frame len man hinh
```

### Cac Thanh Phan Quan Trong Trong RAM

| Thanh phan | Mo ta | Vi du dia chi |
|-----------|-------|---------------|
| **Viewport X, Y** | Toa do goc tren-trai cua vung ve | Game-specific |
| **Viewport W, H** | Kich thuoc vung ve | Game-specific |
| **Camera Position** | Vi tri camera 3D cua moi player | Game-specific |
| **Split-screen Flag** | Co/bien bao cho game biet dang chia man hinh | Game-specific |
| **Player Count** | So nguoi choi hien tai | Game-specific |
| **Display List Pointer** | Con tro den danh sach lenh GPU | Game-specific |

---

## 3. Phuong Phap Mod

### Phuong Phap A: GPU Drawing Area Override (Tot nhat)

**Nguyen ly**: PS1 GPU co lenh `GP0(0xE3)` (Drawing Area Top-Left) va `GP0(0xE4)` (Drawing Area Bottom-Right). Ta intercept cac lenh nay va force viewport thanh full-screen.

**Cach lam voi EmulatorJS**:
EmulatorJS (Beetle PSX core) ho tro **cheat codes** dang GameShark. Ta dung cheat de:

1. Tim dia chi RAM chua viewport coordinates
2. Force viewport cua Player N thanh full-screen (0,0)-(320,240)
3. Force camera chi theo Player N

**GameShark Code Format:**
```
# Type 0: Constant Write (8-bit)
30XXXXXX 00YY        # Ghi gia tri YY vao dia chi XXXXXX

# Type 1: Constant Write (16-bit)
80XXXXXX YYYY        # Ghi gia tri YYYY vao dia chi XXXXXX

# Type 2: Constant Write (32-bit)
D0XXXXXX YYYY        # Conditional: chi ap dung khi [XXXXXX] == YYYY
```

### Phuong Phap B: Memory Scan + Patch

**Quy trinh:**

```
1. Chay game trong emulator voi debugger (DuckStation hoac no$psx)
2. Bat dau game 2P split-screen
3. Dung Memory Search:
   - Tim gia tri viewport Y (VD: 120 = 0x78 cho nua duoi)
   - Tim gia tri viewport H (VD: 120 = nua man hinh)
4. Thay doi gia tri => xem man hinh co thay doi
5. Khi tim dung dia chi => tao GameShark code
6. Ap dung code trong EmulatorJS
```

### Phuong Phap C: Canvas Crop (Don gian nhat, khong can mod game)

**Nguyen ly**: Khong sua game. De game render split-screen binh thuong, nhung dung CSS/JavaScript de:
- Crop canvas chi hien 1 nua
- Scale len full size

```javascript
// Frontend code - ap dung sau khi EmulatorJS khoi dong
function cropToPlayer(playerNumber) {
  const canvas = document.querySelector('#ejs-game-container canvas');
  if (!canvas) return;

  const wrapper = canvas.parentElement;
  wrapper.style.overflow = 'hidden';

  if (playerNumber === 1) {
    // Crop nua tren (horizontal split)
    canvas.style.transform = 'scaleY(2) translateY(25%)';
    // Hoac cho vertical split:
    // canvas.style.transform = 'scaleX(2) translateX(25%)';
  } else {
    // Crop nua duoi
    canvas.style.transform = 'scaleY(2) translateY(-25%)';
  }
}
```

**Uu diem**: Khong can tim dia chi RAM, ap dung cho moi game
**Nhuoc diem**: Chat luong hinh thap hon (scale tu 120p len 240p), co the thay vien cua nua kia

---

## 4. Huong Dan Cu The: Chocobo Racing

### Thong Tin Game
- **Ten**: Chocobo Racing (USA) / Chocobo Racing: Genkai e no Road (JP)
- **Disc ID**: SLUS-00800 (US)
- **Split-screen**: 2P horizontal (tren/duoi), co the 4P (4 goc)
- **Resolution**: 320x240 (tong), moi player 320x120 (2P)

### Buoc 1: Xac Dinh Loai Split-Screen

Chocobo Racing su dung **horizontal split** (chia ngang):
```
+------------------+
|   Player 1       |  Y: 0-119
|   (Camera P1)    |
+------------------+
|   Player 2       |  Y: 120-239
|   (Camera P2)    |
+------------------+
```

### Buoc 2: Tim Dia Chi RAM

**Su dung DuckStation (tot nhat de debug PS1):**

1. Mo game, vao race 2P
2. Mo **Debug > Memory Search**
3. Tim viewport Y offset:
   - Search 16-bit value = `0` (Player 1 viewport Y = 0)
   - Thay doi game state (VD: pause/unpause)
   - Filter ket qua
   - Tim dia chi ma khi thay doi thanh `120` thi man hinh P1 dich xuong

4. Tim split-screen flag:
   - Search 8-bit value khi dang 2P mode
   - Chuyen sang 1P mode
   - Filter thay doi
   - Tim bien dieu khien 1P/2P

**Dia chi thuong gap cho Chocobo Racing (can xac minh lai):**
```
# Luu y: dia chi co the khac giua US/EU/JP version
# Can tu scan voi debugger de xac nhan

# Viewport Y offset Player 1 (thuong la 0)
# Viewport Y offset Player 2 (thuong la 120/0x78)
# Viewport Height (thuong la 120 cho 2P, 240 cho 1P)
# Split-screen mode flag (0=1P, 1=2P, 3=4P)
```

### Buoc 3: Tao GameShark Code

**Vi du (gia su da tim duoc dia chi):**
```
# Force 1P mode (full screen cho Player 1):
# [Dia chi split flag] = 0 (1P mode)
30XXXXXX 0000

# Force viewport height = 240 (full screen)
80XXXXXX 00F0

# Force viewport Y = 0
80XXXXXX 0000
```

### Buoc 4: Ap Dung Trong EmulatorJS

```javascript
// Trong EmulatorCore, truoc khi load game:
window.EJS_cheats = [
  // Format: "CODE DESCRIPTION"
  "80XXXXXX 00F0 Full viewport height",
  "80XXXXXX 0000 Viewport Y = 0",
  "30XXXXXX 0000 Force 1P mode",
];
```

### Buoc 5: Phuong An Canvas Crop (Backup)

Neu khong tim duoc dia chi RAM, dung canvas crop:

```javascript
// Sau khi EmulatorJS start game:
const canvas = document.querySelector('#ejs-game-container canvas');

// Player 1: chi hien nua tren, phong to 2x
canvas.style.clipPath = 'inset(0 0 50% 0)';
canvas.style.transform = 'scaleY(2)';
canvas.style.transformOrigin = 'top center';

// Player 2: chi hien nua duoi, phong to 2x
// canvas.style.clipPath = 'inset(50% 0 0 0)';
// canvas.style.transform = 'scaleY(2)';
// canvas.style.transformOrigin = 'bottom center';
```

---

## 5. Quy Trinh Chung Cho Game Bat Ky

### Buoc 1: Phan Tich Game

| Cau hoi | Cach tra loi |
|---------|-------------|
| Game chia man hinh kieu gi? | Choi thu 2P, chup screenshot |
| Horizontal (tren/duoi) hay Vertical (trai/phai)? | Quan sat |
| Co bao nhieu player max? | Doc game manual hoac thu |
| Game co 1P mode khong? | Neu co, de hon (tim flag chuyen 1P/2P) |

### Buoc 2: Chon Phuong Phap

```
Co debugger (DuckStation)?
  |-- Co --> Phuong phap A hoac B (GameShark/Memory Patch)
  |          |-- Game co 1P mode? --> Tim split-screen flag, force = 0
  |          |-- Game chi co 2P?  --> Tim viewport coordinates, force full
  |
  |-- Khong --> Phuong phap C (Canvas Crop)
              |-- Horizontal split --> Crop Y, scale Y*2
              |-- Vertical split   --> Crop X, scale X*2
              |-- 4-way split      --> Crop 1/4, scale 2x2
```

### Buoc 3: Tim Dia Chi RAM (Chi cho Phuong phap A/B)

**Tool**: DuckStation Debug Mode

```
1. Bat dau game o 2P mode
2. Memory Search: Scan gia tri da biet
   - Viewport height = 120 (0x78) cho horizontal 2P split
   - Viewport height = 160 (0xA0) cho vertical 2P split
   - Viewport width = 160 (0xA0) cho vertical 2P split

3. Thay doi in-game (VD: menu -> gameplay -> pause)
4. Filter dia chi thay doi/khong thay doi

5. Khi con vai dia chi:
   - Thu ghi gia tri moi (VD: 240) = full screen height
   - Xem man hinh game co thay doi khong

6. Xac nhan dia chi dung => ghi lai => tao GameShark code
```

**Meo tim nhanh:**
- Split-screen flag thuong gan voi player count trong RAM
- Viewport coordinates thuong nam trong 1 struct lien tiep:
  ```
  struct Viewport {
    int16 x;      // +0x00
    int16 y;      // +0x02
    int16 width;  // +0x04
    int16 height; // +0x06
  };
  ```
- Thu search 4 gia tri lien tiep: `0, 0, 320, 120` (P1 viewport)
- Camera position thuong la 3 float32 (X, Y, Z) gan viewport struct

### Buoc 4: Tao Config File

Tao 1 file JSON cho moi game da mod:

```json
{
  "gameId": "chocobo-racing",
  "discId": "SLUS-00800",
  "region": "US",
  "splitType": "horizontal",
  "maxPlayers": 2,
  "method": "gameshark",
  "cheats": {
    "player1_fullscreen": [
      "80XXXXXX 00F0",
      "80XXXXXX 0000"
    ],
    "player2_fullscreen": [
      "80XXXXXX 00F0",
      "80XXXXXX 0078"
    ]
  },
  "canvasCrop": {
    "player1": {
      "clipPath": "inset(0 0 50% 0)",
      "transform": "scaleY(2)",
      "transformOrigin": "top center"
    },
    "player2": {
      "clipPath": "inset(50% 0 0 0)",
      "transform": "scaleY(2)",
      "transformOrigin": "bottom center"
    }
  },
  "notes": "Tested with US version. JP version may have different addresses."
}
```

### Buoc 5: Tich Hop Vao Code

```typescript
// frontend/src/emulator/split-screen-config.ts

export interface SplitScreenConfig {
  gameId: string;
  splitType: 'horizontal' | 'vertical' | 'quad';
  method: 'gameshark' | 'canvas-crop' | 'both';
  cheats?: Record<string, string[]>;  // playerN_fullscreen -> codes
  canvasCrop?: Record<string, {
    clipPath: string;
    transform: string;
    transformOrigin: string;
  }>;
}

export function applySplitScreenMod(
  config: SplitScreenConfig,
  playerNumber: number,  // 1-based
) {
  const key = `player${playerNumber}`;

  // Method 1: GameShark cheats (set before game loads)
  if (config.method === 'gameshark' || config.method === 'both') {
    const codes = config.cheats?.[`${key}_fullscreen`];
    if (codes) {
      // EmulatorJS supports cheat codes
      (window as any).EJS_cheats = codes.map(
        (code, i) => `${code} SplitMod_${i}`
      );
    }
  }

  // Method 2: Canvas crop (apply after game starts)
  if (config.method === 'canvas-crop' || config.method === 'both') {
    const crop = config.canvasCrop?.[key];
    if (crop) {
      // Wait for EmulatorJS to create canvas
      const observer = new MutationObserver(() => {
        const canvas = document.querySelector(
          '#ejs-game-container canvas'
        ) as HTMLCanvasElement;
        if (canvas) {
          canvas.style.clipPath = crop.clipPath;
          canvas.style.transform = crop.transform;
          canvas.style.transformOrigin = crop.transformOrigin;
          observer.disconnect();
        }
      });
      observer.observe(
        document.getElementById('ejs-game-container')!,
        { childList: true, subtree: true }
      );
    }
  }
}
```

---

## 6. Tich Hop Voi He Thong Multiplayer

### Kien Truc Multiplayer Hien Tai

```
                    Backend (WebSocket)
                    /        \
                   /          \
            Player 1          Player 2
            Emulator          Emulator
            (Full ROM)        (Full ROM)
                |                 |
            Input P1          Input P2
                \                /
                 WebRTC DataChannel
                (Sync input moi frame)
```

### Cach Ket Hop Split-Screen Mod

```
Player 1 Machine:                    Player 2 Machine:
+---------------------------+        +---------------------------+
| Emulator chay FULL game   |        | Emulator chay FULL game   |
| (ca 2P logic)             |        | (ca 2P logic)             |
|                           |        |                           |
| GameShark: Force P1 view  |        | GameShark: Force P2 view  |
| => Full screen cho P1     |        | => Full screen cho P2     |
|                           |        |                           |
| Input P1: tu keyboard     |        | Input P1: tu WebRTC       |
| Input P2: tu WebRTC       |        | Input P2: tu keyboard     |
+---------------------------+        +---------------------------+
          |                                    |
          +---- WebRTC DataChannel ------------+
          (Gui input local, nhan input remote)
```

**Diem quan trong:**
- MOI emulator deu chay **CUNG 1 ROM**, **CUNG logic game**
- Chi khac: **viewport** (ai thay man hinh nao) va **input source** (ai dieu khien port nao)
- Input duoc dong bo qua WebRTC nen game state giong nhau tren ca 2 may
- Split-screen mod chi thay doi **phan hien thi**, khong anh huong game logic

### Flow Chi Tiet

```
Frame N:
  Player 1:
    1. Poll keyboard => buttons_P1
    2. Gui buttons_P1 qua WebRTC
    3. Nhan buttons_P2 tu WebRTC
    4. Feed input: port 0 = buttons_P1, port 1 = buttons_P2
    5. Emulator advance 1 frame
    6. Hien thi: chi viewport P1 (full screen)

  Player 2:
    1. Poll keyboard => buttons_P2
    2. Gui buttons_P2 qua WebRTC
    3. Nhan buttons_P1 tu WebRTC
    4. Feed input: port 0 = buttons_P1, port 1 = buttons_P2
    5. Emulator advance 1 frame
    6. Hien thi: chi viewport P2 (full screen)
```

**Quan trong**: Ca 2 emulator phai nhan CUNG input theo CUNG thu tu moi frame de dam bao game state dong bo (deterministic).

---

## 7. Cong Cu Can Thiet

### Debug va Tim Dia Chi

| Cong cu | Muc dich | Link |
|---------|----------|------|
| **DuckStation** | PS1 emulator voi debugger tot nhat | github.com/stenzek/duckstation |
| **Cheat Engine** (+ Beetle PSX) | Memory scan tren PC emulator | cheatengine.org |
| **no$psx** | PS1 debugger/disassembler | problemkaputt.de |
| **Ghidra** + PSX plugin | Reverse engineering ROM | ghidra-sre.org |
| **psx-spx** | Tai lieu ky thuat PS1 | problemkaputt.de/psx-spx.htm |

### Quy Trinh Memory Scan Voi DuckStation

```
1. Settings > Advanced > Enable Debug Menu = true
2. Khoi dong lai DuckStation
3. Debug > Memory Search
4. Choi game den luc split-screen
5. Search: Size=16-bit, Value=120 (viewport height nua man hinh)
6. Thay doi game state (VD: pause menu)
7. Filter: "Not Changed" hoac "Changed"
8. Lap lai cho den khi con < 10 dia chi
9. Thu ghi gia tri 240 vao tung dia chi
10. Dia chi nao lam viewport lon ra => do la dia chi can tim
```

### Tao GameShark Code Tu Dia Chi

```
Dia chi PS1 RAM: 0x80XXXXXX (user space bat dau tu 0x80000000)
GameShark format: TTAAAAAA VVVV

TT = Type:
  30 = Write 8-bit
  80 = Write 16-bit

AAAAAA = Dia chi (bo prefix 0x80)

VD: Dia chi 0x800A1234, gia tri 0x00F0 (240)
=> GameShark code: 800A1234 00F0
```

---

## 8. Luu Y Va Han Che

### Nhung Gi Hoat Dong Tot
- Canvas crop: ap dung cho **TAT CA** game split-screen, khong can tim dia chi
- GameShark viewport hack: chat luong tot nhat, full resolution
- Deterministic sync: PS1 la may co dinh (khong co random hardware), nen input sync = game sync

### Nhung Gi Kho/Khong Duoc
- **3D camera rotation**: mot so game dung camera doc lap cho moi player, can tim + override ca camera struct
- **HUD/UI overlap**: game co the ve HUD o vi tri co dinh, khi zoom se bi sai
- **4P games**: phuc tap hon nhieu (can crop 1/4 va zoom 4x, rat xau)
- **Khong phai moi game deu splitscreen giong nhau**: mot so game dung VRAM tricks thay vi GPU Drawing Area
- **Online latency**: PS1 racing games chay 30 hoac 60 FPS, can < 100ms RTT de smooth

### Danh Sach Game PS1 Split-Screen Pho Bien

| Game | Split Type | Do Kho Mod | Ghi Chu |
|------|-----------|-----------|---------|
| Chocobo Racing | Horizontal 2P | Trung binh | Co 1P mode, tim flag |
| Crash Team Racing | Horizontal 2-4P | Kho | Camera 3D phuc tap |
| Micro Machines V3 | Shared screen | Khong can | Khong split-screen |
| Tony Hawk's Pro Skater 2 | Horizontal 2P | De | Co 1P mode |
| Twisted Metal 2 | Horizontal 2P | Trung binh | Viewport + camera |
| Speed Freaks | Horizontal 2P | Trung binh | Tuong tu Chocobo |
| Wipeout 3 | Horizontal 2P | Kho | Render pipeline phuc tap |
| Tekken 3 | Khong co | N/A | Da la full screen 2P |
| FIFA series | Khong can | N/A | Shared camera |
| International Track & Field | Khong can | N/A | Shared screen |

### Ke Hoach Trien Khai

```
Giai doan 1: Canvas Crop (nhanh, ap dung ngay)
  - Them crop config vao Game model (DB)
  - Admin chon splitType khi upload game
  - Frontend tu dong crop theo player number

Giai doan 2: GameShark Codes (chat luong cao)
  - Them truong "cheats" vao Game model
  - Admin nhap GameShark codes cho tung game
  - EmulatorJS load cheats truoc khi start

Giai doan 3: Community Database
  - Nguoi dung dong gop dia chi/codes
  - Review va verify boi admin
  - Tu dong ap dung khi choi
```

---

## Template Cho Game Moi

Khi ban muon mod 1 game moi, dien vao template nay:

```yaml
Game: [Ten game]
Disc ID: [SLUS-XXXXX]
Region: [US/EU/JP]
Split Type: [horizontal/vertical/quad/none]
Max Players: [2/3/4]
Tested Version: [US v1.0]

# Phuong phap A: GameShark
RAM Addresses:
  Split Flag: 0x80______  # 0=1P, 1=2P
  Viewport P1 Y: 0x80______
  Viewport P1 H: 0x80______
  Viewport P2 Y: 0x80______
  Viewport P2 H: 0x80______
  Camera P1 Ptr: 0x80______
  Camera P2 Ptr: 0x80______

Cheats Player 1 Fullscreen:
  - 80XXXXXX YYYY  # Description
  - 80XXXXXX YYYY  # Description

Cheats Player 2 Fullscreen:
  - 80XXXXXX YYYY  # Description
  - 80XXXXXX YYYY  # Description

# Phuong phap C: Canvas Crop
Canvas Crop P1:
  clipPath: "inset(0 0 50% 0)"
  transform: "scaleY(2)"
  transformOrigin: "top center"

Canvas Crop P2:
  clipPath: "inset(50% 0 0 0)"
  transform: "scaleY(2)"
  transformOrigin: "bottom center"

Notes: [Ghi chu them]
```
