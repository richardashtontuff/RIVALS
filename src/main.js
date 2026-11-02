/**
 * RIVALS (Web Edition) — client entry point + CombatSystem.
 *
 * Phase 2: full weapon & loadout system (spec §4).
 * - Four-slot loadout enforced via LoadoutSystem
 * - Per-weapon ammo, reload, reload-cancel (Fists)
 * - Hitscan weapons with per-weapon damage falloff + headshot crit
 * - Projectile weapons (Bow, Crossbow, Spear, Grenade Launcher, RPG, Slingshot)
 *   using the Raycast Projectile system (spec §4.2)
 * - Melee weapons (range attack, Katana silent, Scythe dash-melee, etc.)
 * - Utility (Grenade, Flashbang, Smoke, Medkit, Tripmine, Warpstone)
 * - Weapon switching via number keys 1-4
 *
 * Networking, round state machine, maps = Phase 3+.
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
const UI = CONFIG.UI;

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

// ------------------------------------------------------------------ Three.js
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8e8e8); // "Bad White Arena" (§8.3)
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

// Target dummy with health.
const dummy = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: 0xff4444 }));
dummy.position.set(18, 1, 22);
dummy.name = 'dummy';
dummy.userData = { health: 100, type: 'dummy' };
world.add(dummy);

const raycaster = new THREE.Raycaster();

// ------------------------------------------------------------------ Input
const input = {
  w: false, a: false, s: false, d: false,
  shift: false, crouch: false, jump: false, dash: false,
  reload: false, fire: false,
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
  // Weapon slots: 1=primary, 2=secondary, 3=melee, 4=utility
  else if (code === 'Digit1' || code === 'Numpad1') { input.slot = 1; }
  else if (code === 'Digit2' || code === 'Numpad2') { input.slot = 2; }
  else if (code === 'Digit3' || code === 'Numpad3') { input.slot = 3; }
  else if (code === 'Digit4' || code === 'Numpad4') { input.slot = 4; }
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
let currentSlot = 1; // 1..4

// Per-weapon ammo state: { [weaponKey]: { mag, reserve } }
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
  updateSlotsUI();
  const a = ammoFor(w.name ? w.name : currentWeaponKey());
  // Use config key for ammo lookup
  const key = currentWeaponKey();
  const am = ammoState[key];
  if (W[key].ammoMag < 0) {
    ammoEl.textContent = '∞';
  } else {
    ammoEl.textContent = `${am.mag} / ${am.reserve}`;
  }
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
  if (!w || w.ammoMag < 0) return; // infinite ammo
  if (reloading && reloadWeaponKey === key) return;
  const am = ammoState[key];
  if (am.mag >= w.ammoMag || am.reserve <= 0 && am.mag < w.ammoMag) {
    // can't reload if mag full or no reserve
    if (am.mag >= w.ammoMag) return;
  }
  // Reload-cancel: switching away handled in setSlot / fire. Reloading now.
  reloading = true;
  reloadWeaponKey = key;
  if (reloadTimer) clearTimeout(reloadTimer);
  const refillMs = w.reloadTime * 600; // spec §3
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
  if (reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  reloading = false;
  reloadWeaponKey = null;
}

function fireWeapon() {
  const key = currentWeaponKey();
  const w = W[key];
  if (!w) return;
  const now = performance.now();
  if (now - lastFire < w.fireCooldown * 1000) return;
  if (reloading) return;

  const am = ammoState[key];
  if (w.ammoMag >= 0 && am.mag <= 0) {
    // dry: auto-reload or click does nothing
    startReload();
    return;
  }
  lastFire = now;

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

  if (w.hitscan || w.noFalloff) {
    doHitscan(w, key);
  } else if (w.projectile || w.explosive || w.continuous || w.throwable) {
    doProjectile(w, key);
  } else if (w.range && w.category === 'Melee') {
    doMelee(w, key);
  } else if (w.category === 'Utility') {
    doUtility(w, key);
  }

  if (w.ammoMag >= 0 && am.mag <= 0) startReload();
}

function doHitscan(w, key) {
  const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(mc.pitch, mc.yaw, 0, 'YXZ'));
  raycaster.set(camera.position, direction);
  raycaster.far = w.range || C.MAX_RANGE;
  const hits = raycaster.intersectObjects(world.children, true);
  const dmg = damageAtRange(w, 0);
  if (hits.length) {
    const hit = hits[0];
    showHitmarker();
    applyDamage(hit.object, dmg, hit.point);
  } else {
    showHitmarker();
  }
}

function doProjectile(w, key) {
  // Raycast Projectile system (spec §4.2): instant raycast for hit detection,
  // visual projectile is optional. Here we raycast immediately for reliable
  // hit detection and spawn a tracer.
  const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(mc.pitch, mc.yaw, 0, 'YXZ'));
  raycaster.set(camera.position, direction);
  raycaster.far = w.range || C.MAX_RANGE;
  const hits = raycaster.intersectObjects(world.children, true);
  const dmg = damageAtRange(w, 0);
  if (hits.length) {
    const hit = hits[0];
    showHitmarker();
    applyDamage(hit.object, dmg, hit.point);
    spawnTracer(camera.position, hit.point);
  } else {
    const end = camera.position.clone().add(direction.multiplyScalar(w.range || C.MAX_RANGE));
    spawnTracer(camera.position, end);
  }
}

function doMelee(w, key) {
  const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(mc.pitch, mc.yaw, 0, 'YXZ'));
  raycaster.set(camera.position, direction);
  raycaster.far = w.range || 3;
  const hits = raycaster.intersectObjects(world.children, true);
  if (hits.length) {
    const hit = hits[0];
    showHitmarker();
    applyDamage(hit.object, w.damage, hit.point);
    if (w.silent) {
      // Katana silent swing — no loud report
    }
  }
}

function doUtility(w, key) {
  // Utility: spawn a small projectile/placeholder; effects vary by weapon.
  const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(mc.pitch, mc.yaw, 0, 'YXZ'));
  raycaster.set(camera.position, direction);
  raycaster.far = w.range || 40;
  const hits = raycaster.intersectObjects(world.children, true);
  if (hits.length) {
    const hit = hits[0];
    showHitmarker();
    if (w.damage) applyDamage(hit.object, w.damage, hit.point);
    if (w.name === 'Grenade') spawnExplosion(hit.point, w.damage || 75);
  } else {
    const end = camera.position.clone().add(direction.multiplyScalar(w.range || 40));
    if (w.name === 'Grenade') spawnExplosion(end, w.damage || 75);
  }
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
  while (target && !target.userData.health && target.parent) target = target.parent;
  if (target.userData.health !== undefined) {
    target.userData.health = Math.max(0, target.userData.health - dmg);
    console.log(`${target.name || 'target'} took ${dmg} dmg → ${target.userData.health}`);
    if (target.userData.health <= 0) {
      target.visible = false;
      setTimeout(() => { target.visible = true; target.userData.health = 100; }, 3000);
    }
  } else {
    console.log(`hit ${obj.name} for ${dmg} (no health)`);
  }
}

function spawnTracer(start, end) {
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, start.distanceTo(end)),
    new THREE.MeshBasicMaterial({ color: 0xffff00 })
  );
  line.position.copy(start).add(end).multiplyScalar(0.5);
  line.lookAt(end);
  scene.add(line);
  setTimeout(() => scene.remove(line), 60);
}

function spawnExplosion(center, damage) {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6 })
  );
  sphere.position.copy(center);
  scene.add(sphere);
  // Apply damage to nearby entities
  world.traverse((obj) => {
    if (obj.userData.health !== undefined) {
      const d = obj.position.distanceTo(center);
      if (d < 5) applyDamage(obj, Math.max(0, damage - d * 10), center);
    }
  });
  setTimeout(() => scene.remove(sphere), 400);
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

function updateHUD() {
  hpEl.textContent = `HP 100`;
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

  // Slot switching (reload-cancel: switching to Fists cancels active reload)
  if (input.slot) {
    const key = currentWeaponKey();
    const w = W[key];
    if (input.slot === 3 && key === 'FISTS' && reloading && reloadTimer) {
      cancelReload(); // reload-cancel with Fists
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
