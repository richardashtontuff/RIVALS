/**
 * RIVALS (Web Edition) — client entry point + CombatSystem + Networking.
 *
 * Phase 3: client integrates with the authoritative WebSocket server (spec §7).
 * - Client raycasts locally → immediate hitmarker/audio (spec §7)
 * - Client sends fire result to server for validation + lag compensation
 * - Sends input each fixed tick; receives authoritative snapshots
 * - Client-side prediction + server reconciliation
 * - Renders remote players from snapshots
 *
 * Weapon/loadout (spec §4) and movement (spec §3) retained from Phases 1-2.
 */
import * as THREE from 'three';
import { CONFIG, STARTER_LOADOUT, DEFAULT_LOADOUT } from './config.js';
import { MovementController } from './MovementController.js';
import {
  validateLoadout, weaponForSlot, DEFAULT_LOADOUT as LOADOUT_DEFAULT,
} from './LoadoutSystem.js';

const W = CONFIG.WEAPONS;
const M = CONFIG.MOVEMENT;
const C = CONFIG.COMBAT;
const NET = CONFIG.NETWORK;
const UI = CONFIG.UI;

const WS_URL = `ws://${window.location.hostname}:5074`;

// ------------------------------------------------------------------ Validate starter
const starterCheck = validateLoadout(STARTER_LOADOUT);
if (!starterCheck.valid) {
  console.error('Starter loadout invalid:', starterCheck.reason);
}

// ------------------------------------------------------------------ DOM
const canvasEl = document.getElementById('canvas');
const crosshairEl = document.getElementById('crosshair');
const crosshairDot = crosshairEl.querySelector('.dot');
const lockEl = document.getElementById('lock');
const ammoEl = document.getElementById('ammo');
const hpEl = document.getElementById('hp');

const infoEl = document.createElement('div');
infoEl.id = 'info';
Object.assign(infoEl.style, {
  position: 'absolute', top: '10px', left: '10px', color: '#fff',
  fontSize: '0.9rem', pointerEvents: 'none', userSelect: 'none', lineHeight: '1.4',
  textShadow: '0 0 4px #000',
});
document.body.appendChild(infoEl);

const slotLabels = document.createElement('div');
slotLabels.id = 'slotLabels';
Object.assign(slotLabels.style, {
  position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)',
  color: '#fff', fontSize: '0.85rem', pointerEvents: 'none', userSelect: 'none',
  textShadow: '0 0 6px rgba(0,0,0,0.8)', display: 'flex', gap: '16px',
});
document.body.appendChild(slotLabels);

const netStatus = document.createElement('div');
netStatus.id = 'netStatus';
Object.assign(netStatus.style, {
  position: 'absolute', top: '10px', right: '10px', color: '#ff4444',
  fontSize: '0.85rem', pointerEvents: 'none', userSelect: 'none',
  textShadow: '0 0 6px rgba(0,0,0,0.8)',
});
netStatus.textContent = 'connecting to server...';
document.body.appendChild(netStatus);

// Round state UI (spec §1)
const roundUI = document.createElement('div');
roundUI.id = 'roundUI';
Object.assign(roundUI.style, {
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  color: '#fff', fontSize: '1.5rem', pointerEvents: 'none', userSelect: 'none',
  textShadow: '0 0 10px rgba(0,0,0,0.9)', textAlign: 'center', display: 'none',
});
const roundStateEl = document.createElement('div');
roundStateEl.id = 'roundStateEl';
const roundTimerEl = document.createElement('div');
roundTimerEl.id = 'roundTimerEl';
const roundScoreEl = document.createElement('div');
roundScoreEl.id = 'roundScoreEl';
roundScoreEl.style.fontSize = '1rem';
roundScoreEl.style.opacity = '0.85';
const roundMatchEl = document.createElement('div');
roundMatchEl.id = 'roundMatchEl';
roundMatchEl.style.fontSize = '0.95rem';
roundMatchEl.style.marginTop = '6px';
roundUI.appendChild(roundStateEl);
roundUI.appendChild(roundTimerEl);
roundUI.appendChild(roundScoreEl);
roundUI.appendChild(roundMatchEl);
document.body.appendChild(roundUI);

// ------------------------------------------------------------------ Three.js
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8e8e8);
scene.fog = new THREE.Fog(0xe8e8e8, 40, 110);

