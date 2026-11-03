/**
 * RIVALS (Web Edition) — client entry point.
 *
 * Phases 1-3 complete:
 *   §1 Round state machine (client UI + server authority)
 *   §3 Movement (60 Hz kinematic controller)
 *   §4 Weapon & loadout system (4-slot, all stats, reload-cancel)
 *   §7 Networking (authoritative WS, lag compensation, hit validation)
 *
 * Weapon special behaviors handled by WeaponSystem:
 *   Katana deflection, Scythe dash-melee, Spear throw, Exogun AOE,
 *   Permafrost slow/freeze, Energy Rifle wall bounces, utility effects.
 */
import * as THREE from '/node_modules/three/build/three.module.js';
import { CONFIG, STARTER_LOADOUT, DEFAULT_LOADOUT } from './config.js';
import { mapPreviewPath } from './MapCatalog.js';
import { MovementController } from './MovementController.js';
import { validateLoadout, DEFAULT_LOADOUT as LOADOUT_DEFAULT } from './LoadoutSystem.js';
import { WeaponSystem } from './WeaponSystem.js';
import { MAP_METADATA, buildProceduralMap, checkLava, checkScanner, shootWindow, isBigMap } from './MapSystem.js';

// ------------------------------------------------------------------ Visible error display
const errBox = document.createElement('div');
errBox.id = 'jsError';
Object.assign(errBox.style, {
  position: 'fixed', top: '10px', left: '10px', right: '10px',
  color: '#fff', background: 'rgba(200, 0, 0, 0.9)', padding: '12px',
  fontFamily: 'monospace', fontSize: '13px', zIndex: 9999, display: 'none',
  borderRadius: '4px', lineHeight: '1.4',
});
document.body.appendChild(errBox);
function showError(msg) {
  errBox.style.display = 'block';
  errBox.textContent = 'ERROR: ' + msg;
  console.error(msg);
}
window.addEventListener('error', (e) => showError(e.message || e.error || String(e)));
window.addEventListener('unhandledrejection', (e) => showError(String(e.reason || e)));

// Script running diagnostic - bright green if JS executes
document.body.style.background = '#00aa00';
document.body.style.transition = 'none';

// ------------------------------------------------------------------ WebGL diagnostic
const webglTest = document.createElement('canvas');
const gl = webglTest.getContext('webgl') || webglTest.getContext('experimental-webgl');
if (!gl) {
  showError('WebGL not supported in this browser');
}
console.log('WebGL supported:', !!gl);

const W = CONFIG.WEAPONS;
const M = CONFIG.MOVEMENT;
const C = CONFIG.COMBAT;
const NET = CONFIG.NETWORK;
const UI = CONFIG.UI;

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const port = window.location.port ? `:${window.location.port}` : '';
const WS_URL = `${protocol}//${window.location.hostname}${port}`;

// ------------------------------------------------------------------ Validate starter
const starterCheck = validateLoadout(STARTER_LOADOUT);
if (!starterCheck.valid) {
  console.error('Starter loadout invalid:', starterCheck.reason);
}

// ------------------------------------------------------------------ DOM
const canvasEl = document.getElementById('canvas');
const crosshairEl = document.getElementById('crosshair');
const crosshairDot = crosshairEl?.querySelector('.dot');
const lockEl = document.getElementById('lock');
const ammoEl = document.getElementById('ammo');
const hpEl = document.getElementById('hp');

const missingEls = [];
if (!canvasEl) missingEls.push('#canvas');
if (!crosshairEl) missingEls.push('#crosshair');
if (!lockEl) missingEls.push('#lock');
if (!ammoEl) missingEls.push('#ammo');
if (!hpEl) missingEls.push('#hp');
if (missingEls.length > 0) {
  showError('Missing DOM elements: ' + missingEls.join(', '));
}

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
const roundTimerEl = document.createElement('div');
const roundScoreEl = document.createElement('div');
roundScoreEl.style.fontSize = '1rem';
roundScoreEl.style.opacity = '0.85';
const roundMatchEl = document.createElement('div');
roundMatchEl.style.fontSize = '0.95rem';
roundMatchEl.style.marginTop = '6px';
roundUI.appendChild(roundStateEl);
roundUI.appendChild(roundTimerEl);
roundUI.appendChild(roundScoreEl);
roundUI.appendChild(roundMatchEl);
document.body.appendChild(roundUI);

