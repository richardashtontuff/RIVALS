/**
 * RIVALS (Web Edition) — client entry point.
 *
 * Phase 1 prototype: Three.js renderer + pointer-lock FPS camera + kinematic
 * MovementController (60 Hz fixed timestep) + Assault Rifle hitscan combat
 * with ammo / reload / reload-cancel + crosshair + HUD.
 *
 * Networking, the round state machine, maps, and the full weapon roster are
 * Phase 2+ (spec §7-§9).
 */
import * as THREE from 'three';
import { CONFIG, DEFAULT_LOADOUT } from './config.js';
import { MovementController } from './MovementController.js';

const W = CONFIG.WEAPONS;
const M = CONFIG.MOVEMENT;

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

// ------------------------------------------------------------------ Three.js
const scene = new THREE.Scene();
// "Bad White Arena" — bright white/grey per spec §8.3; community mods grey it.
scene.background = new THREE.Color(0xe8e8e8);
scene.fog = new THREE.Fog(0xe8e8e8, 40, 110);

const camera = new THREE.PerspectiveCamera(CONFIG.UI.FOV, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
canvasEl.appendChild(renderer.domElement);

// Lighting
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
addWall(0, 6, -60, 120, 12, 2); // back
addWall(0, 6, 60, 120, 12, 2); // front
addWall(-60, 6, 0, 2, 12, 120); // left
addWall(60, 6, 0, 2, 12, 120); // right

// Center cover + a couple of obstacles for jiggle-peeking.
const cover = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), wallMat);
cover.position.set(0, 2, 0);
cover.name = 'cover';
world.add(cover);

const dummy = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: 0xff4444 }));
dummy.position.set(18, 1, 22);
dummy.name = 'dummy';
world.add(dummy);
let dummyHealth = 100;

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
};
window.addEventListener('keydown', (e) => _onKey(e.code, true));
window.addEventListener('keyup', (e) => _onKey(e.code, false));

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
  crosshairEl.style.pointerEvents = 'none';
});

// ------------------------------------------------------------------ Movement
const mc = new MovementController();
mc.position.set(0, M.STAND_HEIGHT / 2, 10);

// ------------------------------------------------------------------ Combat / weapon state
let currentWeapon = DEFAULT_LOADOUT.primary; // 'ASSAULT_RIFLE'
let ammo = W[currentWeapon].ammoMag;
let reserve = W[currentWeapon].ammoReserve;
let health = CONFIG.COMBAT.DEFAULT_HEALTH;

let lastFire = 0;
let reloading = false;
let reloadTimer = null;

function weapon() { return W[currentWeapon]; }

function setWeapon(name) {
  if (W[name] === undefined) return;
  currentWeapon = name;
  // Reload-cancel: switching to Fists cancels the active reload timer.
  if (reloading && name === 'FISTS' && reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
    reloading = false;
  }
  if (weapon().ammoMag < 0) {
    ammoEl.textContent = '∞';
  } else {
    ammoEl.textContent = `${ammo} / ${reserve}`;
  }
  infoEl.innerHTML = `<div style="font-weight:700">${weapon().name}</div>` +
    `<div style="opacity:0.7">${weapon().category} • ${weapon().tier}</div>`;
}
setWeapon('ASSAULT_RIFLE');

function showHitmarker() {
  const prev = crosshairDot.style.background;
  crosshairDot.style.background = '#ffffff';
  setTimeout(() => { crosshairDot.style.background = prev; }, CONFIG.COMBAT.HITMARKER_DURATION_MS);
}

function fireWeapon() {
  const w = weapon();
  if (!w || !w.hitscan) return;
  const now = performance.now();
  if (now - lastFire < w.fireCooldown * 1000) return;
  if (reloading || ammo <= 0) return;
  lastFire = now;

  ammo--;
  if (ammoEl.textContent !== '∞') ammoEl.textContent = `${ammo} / ${reserve}`;

  // Client-side hitscan raycast (spec §7): immediate local feedback.
  const eye = new THREE.Vector3().copy(mc.position);
  eye.y += mc.height - M.CAMERA_Y_OFFSET;
  camera.position.copy(eye);
  camera.rotation.set(mc.pitch, mc.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();

  const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(mc.pitch, mc.yaw, 0, 'YXZ'));
  raycaster.set(eye, direction);
  raycaster.far = w.range || CONFIG.COMBAT.MAX_RANGE;
  const hits = raycaster.intersectObjects(world.children, true);
  if (hits.length) {
    const hit = hits[0];
    showHitmarker();
    if (hit.object.name === 'dummy') {
      const dmg = w.damage.start;
      dummyHealth -= dmg;
      console.log(`hit dummy for ${dmg} (${dummyHealth} left)`);
      if (dummyHealth <= 0) {
        dummy.visible = false;
        dummyHealth = 100;
        setTimeout(() => { dummy.visible = true; }, 3000);
      }
    }
  }

  if (ammo <= 0) startReload();
}

function startReload() {
  if (reloading) return;
  const w = weapon();
  if (!w || w.ammoMag < 0 || ammo >= w.ammoMag) return;
  reloading = true;
  const ammoBefore = ammo;
  const refillMs = w.reloadTime * 600; // spec §3: ammo refills at reloadTime*600 ms
  reloadTimer = setTimeout(() => {
    const refill = w.ammoMag - ammoBefore;
    ammo = w.ammoMag;
    reserve = Math.max(0, reserve - refill);
    if (ammoEl.textContent !== '∞') ammoEl.textContent = `${ammo} / ${reserve}`;
    reloadTimer = null;
    reloading = false;
    infoEl.title = 'reload complete';
  }, refillMs);
}

// ------------------------------------------------------------------ HUD / render loop
const FIXED_DT = 1 / 60;
let lastTime = performance.now();
let accumulator = 0;

function updateHUD() {
  hpEl.textContent = `HP ${health}`;
}

function frame(now) {
  requestAnimationFrame(frame);

  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  accumulator += dt;

  // Fixed-timestep physics (spec §3: 60 Hz, separate from render loop).
  while (accumulator >= FIXED_DT) {
    mc.update(FIXED_DT, input, now);
    accumulator -= FIXED_DT;
  }

  // Continuous fire while holding.
  if (input.fire && document.pointerLockElement === canvasEl) fireWeapon();
  if (input.reload) startReload();

  // Camera follows the controller (interpolated render position).
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