const camera = new THREE.PerspectiveCamera(UI.FOV, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
canvasEl.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(15, 30, 10);
dirLight.castShadow = true;
scene.add(dirLight);

// ------------------------------------------------------------------ World
const world = new THREE.Group();
scene.add(world);

const floorMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7 });

const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.name = 'floor';
world.add(floor);

function addWall(x, y, z, w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  m.position.set(x, y, z);
  m.name = 'wall';
  world.add(m);
  return m;
}
addWall(0, 6, -60, 120, 12, 2);
addWall(0, 6, 60, 120, 12, 2);
addWall(-60, 6, 0, 2, 12, 120);
addWall(60, 6, 0, 2, 12, 120);

const cover = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), wallMat);
cover.position.set(0, 2, 0);
cover.name = 'cover';
world.add(cover);

const dummy = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: 0xff4444 }));
dummy.position.set(18, 1, 22);
dummy.name = 'dummy';
dummy.userData = { health: 100, type: 'dummy' };
world.add(dummy);

const raycaster = new THREE.Raycaster();

// ------------------------------------------------------------------ Networking (spec §7)
let socket = null;
let myPlayerId = null;
let myLatency = 0;
const remotePlayers = new Map(); // id -> {mesh, pos, targetPos, health}

function connect() {
  socket = new WebSocket(WS_URL);
  socket.binaryType = 'arraybuffer';
  socket.onopen = () => {
    netStatus.textContent = 'server connected';
    netStatus.style.color = '#44ff44';
    socket.send(JSON.stringify({ type: 'join', clientId: myPlayerId || undefined }));
  };
  socket.onclose = () => {
    netStatus.textContent = 'server disconnected (reconnecting)';
    netStatus.style.color = '#ff4444';
    setTimeout(connect, 1500);
  };
  socket.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }
    switch (msg.type) {
      case 'joined':
        myPlayerId = msg.playerId;
        mc.position.set(msg.spawn[0], msg.spawn[1], msg.spawn[2]);
        netStatus.textContent = `server • id ${myPlayerId.slice(0,4)}`;
        netStatus.style.color = '#44ff44';
        break;
      case 'snapshot':
        onSnapshot(msg);
        break;
      case 'hit_confirmed':
        showHitmarker();
        infoEl.textContent = `hit ${msg.targetId.slice(0,4)} for ${msg.damage}`;
        break;
      case 'damage_taken':
        C.DEFAULT_HEALTH = Math.max(0, msg.health);
        hpEl.textContent = `HP ${C.DEFAULT_HEALTH}`;
        if (msg.health <= 0) {
          myAlive = false;
          netStatus.textContent = 'eliminated — awaiting next round';
        }
        break;
      case 'hit_rejected':
        console.log('[net] fire rejected:', msg.reason);
        break;
      case 'elimination':
        if (msg.victimId === myPlayerId) {
          netStatus.textContent = 'eliminated';
        }
        break;
      case 'error':
        netStatus.textContent = `error: ${msg.code}`;
        break;
    }
  };
  socket.onerror = () => {
    netStatus.textContent = 'server error';
    netStatus.style.color = '#ff4444';
  };
}
connect();

let roundState = 'LOBBY';
let roundTimer = 0;
const scores = {};
let matchWinScore = 5;
let roundWinnerId = null;
let myAlive = true;

function updateRoundUI() {
  roundUI.style.display = 'block';
  let stateText = roundState;
  if (roundState === 'ROUND_ACTIVE') stateText = 'ROUND ACTIVE';
  else if (roundState === 'ROUND_INTERMISSION') stateText = 'INTERMISSION';
  else if (roundState === 'ROUND_END') stateText = roundWinnerId === myPlayerId ? 'ROUND WON' : 'ROUND LOST';
  else if (roundState === 'ROUND_MATCH_END') stateText = 'MATCH END';
  else if (roundState === 'LOBBY') stateText = 'LOBBY';
  roundStateEl.textContent = stateText;
  roundTimerEl.textContent = `round timer: ${Math.ceil(roundTimer)}s`;
  const lb = leaderboard();
  roundScoreEl.textContent = lb.map(e => `${e.id.slice(0,4)}: ${e.score}`).join('  ');
  // Match point / sudden death indicators (spec §1: network-replicated)
  let matchText = '';
  if (roundState === 'ROUND_MATCH_END') {
    matchText = 'MATCH OVER';
  } else {
    const me = scores[myPlayerId] || 0;
    const opponent = Math.max(...Object.values(scores).filter((_,i)=>true));
    if (me >= matchWinScore - 1) matchText = 'MATCH POINT';
    if (me === opponent && me >= matchWinScore - 1) matchText = 'SUDDEN DEATH';
  }
  roundMatchEl.textContent = matchText;
  // Visual indicators per spec §1
  if (matchText === 'SUDDEN DEATH') {
    roundMatchEl.style.color = '#ff0000';
    document.body.style.background = 'rgba(255,0,0,0.15)';
  } else if (me >= matchWinScore - 1) {
    roundMatchEl.style.color = '#ffaa00';
    document.body.style.background = '';
  } else {
    roundMatchEl.style.color = '#aaa';
    document.body.style.background = '';
  }
}