// Map vote UI (spec §1 / §5) - shown during Intermission
const mapVoteUI = document.createElement('div');
mapVoteUI.id = 'mapVoteUI';
Object.assign(mapVoteUI.style, {
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  color: '#fff', fontSize: '1.2rem', pointerEvents: 'auto', userSelect: 'none',
  textShadow: '0 0 10px rgba(0,0,0,0.9)', textAlign: 'center', display: 'none',
  background: 'rgba(0,0,0,0.88)', padding: '1rem', borderRadius: '8px',
  width: 'min(1000px, 96vw)', maxHeight: '86vh', overflowY: 'auto', zIndex: 20,
});
const mapVoteTitle = document.createElement('div');
mapVoteTitle.style.fontSize = '1.5rem';
mapVoteTitle.style.fontWeight = '700';
mapVoteTitle.style.marginBottom = '1rem';
mapVoteTitle.textContent = 'MAP VOTE';
const mapVoteButtons = document.createElement('div');
mapVoteButtons.style.display = 'flex';
mapVoteButtons.style.flexWrap = 'wrap';
mapVoteButtons.style.gap = '0.5rem';
mapVoteButtons.style.justifyContent = 'center';
mapVoteUI.appendChild(mapVoteTitle);
mapVoteUI.appendChild(mapVoteButtons);
document.body.appendChild(mapVoteUI);

// Flashbang blind overlay
const blindOverlay = document.createElement('div');
blindOverlay.id = 'blindOverlay';
Object.assign(blindOverlay.style, {
  position: 'fixed', inset: '0', background: 'rgba(255,255,255,0)',
  pointerEvents: 'none', zIndex: 50, transition: 'background 0.1s linear',
});
document.body.appendChild(blindOverlay);

// ------------------------------------------------------------------ Three.js
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8e8e8);
scene.fog = new THREE.Fog(0xe8e8e8, 40, 110);

const camera = new THREE.PerspectiveCamera(UI.FOV, window.innerWidth / window.innerHeight, 0.1, 1000);

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvasEl.appendChild(renderer.domElement);
  console.log('Three.js renderer created, canvas appended');
} catch (e) {
  showError('Three.js renderer failed: ' + e.message);
  renderer = null;
}

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

// ------------------------------------------------------------------ Performance: InstancedMesh + LOD (spec §9.3)
// InstancedMesh for repeated static geometry (crates/barriers)
function buildInstancedCrates(count, spacing) {
  const crateGeo = new THREE.BoxGeometry(2, 2, 2);
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
  const instanced = new THREE.InstancedMesh(crateGeo, crateMat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const x = (i % 6) * spacing - spacing * 2.5;
    const z = Math.floor(i / 6) * spacing - spacing * 2.5;
    dummy.position.set(x, 1, z);
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);
  }
  instanced.name = 'instanced_crates';
  instanced.count = count;
  world.add(instanced);
  return instanced;
}

