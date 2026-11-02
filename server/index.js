/**
 * RIVALS (Web Edition) — Authoritative WebSocket server (spec §1 + §7).
 *
 * Round state machine (server-authoritative):
 *   Lobby → Intermission (Map Vote) → Round Active → Round End →
 *   [score < 5: Intermission] → [score = 5: Match End]
 *
 * Server-authoritative hit validation with lag compensation:
 *   - Client raycasts locally → immediate hitmarker
 *   - Client sends fire result → server validates (sanity + re-raycast + rewind)
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
const POSITION_HISTORY_MS = 300;

// Round timing (spec §1)
const ROUND_TIME_S = 180;        // 3 minute rounds
const INTERMISSION_TIME_S = 8;   // map vote / between rounds
const MATCH_WIN_SCORE = 5;       // first to 5 round wins

// Game modes (spec §2)
const MODE_DUEL = 'DUEL';        // 1v1-5v5, first to 5 round wins
const MODE_TDM = 'TDM';          // 8v8, most kills before timer
const MODE_FFA = 'FFA';          // 16 players, top 5 scorers win
const MODE_GUN_GAME = 'GUN_GAME'; // cycle weapons per kill

let currentGameMode = MODE_DUEL;

// Round state enum
const ROUND_LOBBY = 'LOBBY';
const ROUND_INTERMISSION = 'INTERMISSION';
const ROUND_ACTIVE = 'ROUND_ACTIVE';
const ROUND_END = 'ROUND_END';
const ROUND_MATCH_END = 'MATCH_END';

// ----------------------------------------------------------------- Helpers
function now() { return performance.now(); }

/** Server-side AABB obstacle mirroring client cover/walls for raycast checks. */
const OBSTACLES = [
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

function serverRaycast(origin, dir, ignoreTarget) {
  let best = null;
  for (const obs of OBSTACLES) {
    if (ignoreTarget && obs.name === ignoreTarget) continue;
    const t = rayAabb(origin, dir, obs.min, obs.max);
    if (t !== null) {
      const point = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
      if (best === null || t < best.t) best = { obstacle: obs.name, t, point };
    }
  }
  return best;
}

function dist3(a, b) {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

function pLastFire(p) { return p.lastFireTime; }
function setLastFire(p, t) { p.lastFireTime = t; }

/** Compute body damage with falloff + headshot crit (spec §4.2 / §4.3).
 *  Returns { damage, isHeadshot }. Server-authoritative. */
function computeDamage(w, distMeters, isHeadshot) {
  const body = w.noFalloff
    ? w.damage.start
    : (() => {
        const range = w.range || 100;
        const t = Math.min(1, distMeters / range);
        return w.damage.start + (w.damage.end - w.damage.start) * t;
      })();
  let dmg = body;
  if (isHeadshot) {
    if (w.crit) dmg = w.crit.start;            // explicit crit damage
    else if (w.critMult) dmg = body * w.critMult; // multiplier
    else dmg = body * 2;                        // default 2× headshot
  }
  return { damage: Math.max(0, dmg), isHeadshot };
}

/** Head zone: hit is a headshot if above ~75% of target height. */
function isHeadshotPoint(hitPoint, targetPos, targetHeight = 1.7) {
  return hitPoint[1] > targetPos[1] + targetHeight * 0.75;
}

// ----------------------------------------------------------------- Game state (round machine)
const scores = new Map(); // playerId -> round wins
let roundState = ROUND_LOBBY;
let roundTimer = INTERMISSION_TIME_S;
let roundWinnerId = null;
let currentMap = 'Arena';

function ensureScore(id) { if (!scores.has(id)) scores.set(id, 0); }
function leaderboard() {
  return Array.from(scores.entries()).map(([id, s]) => ({ id, score: s })).sort((a, b) => b.score - a.score);
}

function startIntermission() {
  roundState = ROUND_INTERMISSION;
  roundTimer = INTERMISSION_TIME_S;
  roundWinnerId = null;
  console.log(`[server] INTERMISSION (map vote) — scores: ${JSON.stringify(Object.fromEntries(scores))}`);
}

function startRound() {
  roundState = ROUND_ACTIVE;
  roundTimer = ROUND_TIME_S;
  roundWinnerId = null;
  // Respawn all players
  for (const [id, p] of players) {
    ensureScore(id);
    p.health = C.DEFAULT_HEALTH;
    p.pos = [0, 1, 10];
    p.history = [];
    if (Math.random() < 0.5) p.pos = [0, 1, -10]; // alternate spawn for duel
  }
  console.log(`[server] ROUND ACTIVE`);
}

function endRound(winnerId) {
  roundState = ROUND_END;
  roundWinnerId = winnerId; // string for Duel, comma-list for FFA top-5
  roundTimer = 6; // show results for 6s
  if (currentGameMode === MODE_DUEL && winnerId) {
    ensureScore(winnerId);
    scores.set(winnerId, scores.get(winnerId) + 1);
  }
  const lb = leaderboard();
  console.log(`[server] ROUND END — mode ${currentGameMode} winner ${winnerId?.slice(0,4)}, scores: ${JSON.stringify(Object.fromEntries(scores))}`);
  // Match over? (Duel: first to MATCH_WIN_SCORE round wins)
  if (currentGameMode === MODE_DUEL) {
    const matchWinner = lb.find((e) => e.score >= MATCH_WIN_SCORE);
    if (matchWinner) {
      roundState = ROUND_MATCH_END;
      roundTimer = 10;
      console.log(`[server] MATCH END — ${matchWinner.id.slice(0,4)} wins match`);
    }
  }
}

// ----------------------------------------------------------------- Player state
const players = new Map();

function createPlayer(id) {
  ensureScore(id);
  const spawn = players.size === 0 ? [0, 1, 10] : [0, 1, -10];
  return {
    id, pos: [...spawn], vel: [0, 0, 0], yaw: 0, pitch: 0,
    health: C.DEFAULT_HEALTH, maxHealth: C.DEFAULT_HEALTH,
    history: [], lastInput: null, lastSeen: now(), alive: true,
    lastPos: [...spawn],        // for speed validation
    lastFireTime: 0,            // for fire-rate validation
    kills: 0, deaths: 0,        // for TDM / FFA scoring
    currentWeapon: 'ASSAULT_RIFLE', // for Gun Game
  };
}

function recordHistory(p) {
  const t = now();
  p.history.push({ t, pos: [...p.pos] });
  const cutoff = t - POSITION_HISTORY_MS;
  while (p.history.length > 1 && p.history[0].t < cutoff) p.history.shift();
}

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
  if (players.has(id)) { ws.send(JSON.stringify({ type: 'error', code: 'id_taken' })); return; }
  const p = createPlayer(id);
  players.set(id, p);
  ws.playerId = id;
  ws.send(JSON.stringify({
    type: 'joined', playerId: id, spawn: p.pos, health: p.health,
    tickRate: NET.TICK_RATE, roundState, roundTimer,
    scores: Object.fromEntries(scores), matchWinScore: MATCH_WIN_SCORE,
    currentMap, gameMode: currentGameMode,
  }));
  console.log(`[server] player joined: ${id} (${players.size} total)`);
  // If we have 2 players and in lobby, start a round shortly
  if (players.size >= 2 && roundState === ROUND_LOBBY) startIntermission();
}

function handleInput(ws, payload) {
  const p = players.get(ws.playerId);
  if (!p) return;
  p.lastInput = {
    w: !!payload.w, a: !!payload.a, s: !!payload.s, d: !!payload.d,
    shift: !!payload.shift, crouch: !!payload.crouch, jump: !!payload.jump,
    yaw: payload.yaw, pitch: payload.pitch, t: payload.t || now(),
  };
  p.lastSeen = now();
}

function handleFire(ws, payload) {
  const shooter = players.get(ws.playerId);
  if (!shooter || !shooter.alive) return;
  if (roundState !== ROUND_ACTIVE) return;

  const weaponKey = payload.weaponKey || 'ASSAULT_RIFLE';
  const w = W[weaponKey];
  if (!w) return;

  // --- Ammo/fire-rate validation (spec §9.3) ---
  const nowMs = now();
  const minInterval = (w.fireCooldown || 0.1) * 1000;
  const jitterTolerance = 50; // ms
  if (nowMs - pLastFire(shooter) < minInterval - jitterTolerance) {
    // Dropping shot: firing faster than cooldown allows
    ws.send(JSON.stringify({ type: 'hit_rejected', reason: 'fire_rate' }));
    return;
  }
  setLastFire(shooter, nowMs);

  const clientLatency = Math.max(0, nowMs - (payload.t || nowMs));
  const rewindMs = Math.min(clientLatency, MAX_REWIND_MS);

  const hitTargetId = payload.hitTargetId;
  const hitPosition = payload.hitPosition;
  const origin = payload.origin;

  // Lag compensation: rewind target
  let targetPos = null;
  if (hitTargetId) {
    const target = players.get(hitTargetId);
    if (target) targetPos = rewindPosition(target, rewindMs);
  }

  // Sanity check distance
  if (targetPos) {
    const d = dist3(hitPosition, targetPos);
    if (d > 3.0) {
      ws.send(JSON.stringify({ type: 'hit_rejected', reason: 'hit_too_far' }));
      return;
    }
  }

  // Server re-raycast obstruction check
  const shooterPos = rewindPosition(shooter, rewindMs);
  const dir = [hitPosition[0]-shooterPos[0], hitPosition[1]-shooterPos[1], hitPosition[2]-shooterPos[2]];
  const len = Math.sqrt(dir[0]**2+dir[1]**2+dir[2]**2) || 1;
  const nDir = [dir[0]/len, dir[1]/len, dir[2]/len];
  const obstruction = serverRaycast(shooterPos, nDir);
  if (obstruction && obstruction.t < len - 0.5) {
    ws.send(JSON.stringify({ type: 'hit_rejected', reason: 'obstructed' }));
    return;
  }

  // Apply authoritative damage (falloff + headshot)
  const distMeters = dist3(shooterPos, hitPosition);
  const headshot = hitTargetId ? isHeadshotPoint(hitPosition, players.get(hitTargetId).pos) : false;
  const { damage: dmg } = computeDamage(w, distMeters, headshot);
  if (hitTargetId) {
    const target = players.get(hitTargetId);
    if (target && target.alive) {
      target.health = Math.max(0, target.health - dmg);
      console.log(`[server] ${shooter.id.slice(0,4)} ${headshot?'HEADSHOT ':''}hit ${target.id.slice(0,4)} for ${dmg} → ${target.health} (dist ${distMeters.toFixed(1)}m)`);
      ws.send(JSON.stringify({ type: 'hit_confirmed', targetId: hitTargetId, damage: dmg, targetHealth: target.health, headshot }));
      const tWs = Array.from(wsServer.clients).find(c => c.playerId === hitTargetId);
      if (tWs && tWs.readyState === WebSocket.OPEN)
        tWs.send(JSON.stringify({ type: 'damage_taken', damage: dmg, health: target.health, attackerId: shooter.id }));

      if (target.health <= 0) {
        target.alive = false;
        target.health = 0;
        target.deaths += 1;
        shooter.kills += 1;

        if (currentGameMode === MODE_DUEL) {
          // Round over: shooter wins the round
          endRound(shooter.id);
        } else if (currentGameMode === MODE_GUN_GAME) {
          // Cycle to next weapon on kill
          const keys = Object.keys(W);
          const idx = keys.indexOf(shooter.currentWeapon);
          shooter.currentWeapon = keys[(idx + 1) % keys.length];
          // Respawn shooter immediately
          target.health = target.maxHealth;
          target.alive = true;
          target.pos = [0, 1, 10];
          target.history = [];
        } else {
          // TDM / FFA: respawn victim, round continues until timer
          target.health = target.maxHealth;
          target.alive = true;
          target.pos = [0, 1, 10];
          target.history = [];
        }
      }
    }
  }
}

// ----------------------------------------------------------------- Simulation tick (20 Hz)
function simulate() {
  const dt = 1 / NET.TICK_RATE;

  // Round state machine transitions
  if (roundState === ROUND_INTERMISSION) {
    roundTimer -= dt;
    if (roundTimer <= 0) startRound();
  } else if (roundState === ROUND_ACTIVE) {
    roundTimer -= dt;
    // Apply player movement
    for (const p of players.values()) {
      if (!p.alive || !p.lastInput) continue;
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
        p.pos[0]+=move[0]*speed*dt; p.pos[1]+=move[1]*speed*dt; p.pos[2]+=move[2]*speed*dt;
      }
      p.yaw = input.yaw; p.pitch = input.pitch;

      // --- Server-side speed validation (spec §9.3) ---
      // Allow 1.5x tolerance; dash/slide exceptions handled by client prediction.
      const maxAllowed = M.SPRINT_SPEED * dt * NET.SERVER_MOVE_TOLERANCE;
      const disp = dist3(p.pos, p.lastPos);
      if (disp > maxAllowed) {
        // Rubber-band back to last known good position
        p.pos[0] = p.lastPos[0]; p.pos[1] = p.lastPos[1]; p.pos[2] = p.lastPos[2];
        console.log(`[server] speed violation ${p.id.slice(0,4)}: disp ${disp.toFixed(2)} > ${maxAllowed.toFixed(2)}, rubber-banded`);
      }
      p.lastPos[0] = p.pos[0]; p.lastPos[1] = p.pos[1]; p.lastPos[2] = p.pos[2];
    }
    recordAllHistory();
    // Round timeout
    if (roundTimer <= 0) {
      if (currentGameMode === MODE_TDM) {
        // Most kills wins the round
        const winner = Array.from(players.values()).reduce((a, b) => a.kills > b.kills ? a : b);
        endRound(winner ? winner.id : null);
      } else if (currentGameMode === MODE_FFA) {
        // Top 5 scorers win — mark round end, winners determined by kills
        const sorted = Array.from(players.values()).sort((a, b) => b.kills - a.kills);
        endRound(sorted.slice(0, 5).map(p => p.id).join(','));
      } else {
        endRound(null);
      }
    }
  } else if (roundState === ROUND_END) {
    roundTimer -= dt;
    if (roundTimer <= 0) {
      if (roundState !== ROUND_MATCH_END) startIntermission();
    }
  } else if (roundState === ROUND_MATCH_END) {
    roundTimer -= dt;
    if (roundTimer <= 0) startIntermission(); // rematch
  } else if (roundState === ROUND_LOBBY) {
    // waiting for players
  }
}