function leaderboard() {
  return Object.entries(scores).map(([id, s]) => ({ id, score: s })).sort((a, b) => b.score - a.score);
}

function onSnapshot(msg) {
  roundState = msg.roundState || roundState;
  roundTimer = msg.roundTimer;
  roundWinnerId = msg.roundWinnerId;
  matchWinScore = msg.matchWinScore || 5;
  Object.assign(scores, msg.scores || {});
  const nowTs = msg.t;
  const incomingIds = new Set();
  for (const p of msg.players) {
    incomingIds.add(p.id);
    if (p.id === myPlayerId) {
      // Server reconciliation: authoritative position (with light interpolation)
      mc.position.set(p.pos[0], p.pos[1], p.pos[2]);
      mc.yaw = p.yaw || mc.yaw;
      mc.pitch = p.pitch || mc.pitch;
      myAlive = p.alive;
      if (!myAlive) netStatus.textContent = 'eliminated — awaiting next round';
      continue;
    }
    let entry = remotePlayers.get(p.id);
    if (!entry) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.7, 0.7),
        new THREE.MeshStandardMaterial({ color: 0x4488ff })
      );
      mesh.userData = { playerId: p.id, type: 'player', health: p.health };
      scene.add(mesh);
      entry = { mesh, id: p.id };
      remotePlayers.set(p.id, entry);
    }
    entry.mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    entry.mesh.userData.health = p.health;
    entry.mesh.visible = p.health > 0;
  }
  // Remove players no longer in snapshot
  for (const [id, entry] of remotePlayers) {
    if (!incomingIds.has(id)) {
      scene.remove(entry.mesh);
      remotePlayers.delete(id);
    }
  }
  updateRoundUI();
}

function sendInput() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    type: 'input',
    t: now(),
    w: input.w, a: input.a, s: input.s, d: input.d,
    shift: input.shift, crouch: input.crouch, jump: input.jump,
    yaw: mc.yaw, pitch: mc.pitch,
  }));
}

function sendFire(weaponKey, origin, direction, hitTargetId, hitPosition) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    type: 'fire',
    t: now(),
    weaponKey,
    origin: [origin.x, origin.y, origin.z],
    direction: [direction.x, direction.y, direction.z],
    hitTargetId,
    hitPosition: hitPosition ? [hitPosition.x, hitPosition.y, hitPosition.z] : null,
  }));
}

function now() { return performance.now(); }

// ------------------------------------------------------------------ Input
const input = {
  w: false, a: false, s: false, d: false,
  shift: false, crouch: false, jump: false, dash: false,
  reload: false, fire: false, slot: null,
};
const _onKey = (code, down) => {
  if (code === 'KeyW') input.w = down;
  else if (code === 'KeyA') input.a = down;
  else if (code === 'KeyS') input.s = down;
  else if (code === 'KeyD') input.d = down;
  else if (code === 'ShiftLeft') input.shift = down;
  else if (code === 'ControlLeft' || code === 'KeyC') input.crouch = down;
  else if (code === 'Space') input.jump = down;
  else if (code === 'KeyQ') input.dash = down;
  else if (code === 'KeyR') input.reload = down;
  else if (code === 'Digit1' || code === 'Numpad1') input.slot = 1;
  else if (code === 'Digit2' || code === 'Numpad2') input.slot = 2;
  else if (code === 'Digit3' || code === 'Numpad3') input.slot = 3;
  else if (code === 'Digit4' || code === 'Numpad4') input.slot = 4;
};
window.addEventListener('keydown', (e) => { _onKey(e.code, true); });
window.addEventListener('keyup', (e) => { _onKey(e.code, false); if (e.code.startsWith('Digit') || e.code.startsWith('Numpad')) input.slot = null; });