// LOD: high→low poly at distance
function buildLODModel() {
  const highGeo = new THREE.BoxGeometry(2, 4, 2);
  const medGeo = new THREE.BoxGeometry(1.5, 3, 1.5);
  const lowGeo = new THREE.BoxGeometry(1, 2, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
  const lod = new THREE.LOD();
  lod.addLevel(new THREE.Mesh(highGeo, mat), 0);
  lod.addLevel(new THREE.Mesh(medGeo, mat), 20);
  lod.addLevel(new THREE.Mesh(lowGeo, mat), 50);
  lod.name = 'lod_model';
  lod.position.set(25, 2, 25);
  world.add(lod);
  return lod;
}

buildInstancedCrates(36, 6);
buildLODModel();

// ------------------------------------------------------------------ Map (spec §5)
let currentMapName = null;
let mapMechanics = null;
let mapGroup = null;

function loadMap(mapName) {
  if (!MAP_METADATA[mapName] || mapName === currentMapName) return;
  if (mapGroup) {
    world.remove(mapGroup);
    const geometries = new Set();
    const materials = new Set();
    mapGroup.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  }
  mapGroup = new THREE.Group();
  world.add(mapGroup);
  currentMapName = mapName;
  const result = buildProceduralMap(mapName, scene, mapGroup);
  mapMechanics = result.mechanics;
  infoEl.textContent = `Map: ${mapName}` + (isBigMap(mapName) ? ' (BIG)' : '');
}
loadMap('Arena');

// ------------------------------------------------------------------ Networking (spec §7)
let socket = null;
let myPlayerId = null;
let myLatency = 0;
let playerHealth = C.DEFAULT_HEALTH;
const remotePlayers = new Map(); // id -> {mesh, health}

function connect() {
  socket = new WebSocket(WS_URL);
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
        mapPool = msg.mapPool || mapPool;
        mapVotes = msg.mapVotes || mapVotes;
        loadMap(msg.currentMap);
        netStatus.textContent = `server • id ${myPlayerId.slice(0,4)}`;
        netStatus.style.color = '#44ff44';
        break;
      case 'snapshot':
        onSnapshot(msg);
        if (msg.keys !== undefined) setKeys(msg.keys);
        break;
      case 'hit_confirmed':
        showHitmarker();
        infoEl.textContent = `${msg.headshot ? 'HEADSHOT ' : ''}hit ${msg.targetId.slice(0,4)} for ${msg.damage}`;
        if (msg.headshot) weaponSystem.applyFlashbang(0);
        break;
      case 'damage_taken':
        playerHealth = Math.max(0, msg.health);
        hpEl.textContent = `HP ${playerHealth}`;
        if (msg.health <= 0) myAlive = false;
        break;
      case 'slowed':
        weaponSystem.slowPlayer(msg.playerId, msg.duration, msg.factor);
        break;
      case 'frozen':
        weaponSystem.freezePlayer(msg.playerId, msg.duration);
        break;
      case 'hit_rejected':
        console.log('[net] fire rejected:', msg.reason);
        break;
      case 'elimination':
        if (msg.victimId === myPlayerId) netStatus.textContent = 'eliminated';
        if (msg.attackerId) addKillfeed(msg.attackerId, msg.victimId);
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

function onSnapshot(msg) {
  const previousRoundState = roundState;
  roundState = msg.roundState || roundState;
  if (roundState === 'INTERMISSION' && previousRoundState !== 'INTERMISSION') {
    hasVoted = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  loadMap(msg.currentMap);
  roundTimer = msg.roundTimer;
  roundWinnerId = msg.roundWinnerId;
  matchWinScore = msg.matchWinScore || 5;
  Object.assign(scores, msg.scores || {});
  mapPool = msg.mapPool || mapPool;
  mapVotes = msg.mapVotes || mapVotes;
  // Update local player keys from snapshot
  const me = msg.players.find(p => p.id === myPlayerId);
  if (me && me.keys !== undefined) setKeys(me.keys);
  if (me && Number.isFinite(me.health)) playerHealth = me.health;

  // Apply server-confirmed status effects
  if (msg.effects) {
    for (const e of msg.effects) {
      if (e.type === 'slow') weaponSystem.slowPlayer(e.target, e.duration, e.factor);
      if (e.type === 'freeze') weaponSystem.freezePlayer(e.target, e.duration);
    }
  }

  const incomingIds = new Set();
  for (const p of msg.players) {
    incomingIds.add(p.id);
    if (p.id === myPlayerId) {
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
    // Permafrost slow visual tint
    if (weaponSystem.isFrozen(p.id, msg.t)) {
      entry.mesh.material.color.set(0x00ffff);
    } else if (weaponSystem.slowFactorFor(p.id, msg.t) < 1) {
      entry.mesh.material.color.set(0xaaaaaa);
    } else {
      entry.mesh.material.color.set(0x4488ff);
    }
  }
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
    type: 'input', t: now(),
    w: input.w, a: input.a, s: input.s, d: input.d,
    shift: input.shift, crouch: input.crouch, jump: input.jump,
    yaw: mc.yaw, pitch: mc.pitch,
  }));
}

function sendFire(weaponKey, origin, direction, hitTargetId, hitPosition) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    type: 'fire', t: now(), weaponKey,
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
  if (!document.pointerLockElement && roundState !== 'INTERMISSION') canvasEl.requestPointerLock();
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
  const slots = { 1: 'Primary', 2: 'Secondary', 3: 'Melee', 4: 'Utility' };
  return loadout[slots[currentSlot]];
}
function currentWeapon() { return W[currentWeaponKey()]; }

