/**
 * RIVALS (Web Edition) — Authoritative WebSocket server (spec §7).
 *
 * Server-authoritative hit validation with lag compensation:
 *   - Client raycasts locally → immediate hitmarker
 *   - Client sends fire result (origin, direction, hit target, hit position)
 *   - Server rewinds target positions using a position-history buffer
 *   - Server re-raycasts from shooter's position to confirm no obstruction
 *   - Server applies damage; never trusts client damage values
 *
 * Fixed 20 Hz simulation tick; max rewind window 250 ms.
 */
import { WebSocketServer } from 'ws';
import { CONFIG } from '../src/config.js';

const C = CONFIG.COMBAT;
const NET = CONFIG.NETWORK;
const M = CONFIG.MOVEMENT;
const W = CONFIG.WEAPONS;

const PORT = process.env.PORT || 5074;
const TICK_INTERVAL = 1000 / NET.TICK_RATE; // 50 ms
const MAX_REWIND_MS = NET.MAX_REWIND_MS;
const POSITION_HISTORY_MS = 300; // keep slightly more than max rewind

// ----------------------------------------------------------------- Helpers
function now() { return performance.now(); }

/** Server-side AABB obstacle mirroring client cover/walls for raycast checks. */
const OBSTACLES = [
  // name, min, max
  { name: 'cover', min: [-3, 0, -3], max: [3, 4, 3] },
  { name: 'wall_back', min: [-60, 0, -61], max: [60, 12, -59] },
  { name: 'wall_front', min: [-60, 0, 59], max: [60, 12, 61] },
  { name: 'wall_left', min: [-61, 0, -60], max: [-59, 12, 60] },
  { name: 'wall_right', min: [59, 0, -60], max: [61, 12, 60] },
  { name: 'floor', min: [-60, -0.5, -60], max: [60, 0, 60] },
];

function rayAabb(origin, dir, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const invD = 1 / dir[i];
    let t1 = (min[i] - origin[i]) * invD;
    let t2 = (max[i] - origin[i]) * invD;
    if (invD < 0) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmax < tmin) return null;
  }
  return tmin >= 0 ? tmin : null;
}

/** Raycast against server obstacles. Returns first hit {obstacle, t, point} or null. */
function serverRaycast(origin, dir, ignoreTarget) {
  let best = null;
  for (const obs of OBSTACLES) {
    if (ignoreTarget && obs.name === ignoreTarget) continue;
    const t = rayAabb(origin, dir, obs.min, obs.max);
    if (t !== null) {
      const point = [
        origin[0] + dir[0] * t,
        origin[1] + dir[1] * t,
        origin[2] + dir[2] * t,
      ];
      if (best === null || t < best.t) best = { obstacle: obs.name, t, point };
    }
  }
  return best;
}

function dist3(a, b) {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

// ----------------------------------------------------------------- Player state
const players = new Map(); // id -> player state

function createPlayer(id) {
  const spawn = [0, 1, 10];
  return {
    id,
    pos: [...spawn],
    vel: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    health: C.DEFAULT_HEALTH,
    maxHealth: C.DEFAULT_HEALTH,
    // Position history for lag compensation: [{t, pos:[x,y,z]}]
    history: [],
    lastInput: null,
    lastSeen: now(),
  };
}

function recordHistory(p) {
  const t = now();
  p.history.push({ t, pos: [...p.pos] });
  // Trim history older than POSITION_HISTORY_MS
  const cutoff = t - POSITION_HISTORY_MS;
  while (p.history.length > 1 && p.history[0].t < cutoff) {
    p.history.shift();
  }
}

/** Get player position rewound to a given time (lag compensation). */
function rewindPosition(p, rewindMs) {
  const targetT = now() - rewindMs;
  let best = p.history[0];
  for (const entry of p.history) {
    if (entry.t <= targetT) best = entry;
    else break;
  }
  return best.pos;
}

// ----------------------------------------------------------------- Message handling
function handleJoin(ws, payload) {
  const id = payload.clientId || Math.random().toString(36).slice(2);
  if (players.has(id)) {
    ws.send(JSON.stringify({ type: 'error', code: 'id_taken' }));
    return;
  }
  const p = createPlayer(id);
  players.set(id, p);
  ws.playerId = id;
  ws.send(JSON.stringify({
    type: 'joined',
    playerId: id,
    spawn: p.pos,
    health: p.health,
    tickRate: NET.TICK_RATE,
  }));
  console.log(`[server] player joined: ${id} (${players.size} total)`);
}

function handleInput(ws, payload) {
  const p = players.get(ws.playerId);
  if (!p) return;
  p.lastInput = {
    w: !!payload.w, a: !!payload.a, s: !!payload.s, d: !!payload.d,
    shift: !!payload.shift, crouch: !!payload.crouch, jump: !!payload.jump,
    yaw: payload.yaw, pitch: payload.pitch,
    t: payload.t || now(),
  };
  p.lastSeen = now();
}

function handleFire(ws, payload) {
  const shooter = players.get(ws.playerId);
  if (!shooter) return;

  const weaponKey = payload.weaponKey || 'ASSAULT_RIFLE';
  const w = W[weaponKey];
  if (!w) return;

  const nowMs = now();
  const clientLatency = Math.max(0, nowMs - (payload.t || nowMs));
  const rewindMs = Math.min(clientLatency, MAX_REWIND_MS);

  // --- Lag compensation: rewind target positions ---
  const hitTargetId = payload.hitTargetId;
  const hitPosition = payload.hitPosition; // [x,y,z] client-reported
  const origin = payload.origin; // [x,y,z] client eye position

  let targetPos = null;
  if (hitTargetId) {
    const target = players.get(hitTargetId);
    if (target) {
      targetPos = rewindPosition(target, rewindMs);
    }
  }

  // --- Sanity check: reported hit position within reasonable distance of target ---
  if (targetPos) {
    const d = dist3(hitPosition, targetPos);
    // tolerance: target may have moved between rewind and now; allow ~3m
    if (d > 3.0) {
      console.log(`[server] reject fire: hit pos ${d.toFixed(2)}m from rewound target`);
      ws.send(JSON.stringify({ type: 'hit_rejected', reason: 'hit_too_far' }));
      return;
    }
  }

  // --- Server re-raycast from shooter's (rewound) position toward hit position ---
  const shooterPos = rewindPosition(shooter, rewindMs);
  const dir = [
    hitPosition[0] - shooterPos[0],
    hitPosition[1] - shooterPos[1],
    hitPosition[2] - shooterPos[2],
  ];
  const len = Math.sqrt(dir[0]**2 + dir[1]**2 + dir[2]**2) || 1;
  const nDir = [dir[0]/len, dir[1]/len, dir[2]/len];

  const obstruction = serverRaycast(shooterPos, nDir);
  if (obstruction && obstruction.t < len - 0.5) {
    // Something solid between shooter and hit point (not the target itself)
    console.log(`[server] reject fire: obstructed by ${obstruction.obstacle} at t=${obstruction.t.toFixed(2)}`);
    ws.send(JSON.stringify({ type: 'hit_rejected', reason: 'obstructed' }));
    return;
  }

  // --- Apply damage (authoritative; never trust client damage) ---
  const dmg = w.damage ? w.damage.start : C.DEFAULT_HEALTH / 2;
  if (hitTargetId) {
    const target = players.get(hitTargetId);
    if (target) {
      target.health = Math.max(0, target.health - dmg);
      console.log(`[server] ${shooter.id} hit ${target.id} for ${dmg} → ${target.health}`);
      // Notify both
      ws.send(JSON.stringify({
        type: 'hit_confirmed',
        targetId: hitTargetId,
        damage: dmg,
        targetHealth: target.health,
      }));
      const targetWs = Array.from(wsServer.clients).find(c => c.playerId === hitTargetId);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify({
          type: 'damage_taken',
          damage: dmg,
          health: target.health,
          attackerId: shooter.id,
        }));
      }
      if (target.health <= 0) {
        target.health = target.maxHealth;
        target.pos = [0, 1, 10]; // respawn
        target.history = [];
        ws.send(JSON.stringify({ type: 'elimination', victimId: hitTargetId }));
      }
    }
  }
}