window.addEventListener('mousedown', () => { if (document.pointerLockElement === canvasEl) input.fire = true; });
window.addEventListener('mouseup', () => { input.fire = false; });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvasEl) {
    mc.yaw -= e.movementX * 0.002;
    mc.pitch -= e.movementY * 0.002;
  }
});
canvasEl.addEventListener('click', () => {
  if (!document.pointerLockElement) canvasEl.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvasEl;
  lockEl.style.display = locked ? 'none' : 'block';
  crosshairEl.style.opacity = locked ? '1' : '0';
});

// ------------------------------------------------------------------ Movement
const mc = new MovementController();
mc.position.set(0, M.STAND_HEIGHT / 2, 10);

// ------------------------------------------------------------------ Player / loadout state
let loadout = { ...STARTER_LOADOUT };
let currentSlot = 1;
const ammoState = {};

function ammoFor(key) {
  if (!ammoState[key]) {
    const w = W[key];
    ammoState[key] = { mag: w.ammoMag, reserve: w.ammoReserve };
  }
  return ammoState[key];
}
function currentWeaponKey() {
  const slots = { 1: 'primary', 2: 'secondary', 3: 'melee', 4: 'utility' };
  return loadout[slots[currentSlot]];
}
function currentWeapon() { return W[currentWeaponKey()]; }

function setSlot(slot) {
  if (slot < 1 || slot > 4) return;
  currentSlot = slot;
  const w = currentWeapon();
  const key = currentWeaponKey();
  const am = ammoState[key];
  if (W[key].ammoMag < 0) {
    ammoEl.textContent = '∞';
  } else if (am) {
    ammoEl.textContent = `${am.mag} / ${am.reserve}`;
  }
  updateSlotsUI();
  infoEl.innerHTML = `<div style="font-weight:700">${w.name}</div>` +
    `<div style="opacity:0.7">${w.category} • ${w.tier}</div>`;
}
function updateSlotsUI() {
  const slots = { 1: 'primary', 2: 'secondary', 3: 'melee', 4: 'utility' };
  slotLabels.innerHTML = Object.entries(slots).map(([num, cat]) => {
    const key = loadout[cat];
    const w = W[key];
    const active = parseInt(num) === currentSlot ? ' <b>[ACTIVE]</b>' : '';
    return `${num}. ${w.name}${active}`;
  }).join('  ');
}
setSlot(1);

// ------------------------------------------------------------------ Reload / fire state
let lastFire = 0;
let reloading = false;
let reloadTimer = null;
let reloadWeaponKey = null;

function startReload() {
  const key = currentWeaponKey();
  const w = W[key];
  if (!w || w.ammoMag < 0) return;
  if (reloading && reloadWeaponKey === key) return;
  const am = ammoState[key];
  if (am.mag >= w.ammoMag) return;
  reloading = true;
  reloadWeaponKey = key;
  if (reloadTimer) clearTimeout(reloadTimer);
  const refillMs = w.reloadTime * 600;
  reloadTimer = setTimeout(() => {
    const am2 = ammoState[key];
    const need = w.ammoMag - am2.mag;
    const take = Math.min(need, am2.reserve);
    am2.mag += take;
    am2.reserve -= take;
    if (key === currentWeaponKey()) {
      if (w.ammoMag < 0) ammoEl.textContent = '∞';
      else ammoEl.textContent = `${am2.mag} / ${am2.reserve}`;
    }
    reloadTimer = null;
    reloading = false;
    reloadWeaponKey = null;
  }, refillMs);
}
function cancelReload() {
  if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }
  reloading = false;
  reloadWeaponKey = null;
}