function setSlot(slot) {
  if (slot < 1 || slot > 4) return;
  const key = currentWeaponKey();
  const w = W[key];
  // Reload-cancel: switching to Fists cancels active reload (spec §3)
  if (slot === 3 && key === 'FISTS' && reloading && reloadTimer) {
    cancelReload();
  }
  currentSlot = slot;
  const w2 = currentWeapon();
  const am = ammoState[currentWeaponKey()];
  if (W[currentWeaponKey()].ammoMag < 0) {
    ammoEl.textContent = '∞';
  } else if (am) {
    ammoEl.textContent = `${am.mag} / ${am.reserve}`;
  }
  updateSlotsUI();
  infoEl.innerHTML = `<div style="font-weight:700">${w2.name}</div>` +
    `<div style="opacity:0.7">${w2.category} • ${w2.tier}</div>`;
}
function updateSlotsUI() {
  const slots = { 1: 'Primary', 2: 'Secondary', 3: 'Melee', 4: 'Utility' };
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

// ------------------------------------------------------------------ WeaponSystem (spec §4 special behaviors)
const weaponSystem = new WeaponSystem(mc, scene, world, {
  applyDamage: (target, dmg, point) => {
    // local dummy / world damage (server is authoritative for players)
    let t = target;
    while (t && t.userData.health === undefined && t.parent) t = t.parent;
    if (t && t.userData.health !== undefined) {
      t.userData.health = Math.max(0, t.userData.health - dmg);
      if (t.userData.health <= 0) {
        t.visible = false;
        setTimeout(() => { t.visible = true; t.userData.health = 100; }, 3000);
      }
    }
  },
  spawnTracer: (start, end) => {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, start.distanceTo(end)),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    line.position.copy(start).add(end).multiplyScalar(0.5);
    line.lookAt(end);
    scene.add(line);
    setTimeout(() => scene.remove(line), 60);
  },
  spawnExplosion: (center, damage) => {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6 })
    );
    sphere.position.copy(center);
    scene.add(sphere);
    world.traverse((obj) => {
      if (obj.userData.health !== undefined) {
        const d = obj.position.distanceTo(center);
        if (d < 5) {
          obj.userData.health = Math.max(0, obj.userData.health - Math.max(0, damage - d * 10));
        }
      }
    });
    setTimeout(() => scene.remove(sphere), 400);
  },
  sendFire: (weaponKey, origin, direction, hitTargetId, hitPosition) => {
    sendFire(weaponKey, origin, direction, hitTargetId, hitPosition);
  },
  getRemotePlayers: () => remotePlayers,
});

// ------------------------------------------------------------------ Kill feed (spec §8.4)
const killfeedEl = document.getElementById('killfeed');
const killfeed = [];
function addKillfeed(attacker, victim) {
  killfeed.unshift({ attacker, victim, t: now() });
  if (killfeed.length > 6) killfeed.pop();
  renderKillfeed();
}
function renderKillfeed() {
  const t = now();
  killfeedEl.innerHTML = killfeed
    .filter((e) => t - e.t < 5000)
    .map((e) => `<div style="margin:2px 0"><span style="color:#44ff44">${e.attacker.slice(0,4)}</span> <span style="color:#888">eliminated</span> <span style="color:#ff4444">${e.victim.slice(0,4)}</span></div>`)
    .join('');
}

