import { useEffect, useRef, useCallback } from 'react';

const CANVAS_W = 600;
const CANVAS_H = 200;
const GROUND_Y = 160;
const GRAVITY = 0.6;
const JUMP_FORCE = -11;
const DUCK_HEIGHT = 20;
const PLAYER_W = 24;
const PLAYER_H = 40;
const OBS_MIN_GAP = 200;
const OBS_MAX_GAP = 400;

interface Obstacle {
  x: number;
  w: number;
  h: number;
  y: number; // top of obstacle
}

export function DinoRunner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    running: false,
    started: false,
    gameOver: false,
    playerY: GROUND_Y - PLAYER_H,
    velY: 0,
    ducking: false,
    obstacles: [] as Obstacle[],
    nextObsDist: 300,
    speed: 4,
    score: 0,
    highScore: 0,
    frameId: 0,
  });
  const keysRef = useRef({ jump: false, duck: false });

  const reset = useCallback(() => {
    const s = stateRef.current;
    s.playerY = GROUND_Y - PLAYER_H;
    s.velY = 0;
    s.ducking = false;
    s.obstacles = [];
    s.nextObsDist = 300;
    s.speed = 4;
    s.score = 0;
    s.gameOver = false;
    s.started = true;
    s.running = true;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // Load high score
    try {
      stateRef.current.highScore = parseInt(localStorage.getItem('dino_hi') || '0', 10) || 0;
    } catch { /* ignore */ }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        keysRef.current.jump = true;
        if (!stateRef.current.started || stateRef.current.gameOver) {
          reset();
        }
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        keysRef.current.duck = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') keysRef.current.jump = false;
      if (e.code === 'ArrowDown') keysRef.current.duck = false;
    };

    canvas.tabIndex = 0;
    canvas.focus();
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('keyup', onKeyUp);

    function spawnObstacle() {
      const s = stateRef.current;
      const type = Math.random();
      let w: number, h: number, y: number;
      if (type < 0.6) {
        // Ground cactus
        w = 12 + Math.random() * 16;
        h = 24 + Math.random() * 24;
        y = GROUND_Y - h;
      } else if (type < 0.85) {
        // Wide low block
        w = 30 + Math.random() * 20;
        h = 16;
        y = GROUND_Y - h;
      } else {
        // Flying obstacle (must duck)
        w = 24 + Math.random() * 12;
        h = 14;
        y = GROUND_Y - PLAYER_H + 4; // head height — jump won't help, must duck
      }
      s.obstacles.push({ x: CANVAS_W + 20, w, h, y });
      s.nextObsDist = OBS_MIN_GAP + Math.random() * (OBS_MAX_GAP - OBS_MIN_GAP);
    }

    function update() {
      const s = stateRef.current;
      if (!s.running) return;

      const onGround = s.playerY >= GROUND_Y - PLAYER_H;

      // Jump
      if (keysRef.current.jump && onGround && !s.ducking) {
        s.velY = JUMP_FORCE;
      }

      // Duck
      s.ducking = keysRef.current.duck && onGround;

      // Physics
      s.velY += GRAVITY;
      s.playerY += s.velY;
      if (s.playerY >= GROUND_Y - PLAYER_H) {
        s.playerY = GROUND_Y - PLAYER_H;
        s.velY = 0;
      }

      // Move obstacles
      for (const obs of s.obstacles) {
        obs.x -= s.speed;
      }
      // Remove off-screen
      s.obstacles = s.obstacles.filter((o) => o.x + o.w > -20);

      // Spawn
      s.nextObsDist -= s.speed;
      if (s.nextObsDist <= 0) {
        spawnObstacle();
      }

      // Collision
      const px = 40;
      const pw = PLAYER_W;
      const ph = s.ducking ? DUCK_HEIGHT : PLAYER_H;
      const py = s.ducking ? GROUND_Y - DUCK_HEIGHT : s.playerY;

      for (const obs of s.obstacles) {
        if (
          px + pw > obs.x + 2 &&
          px < obs.x + obs.w - 2 &&
          py + ph > obs.y + 2 &&
          py < obs.y + obs.h - 2
        ) {
          s.running = false;
          s.gameOver = true;
          if (s.score > s.highScore) {
            s.highScore = s.score;
            try { localStorage.setItem('dino_hi', String(s.score)); } catch { /* */ }
          }
          return;
        }
      }

      s.score++;
      s.speed = 4 + Math.floor(s.score / 500) * 0.5;
    }

    function draw() {
      const s = stateRef.current;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Background
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Ground line
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(CANVAS_W, GROUND_Y);
      ctx.stroke();

      // Ground texture dots
      ctx.fillStyle = '#333';
      for (let i = 0; i < CANVAS_W; i += 20) {
        const offset = s.started ? (s.score * 4) % 20 : 0;
        ctx.fillRect((i - offset + CANVAS_W) % CANVAS_W, GROUND_Y + 4, 2, 1);
      }

      // Player
      const ph = s.ducking ? DUCK_HEIGHT : PLAYER_H;
      const py = s.ducking ? GROUND_Y - DUCK_HEIGHT : s.playerY;
      ctx.fillStyle = s.gameOver ? '#ff4444' : '#4ecdc4';
      ctx.fillRect(40, py, PLAYER_W, ph);
      // Eye
      ctx.fillStyle = '#111';
      ctx.fillRect(54, py + 4, 4, 4);
      // Legs (when not ducking and on ground)
      if (!s.ducking && s.playerY >= GROUND_Y - PLAYER_H) {
        const legFrame = Math.floor(s.score / 5) % 2;
        ctx.fillStyle = s.gameOver ? '#cc3333' : '#3ab8b0';
        if (legFrame === 0) {
          ctx.fillRect(44, py + ph - 2, 6, 4);
          ctx.fillRect(54, py + ph - 4, 6, 4);
        } else {
          ctx.fillRect(44, py + ph - 4, 6, 4);
          ctx.fillRect(54, py + ph - 2, 6, 4);
        }
      }

      // Obstacles
      for (const obs of s.obstacles) {
        ctx.fillStyle = '#ff6b35';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        // Highlight
        ctx.fillStyle = '#ff8c5a';
        ctx.fillRect(obs.x + 2, obs.y + 2, obs.w - 4, 3);
      }

      // Score
      ctx.fillStyle = '#888';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`HI ${String(s.highScore).padStart(5, '0')}  ${String(s.score).padStart(5, '0')}`, CANVAS_W - 10, 20);

      // Prompt text
      if (!s.started) {
        ctx.fillStyle = '#aaa';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Nhan SPACE de bat dau', CANVAS_W / 2, CANVAS_H / 2 - 10);
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.fillText('UP = nhay  |  DOWN = cui', CANVAS_W / 2, CANVAS_H / 2 + 10);
      }

      if (s.gameOver) {
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 10);
        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.fillText('Nhan SPACE de choi lai', CANVAS_W / 2, CANVAS_H / 2 + 12);
      }
    }

    function loop() {
      update();
      draw();
      stateRef.current.frameId = requestAnimationFrame(loop);
    }

    // Initial draw
    draw();
    stateRef.current.frameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(stateRef.current.frameId);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
    };
  }, [reset]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{
        display: 'block',
        margin: '0 auto',
        maxWidth: '100%',
        imageRendering: 'pixelated',
        outline: 'none',
      }}
    />
  );
}