function fireWeapon() {
  // Only fire during an active round and while alive (spec §1 round state)
  if (roundState !== 'ROUND_ACTIVE' || !myAlive) return;
  const key = currentWeaponKey();
  const w = W[key];
  if (!w) return;
  const nowMs = now();
  if (nowMs - lastFire < w.fireCooldown * 1000) return;
  if (reloading) return;
  const am = ammoState[key];
  if (w.ammoMag >= 0 && am.mag <= 0) { startReload(); return; }
  lastFire = nowMs;
  if (w.ammoMag >= 0) {
    am.mag -= 1;
    if (key === currentWeaponKey()) {
      ammoEl.textContent = `${am.mag} / ${am.reserve}`;
    }
  }

  const eye = new THREE.Vector3().copy(mc.position);
  eye.y += mc.height - M.CAMERA_Y_OFFSET;
  camera.position.copy(eye);
  camera.rotation.set(mc.pitch, mc.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();

  const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(mc.pitch, mc.yaw, 0, 'YXZ'));
  raycaster.set(eye, direction);
  raycaster.far = w.range || C.MAX_RANGE;
  const hits = raycaster.intersectObjects(world.children, true);

  // Remote players are in scene, not world — check them separately.
  let hitObject = null;
  let hitPoint = null;
  let hitTargetId = null;
  if (hits.length) {
    hitObject = hits[0].object;
    hitPoint = hits[0].point;
    // Check if it's a remote player mesh
    let t = hitObject;
    while (t && !t.userData.playerId) t = t.parent;
    if (t) hitTargetId = t.userData.playerId;
  } else {
    // Check remote players directly
    for (const [id, entry] of remotePlayers) {
      if (entry.mesh.userData.health <= 0) continue;
      const box = new THREE.Box3().setFromObject(entry.mesh);
      const rayHits = raycaster.intersectBox(box, new THREE.Vector3());
      if (rayHits) { hitObject = entry.mesh; hitPoint = rayHits; hitTargetId = id; break; }
    }
  }

  // Immediate local hitmarker (spec §7: client registers instantly)
  showHitmarker();
  if (hitPoint) {
    const dmg = damageAtRange(w, eye.distanceTo(hitPoint));
    applyDamage(hitObject, dmg, hitPoint);
  }

  // Send to server for authoritative validation (spec §7)
  sendFire(key, eye, direction, hitTargetId, hitPoint);

  if (w.ammoMag >= 0 && am.mag <= 0) startReload();
}

function damageAtRange(w, distMeters) {
  if (w.noFalloff) return w.damage.start;
  const range = w.range || 100;
  const t = Math.min(1, distMeters / range);
  return w.damage.start + (w.damage.end - w.damage.start) * t;
}

function applyDamage(obj, dmg, point) {
  if (!obj) return;
  let target = obj;
  while (target && target.userData.health === undefined && target.parent) target = target.parent;
  if (target.userData.health !== undefined) {
    target.userData.health = Math.max(0, target.userData.health - dmg);
    if (target.userData.health <= 0) {
      target.visible = false;
      setTimeout(() => { target.visible = true; target.userData.health = 100; }, 3000);
    }
  }
}

function showHitmarker() {
  const prev = crosshairDot.style.background;
  crosshairDot.style.background = '#ffffff';
  setTimeout(() => { crosshairDot.style.background = prev; }, C.HITMARKER_DURATION_MS);
}

// ------------------------------------------------------------------ HUD / render loop
const FIXED_DT = 1 / 60;
let lastTime = performance.now();
let accumulator = 0;
let lastInputSend = 0;

function updateHUD() {
  hpEl.textContent = `HP ${Math.max(0, C.DEFAULT_HEALTH)}`;
  updateSlotsUI();
}

function frame(now) {
  requestAnimationFrame(frame);

  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  accumulator += dt;

  while (accumulator >= FIXED_DT) {
    mc.update(FIXED_DT, input, now);
    accumulator -= FIXED_DT;
  }

  // Send input to server at server tick rate
  if (now - lastInputSend >= NET.TICK_INTERVAL_MS) {
    sendInput();
    lastInputSend = now;
  }

  // Slot switching (reload-cancel: switching to Fists cancels active reload)
  if (input.slot) {
    const key = currentWeaponKey();
    if (input.slot === 3 && key === 'FISTS' && reloading && reloadTimer) {
      cancelReload();
    }
    setSlot(input.slot);
    input.slot = null;
  }

  if (input.fire && document.pointerLockElement === canvasEl) fireWeapon();
  if (input.reload) startReload();

  const eye = new THREE.Vector3().copy(mc.position);
  eye.y += mc.height - M.CAMERA_Y_OFFSET;
  camera.position.copy(eye);
  camera.rotation.set(mc.pitch, mc.yaw, 0, 'YXZ');

  renderer.render(scene, camera);
  updateHUD();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(frame);