// ------------------------------------------------------------------ Settings (spec §8.2)
const settingsEl = document.getElementById('settings');
const closeSettings = document.getElementById('closeSettings');
const resetSettings = document.getElementById('resetSettings');
const setFov = document.getElementById('setFov');
const setSens = document.getElementById('setSens');
const setCrossColor = document.getElementById('setCrossColor');
const setCrossThick = document.getElementById('setCrossThick');
const setCrossOutline = document.getElementById('setCrossOutline');
const setCrossStatic = document.getElementById('setCrossStatic');
const setGraphics = document.getElementById('setGraphics');
const setMaxFps = document.getElementById('setMaxFps');
const setNoTextures = document.getElementById('setNoTextures');
const setNoSkybox = document.getElementById('setNoSkybox');
const setNoHands = document.getElementById('setNoHands');

const settings = {
  fov: UI.FOV,
  sensitivity: 1.0,
  crossColor: UI.CROSSHAIR_DOT_COLOR,
  crossThickness: UI.CROSSHAIR_DOT_THICKNESS,
  crossOutline: UI.CROSSHAIR_OUTLINE_TYPE || 'round',
  crossStatic: UI.CROSSHAIR_STATIC,
  graphics: 'medium',
  maxFps: 144,
  noTextures: false,
  noSkybox: false,
  noHands: false,
};

function openSettings() {
  settingsEl.style.display = 'flex';
  setFov.value = settings.fov;
  setSens.value = settings.sensitivity;
  setCrossColor.value = settings.crossColor;
  setCrossThick.value = settings.crossThickness;
  setCrossOutline.value = settings.crossOutline;
  setCrossStatic.checked = settings.crossStatic;
  setGraphics.value = settings.graphics;
  setMaxFps.value = settings.maxFps || 144;
  setNoTextures.checked = settings.noTextures;
  setNoSkybox.checked = settings.noSkybox;
  setNoHands.checked = settings.noHands;
  // pause input while settings open
  document.exitPointerLock();
}
function closeSettingsMenu() {
  settingsEl.style.display = 'none';
  canvasEl.requestPointerLock();
}
function applySettings() {
  settings.fov = parseInt(setFov.value, 10);
  settings.sensitivity = parseFloat(setSens.value);
  settings.crossColor = setCrossColor.value;
  settings.crossThickness = parseInt(setCrossThick.value, 10);
  settings.crossOutline = setCrossOutline.value;
  settings.crossStatic = setCrossStatic.checked;
  settings.graphics = setGraphics.value;
  settings.maxFps = parseInt(setMaxFps.value, 10) || 0;
  settings.noTextures = setNoTextures.checked;
  settings.noSkybox = setNoSkybox.checked;
  settings.noHands = setNoHands.checked;
  camera.fov = settings.fov;

  // Texture packs (spec §8.3)
  if (settings.noSkybox) {
    scene.background = null; // remove skybox/background
  } else {
    scene.background = new THREE.Color(0xe8e8e8);
  }
  camera.updateProjectionMatrix();
  // Apply crosshair
  crosshairDot.style.background = settings.crossColor;
  crosshairDot.style.width = settings.crossThickness + 'px';
  crosshairDot.style.height = settings.crossThickness + 'px';
  if (settings.crossOutline === 'none') {
    crosshairDot.style.boxShadow = 'none';
  } else {
    crosshairDot.style.boxShadow = `0 0 0 ${Math.max(2, settings.crossThickness/2)}px #000000`;
  }
  // Graphics quality
  if (settings.graphics === 'low') {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.shadowMap.enabled = false;
  } else if (settings.graphics === 'high') {
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
  }
}
closeSettings.addEventListener('click', closeSettingsMenu);
resetSettings.addEventListener('click', () => {
  settings.fov = UI.FOV;
  settings.sensitivity = 1.0;
  settings.crossColor = UI.CROSSHAIR_DOT_COLOR;
  settings.crossThickness = UI.CROSSHAIR_DOT_THICKNESS;
  settings.crossOutline = 'round';
  settings.crossStatic = false;
  settings.graphics = 'medium';
  settings.maxFps = 144;
  settings.noTextures = false;
  settings.noSkybox = false;
  settings.noHands = false;
  applySettings();
  openSettings();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (settingsEl.style.display === 'flex') closeSettingsMenu();
    else openSettings();
  }
});