function recordAllHistory() {
  for (const p of players.values()) recordHistory(p);
}

// ----------------------------------------------------------------- Snapshot broadcast
function broadcastSnapshot(wsServer) {
  const snapshot = {
    type: 'snapshot', t: now(), roundState, roundTimer,
    scores: Object.fromEntries(scores), roundWinnerId,
    matchWinScore: MATCH_WIN_SCORE, currentMap, gameMode: currentGameMode,
    players: [],
  };
  for (const p of players.values()) {
    snapshot.players.push({
      id: p.id, pos: p.pos, yaw: p.yaw, pitch: p.pitch,
      health: p.health, alive: p.alive, kills: p.kills, deaths: p.deaths,
    });
  }
  const msg = JSON.stringify(snapshot);
  for (const client of wsServer.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
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
        case 'set_mode': currentGameMode = msg.mode || MODE_DUEL; console.log('[server] game mode set to', currentGameMode); break;
        default: console.log('[server] unknown message:', msg.type);
      }
    } catch (e) { console.error('[server] bad message:', e.message); }
  });
  ws.on('close', () => {
    if (ws.playerId) {
      players.delete(ws.playerId);
      scores.delete(ws.playerId);
      console.log(`[server] player left: ${ws.playerId} (${players.size} total)`);
      if (players.size < 2 && roundState !== ROUND_LOBBY) {
        roundState = ROUND_LOBBY;
        console.log('[server] not enough players, back to LOBBY');
      }
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