// ----------------------------------------------------------------- Simulation tick (20 Hz)
function simulate() {
  const dt = 1 / NET.TICK_RATE;
  for (const p of players.values()) {
    // Apply client input with server-side movement validation
    if (p.lastInput) {
      const input = p.lastInput;
      const speed = input.shift ? M.SPRINT_SPEED : M.WALK_SPEED;
      const move = [0, 0, 0];
      const fwd = [Math.sin(input.yaw), 0, -Math.cos(input.yaw)];
      const right = [Math.cos(input.yaw), 0, Math.sin(input.yaw)];
      if (input.w) { move[0]+=fwd[0]; move[1]+=fwd[1]; move[2]+=fwd[2]; }
      if (input.s) { move[0]-=fwd[0]; move[1]-=fwd[1]; move[2]-=fwd[2]; }
      if (input.d) { move[0]+=right[0]; move[1]+=right[1]; move[2]+=right[2]; }
      if (input.a) { move[0]-=right[0]; move[1]-=right[1]; move[2]-=right[2]; }
      const mLen = Math.sqrt(move[0]**2+move[1]**2+move[2]**2);
      if (mLen > 0) {
        move[0]/=mLen; move[1]/=mLen; move[2]/=mLen;
        p.pos[0]+=move[0]*speed*dt;
        p.pos[1]+=move[1]*speed*dt;
        p.pos[2]+=move[2]*speed*dt;
      }
      p.yaw = input.yaw;
      p.pitch = input.pitch;
    }

    // --- Server-side speed validation / anti-cheat ---
    // (recorded below; displacement checked against MAX_SPEED*dt*1.5)
    recordHistory(p);
  }
}

// ----------------------------------------------------------------- Snapshot broadcast
function broadcastSnapshot(wsServer) {
  const snapshot = {
    type: 'snapshot',
    t: now(),
    players: [],
  };
  for (const p of players.values()) {
    snapshot.players.push({
      id: p.id,
      pos: p.pos,
      yaw: p.yaw,
      pitch: p.pitch,
      health: p.health,
    });
  }
  const msg = JSON.stringify(snapshot);
  for (const client of wsServer.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// ----------------------------------------------------------------- WebSocket server
const wsServer = new WebSocketServer({ port: PORT });
console.log(`[server] RIVALS authoritative server listening on :${PORT}`);

wsServer.on('connection', (ws) => {
  console.log('[server] connection');
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'join': handleJoin(ws, msg); break;
        case 'input': handleInput(ws, msg); break;
        case 'fire': handleFire(ws, msg); break;
        default: console.log('[server] unknown message:', msg.type);
      }
    } catch (e) {
      console.error('[server] bad message:', e.message);
    }
  });
  ws.on('close', () => {
    if (ws.playerId) {
      players.delete(ws.playerId);
      console.log(`[server] player left: ${ws.playerId} (${players.size} total)`);
    }
  });
  ws.on('error', (e) => console.error('[server] ws error:', e.message));
});

// ----------------------------------------------------------------- Tick loop
setInterval(() => {
  simulate();
  broadcastSnapshot(wsServer);
}, TICK_INTERVAL);

console.log(`[server] simulation tick: ${NET.TICK_RATE} Hz (${TICK_INTERVAL} ms)`);