// Apply initial settings
applySettings();

// ------------------------------------------------------------------ Key balance (spec §8.4)
const keyBalanceEl = document.getElementById('keybalance');
const keyCountEl = document.getElementById('keycount');
let playerKeys = 0;
function setKeys(amount) {
  playerKeys = amount;
  keyCountEl.textContent = amount;
  keyBalanceEl.style.display = 'block';
}

// ------------------------------------------------------------------ Round UI state (spec §1)
let roundState = 'LOBBY';
let roundTimer = 0;
const scores = {};
let matchWinScore = 5;
let roundWinnerId = null;
let myAlive = true;
let mapPool = [];
let mapVotes = {};
let hasVoted = false;

// Only rebuild when vote data changes; rebuilding every frame destroys keyboard focus.
let lastVoteRender = '';
function renderMapVote() {
  const visible = roundState === 'INTERMISSION';
  mapVoteUI.style.display = visible ? 'block' : 'none';
  if (!visible) { lastVoteRender = ''; return; }
  const signature = JSON.stringify([mapPool, mapVotes, hasVoted]);
  if (signature === lastVoteRender) return;
  lastVoteRender = signature;
  mapVoteButtons.replaceChildren();
  for (const mapName of mapPool) {
    const votes = mapVotes[mapName] || 0;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', `${mapName}, ${votes} ${votes === 1 ? 'vote' : 'votes'}`);
    Object.assign(btn.style, {
      width: '150px', padding: '0', overflow: 'hidden', textAlign: 'left',
      background: '#282d37', color: '#fff', border: '1px solid #777',
      borderRadius: '6px', cursor: hasVoted ? 'default' : 'pointer',
    });
    const preview = document.createElement('img');
    preview.src = mapPreviewPath(mapName) || '';
    preview.alt = '';
    preview.loading = 'lazy';
    Object.assign(preview.style, { width: '100%', height: '84px', objectFit: 'cover', display: 'block', background: '#414b5c' });
    preview.onerror = () => { preview.style.visibility = 'hidden'; };
    const label = document.createElement('span');
    label.textContent = `${mapName} (${votes})`;
    Object.assign(label.style, { display: 'block', padding: '0.5rem', fontWeight: '600' });
    btn.append(preview, label);
    btn.disabled = hasVoted;
    btn.onclick = () => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: 'vote_map', map: mapName }));
      hasVoted = true;
      renderMapVote();
    };
    mapVoteButtons.appendChild(btn);
  }
}

function updateRoundUI() {
  roundUI.style.display = 'block';
  let stateText = roundState;
  if (roundState === 'ROUND_ACTIVE') stateText = 'ROUND ACTIVE';
  else if (roundState === 'INTERMISSION') stateText = 'INTERMISSION';
  else if (roundState === 'ROUND_END') stateText = roundWinnerId === myPlayerId ? 'ROUND WON' : 'ROUND LOST';
  else if (roundState === 'ROUND_MATCH_END') stateText = 'MATCH END';
  else if (roundState === 'LOBBY') stateText = 'LOBBY';
  roundStateEl.textContent = stateText;
  roundTimerEl.textContent = `round timer: ${Math.ceil(roundTimer)}s`;
  const lb = leaderboard();
  roundScoreEl.textContent = lb.map(e => `${e.id.slice(0,4)}: ${e.score}`).join('  ');
  let matchText = '';
  if (roundState === 'ROUND_MATCH_END') matchText = 'MATCH OVER';
  else {
    const me = scores[myPlayerId] || 0;
    const maxOther = Math.max(...Object.values(scores).filter((_, i, arr) => Object.keys(scores)[i] !== myPlayerId)) || 0;
    if (me >= matchWinScore - 1 && me > maxOther) matchText = 'MATCH POINT';
    if (me === maxOther && me >= matchWinScore - 1) matchText = 'SUDDEN DEATH';
  }
  roundMatchEl.textContent = matchText;
  if (matchText === 'SUDDEN DEATH') {
    roundMatchEl.style.color = '#ff0000';
    document.body.style.background = 'rgba(255,0,0,0.15)';
  } else if (matchText === 'MATCH POINT') {
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

// ------------------------------------------------------------------ Fire
function fireWeapon() {
  if (roundState !== 'ROUND_ACTIVE' || !myAlive) return;
  if (weaponSystem.isBlinded(now())) return; // flashbang blocks fire
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

  // Scythe dash-melee (spec §4.5)
  if (key === 'SCYTHE') {
    weaponSystem.dashMelee();
    return;
  }

  const eye = new THREE.Vector3().copy(mc.position);
  eye.y += mc.height - M.CAMERA_Y_OFFSET;
  const fireDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(mc.pitch, mc.yaw, 0, 'YXZ'));

  // Destructible windows (Station, Docks, Westown): shoot to break
  if (mapMechanics && shootWindow(mapMechanics, eye, fireDir, W[key].range || C.MAX_RANGE)) {
    showHitmarker();
    return;
  }

  const result = weaponSystem.fire(key, am, nowMs, camera, input);

  showHitmarker();
  if (result.point) {
    const dist = eye.distanceTo(result.point);
    let targetPos = null;
    let t = result.targetId ? remotePlayers.get(result.targetId)?.mesh : null;
    if (t) targetPos = t.position;
    const hs = targetPos ? (result.point.y > targetPos.y + 1.7 * 0.75) : false;
    const dmg = weaponSystem._damageAtRange ? weaponSystem._damageAtRange(w, dist, hs) : 0;
    if (hs) infoEl.textContent = 'HEADSHOT';
  }

  if (w.ammoMag >= 0 && am.mag <= 0) startReload();
}

// ------------------------------------------------------------------ HUD / render loop
const FIXED_DT = 1 / 60;
let lastTime = performance.now();
let accumulator = 0;
let lastInputSend = 0;

function updateHUD() {
  hpEl.textContent = `HP ${Math.max(0, playerHealth)}`;
  updateSlotsUI();
  renderMapVote();

  // Flashbang overlay (spec §4.6)
  const blindAlpha = weaponSystem.flashbangAlpha(now());
  if (blindAlpha > 0) {
    blindOverlay.style.background = `rgba(255,255,255,${blindAlpha})`;
  } else {
    blindOverlay.style.background = 'rgba(255,255,255,0)';
  }
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

  // Onyx lava contact damage (spec §5)
  if (mapMechanics) {
    const foot = new THREE.Vector3().copy(mc.position);
    foot.y = mc.position.y; // character feet
    const dmg = checkLava(mapMechanics, foot, mc, now);
    if (dmg !== null) {
      playerHealth = Math.max(0, playerHealth - dmg);
      hpEl.textContent = `HP ${playerHealth}`;
    }
    // Museum scanner buzzer (spec §5)
    checkScanner(mapMechanics, mc.position);
  }

  weaponSystem.update(FIXED_DT, now);

  if (now - lastInputSend >= NET.TICK_INTERVAL_MS) {
    sendInput();
    lastInputSend = now;
  }

  if (input.slot) {
    setSlot(input.slot);
    input.slot = null;
  }

  if (input.fire && document.pointerLockElement === canvasEl) fireWeapon();
  if (input.reload) startReload();

  const eye = new THREE.Vector3().copy(mc.position);
  eye.y += mc.height - M.CAMERA_Y_OFFSET;
  camera.position.copy(eye);
  camera.rotation.set(mc.pitch, mc.yaw, 0, 'YXZ');

  if (renderer) {
    renderer.render(scene, camera);
  }
  updateHUD();
}

window.addEventListener('resize', () => {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (renderer) {
  requestAnimationFrame(frame);
} else {
  showError('Three.js renderer not available — WebGL may not be supported');
}
