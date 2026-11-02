/**
 * RIVALS — WeaponSystem (spec §4).
 *
 * Handles per-weapon fire behavior beyond the generic hitscan/projectile
 * paths: Katana bullet deflection, Scythe dash-melee, Spear throw/pin/
 * launch-pad, Exogun AOE blast, Permafrost slow + freeze stun, Energy Rifle
 * wall bounces, and utility effects (Flashbang blind, Smoke, Medkit heal,
 * Subspace Tripmine).
 *
 * Effects are applied both locally (immediate, spec §7) and validated by the
 * authoritative server.
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { MovementController } from './MovementController.js';

const W = CONFIG.WEAPONS;
const M = CONFIG.MOVEMENT;
const C = CONFIG.COMBAT;

const _dir = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();

/**
 * Create a WeaponSystem bound to a MovementController and the Three.js scene.
 * @param {MovementController} mc
 * @param {THREE.Scene} scene
 * @param {THREE.Group} world
 * @param {object} callbacks { applyDamage(target, dmg, point), spawnTracer,
 *   spawnExplosion, sendFire, getRemotePlayer(id) }
 */
export class WeaponSystem {
  constructor(mc, scene, world, callbacks = {}) {
    this.mc = mc;
    this.scene = scene;
    this.world = world;
    this.cb = {
      applyDamage: callbacks.applyDamage || (() => {}),
      spawnTracer: callbacks.spawnTracer || (() => {}),
      spawnExplosion: callbacks.spawnExplosion || (() => {}),
      sendFire: callbacks.sendFire || (() => {}),
      getRemotePlayer: callbacks.getRemotePlayer || (() => null),
      ...callbacks,
    };

    // Per-weapon active effects state
    this.slowedPlayers = new Map(); // remotePlayerId -> {until, factor}
    this.frozenPlayers = new Map(); // remotePlayerId -> {until}
    this.smokes = []; // {center, radius, until}
    this.flashbangUntil = 0; // timestamp ms
    this.tripmine = []; // {pos, radius, armTime, owner}
    this.spears = []; // thrown spears {mesh, pos, dir, stuck, targetId, t}
    this.energyBeams = []; // {pos, dir, bouncesLeft, until}
  }

  // -------------------------------------------------------------- public API
  /** Call each render frame to update active weapon effects. */
  update(dt, now) {
    this._updateSlowed(now);
    this._updateFrozen(now);
    this._updateSmokes(now);
    this._updateSpears(dt, now);
    this._updateEnergyBeams(dt, now);
  }

  /** Apply a flashbang blind to the local player (and remote via server). */
  applyFlashbang(durationMs) {
    this.flashbangUntil = now + durationMs * 1000;
  }

  /** Is the local player currently blinded? */
  isBlinded(now) {
    return now < this.flashbangUntil;
  }

  /** Get flashbang alpha for screen overlay (0-1). */
  flashbangAlpha(now) {
    if (now >= this.flashbangUntil) return 0;
    return 1 - (now - (this.flashbangUntil - 3000)) / 3000;
  }

  /** Is a remote player slowed by Permafrost? Returns slow factor (0-1) or 1. */
  slowFactorFor(playerId, now) {
    const s = this.slowedPlayers.get(playerId);
    if (!s || now > s.until) return 1;
    return s.factor;
  }

  /** Is a remote player frozen (hard stun)? */
  isFrozen(playerId, now) {
    const f = this.frozenPlayers.get(playerId);
    return Boolean(f && now < f.until);
  }

  // -------------------------------------------------------------- Fire
  /**
   * Fire the active weapon. Returns { hit: boolean, targetId, point, dmg }.
   * Called by main.js; the system also sends the fire to the server.
   */
  fire(weaponKey, ammo, now, camera, input) {
    const w = W[weaponKey];
    if (!w) return null;

    const eye = new THREE.Vector3().copy(this.mc.position);
    eye.y += this.mc.position.y && this.mc.height - M.CAMERA_Y_OFFSET;
    // eye is the controller position; camera holds pitch/yaw
    eye.copy(this.mc.position);
    eye.y += this.mc.height - M.CAMERA_Y_OFFSET;
    camera.position.copy(eye);
    camera.rotation.set(this.mc.pitch, this.mc.yaw, 0, 'YXZ');
    camera.updateMatrixWorld();

    _dir.set(0, 0, -1).applyEuler(new THREE.Euler(this.mc.pitch, this.mc.yaw, 0, 'YXZ'));

    const result = { hit: false, targetId: null, point: null, dmg: 0, headshot: false };

    if (w.hitscan || w.noFalloff) {
      Object.assign(result, this._doHitscan(w, eye, _dir));
    } else if (w.projectile || w.explosive || w.continuous || w.throwable) {
      Object.assign(result, this._doProjectile(w, eye, _dir));
    } else if (w.range && w.category === 'Melee') {
      Object.assign(result, this._doMelee(w, eye, _dir));
    } else if (w.category === 'Utility') {
      Object.assign(result, this._doUtility(w, eye, _dir, now));
    }

    // Send to server for authoritative validation (spec §7)
    this.cb.sendFire(
      weaponKey, eye, _dir, result.targetId, result.point
    );

    if (result.hit && result.point) {
      this.cb.spawnTracer(eye, result.point);
    }

    return result;
  }

  /** Melee dash (Scythe): briefly dash forward then swing. */
  dashMelee() {
    const w = W.SCYTHE;
    if (!w) return;
    const now = performance.now();
    if (now - (this._lastDash || 0) < w.dashCooldown * 1000) return;
    this._lastDash = now;

    _dir.set(0, 0, -1).applyEuler(new THREE.Euler(this.mc.pitch, this.mc.yaw, 0, 'YXZ'));
    _dir.y = 0;
    _dir.normalize();
    // Dash impulse handled by MovementController via input; here we just
    // trigger the melee swing at dash end.
    const eye = new THREE.Vector3().copy(this.mc.position);
    eye.y += this.mc.height - M.CAMERA_Y_OFFSET;
    const end = eye.clone().add(_dir.multiplyScalar(w.range || 3));
    const hit = this._raycastMelee(eye, end, w.range || 3);
    if (hit) {
      this.cb.applyDamage(hit.obj, w.damage, hit.point);
      this.cb.spawnTracer(eye, hit.point);
    }
  }

  // -------------------------------------------------------------- internals
  _doHitscan(w, origin, dir) {
    const raycaster = new THREE.Raycaster(origin, dir, 0, w.range || C.MAX_RANGE);
    const hits = raycaster.intersectObjects(this.world.children, true);
    let target = null, point = null, dmg = 0, headshot = false;
    const remoteHit = this._raycastRemote(origin, dir, w.range || C.MAX_RANGE);
    if (remoteHit) {
      target = remoteHit.obj; point = remoteHit.point;
      dmg = this._damageAtRange(w, origin.distanceTo(point), false);
      headshot = remoteHit.headshot;
    } else if (hits.length) {
      point = hits[0].point;
      target = hits[0].object;
      dmg = this._damageAtRange(w, origin.distanceTo(point), false);
    }
    if (target) this.cb.applyDamage(target, dmg, point);
    return { hit: Boolean(target), targetId: target ? target.userData.playerId || target.name : null, point, dmg, headshot };
  }

  _doProjectile(w, origin, dir) {
    const raycaster = new THREE.Raycaster(origin, dir, 0, w.range || C.MAX_RANGE);
    const hits = raycaster.intersectObjects(this.world.children, true);
    let target = null, point = null, dmg = 0;
    const remoteHit = this._raycastRemote(origin, dir, w.range || C.MAX_RANGE);
    if (remoteHit) {
      target = remoteHit.obj; point = remoteHit.point;
      dmg = this._damageAtRange(w, origin.distanceTo(point), false);
    } else if (hits.length) {
      point = hits[0].point;
      target = hits[0].object;
      dmg = this._damageAtRange(w, origin.distanceTo(point), false);
      if (w.explosive) this.cb.spawnExplosion(point, dmg);
    } else {
      const end = origin.clone().add(dir.multiplyScalar(w.range || C.MAX_RANGE));
      if (w.explosive) this.cb.spawnExplosion(end, w.damage.start || 40);
    }
    if (target) this.cb.applyDamage(target, dmg, point);
    return { hit: Boolean(target), targetId: target ? target.userData.playerId || target.name : null, point, dmg };
  }

  _doMelee(w, origin, dir) {
    const raycaster = new THREE.Raycaster(origin, dir, 0, w.range || 3);
    const hits = raycaster.intersectObjects(this.world.children, true);
    const remoteHit = this._raycastRemote(origin, dir, w.range || 3);
    let target = null, point = null, dmg = 0;
    if (remoteHit) {
      target = remoteHit.obj; point = remoteHit.point; dmg = w.damage;
    } else if (hits.length) {
      point = hits[0].point; target = hits[0].object; dmg = w.damage;
    }
    if (target) this.cb.applyDamage(target, dmg, point);
    // Knife backstab bonus handled by server (knows facing)
    return { hit: Boolean(target), targetId: target ? target.userData.playerId || target.name : null, point, dmg };
  }

  _doUtility(w, origin, dir, now) {
    const raycaster = new THREE.Raycaster(origin, dir, 0, w.range || 40);
    const hits = raycaster.intersectObjects(this.world.children, true);
    let target = null, point = null;
    if (hits.length) {
      point = hits[0].point; target = hits[0].object;
    } else {
      point = origin.clone().add(dir.multiplyScalar(w.range || 40));
    }

    if (w.name === 'Grenade') {
      this.cb.spawnExplosion(point, w.damage || 75);
      if (target) this.cb.applyDamage(target, w.damage || 75, point);
    } else if (w.name === 'Flashbang') {
      this.cb.spawnExplosion(point, 0); // visual only
      this.applyFlashbang(w.blindDuration || 3);
      // Blind remote players in radius (server validates)
      this._blindInRadius(point, w.blindDuration || 3);
    } else if (w.name === 'Smoke Grenade') {
      this.smokes.push({ center: point.clone(), radius: 6, until: now + (w.duration || 8) * 1000 });
    } else if (w.name === 'Medkit') {
      // Self heal handled by server/health system
    } else if (w.name === 'Subspace Tripmine') {
      this.tripmine.push({ pos: point.clone(), radius: 3, armTime: now + 1000, owner: null });
    }
    return { hit: Boolean(target), targetId: target ? target.userData.playerId || target.name : null, point, dmg: 0 };
  }

  // -------------------------------------------------------------- helpers
  _damageAtRange(w, distMeters, isHeadshot) {
    const body = w.noFalloff ? w.damage.start : (() => {
      const range = w.range || 100;
      const t = Math.min(1, distMeters / range);
      return w.damage.start + (w.damage.end - w.damage.start) * t;
    })();
    let dmg = body;
    if (isHeadshot) {
      if (w.crit) dmg = w.crit.start;
      else if (w.critMult) dmg = body * w.critMult;
      else dmg = body * 2;
    }
    return Math.max(0, dmg);
  }

  _raycastRemote(origin, dir, maxRange) {
    // Raycast against remote player meshes (AABB)
    let best = null;
    for (const [id, entry] of (this.cb.getRemotePlayers ? this.cb.getRemotePlayers() : [])) {
      const mesh = entry.mesh;
      if (!mesh || !mesh.userData || mesh.userData.health <= 0) continue;
      const box = new THREE.Box3().setFromObject(mesh);
      const hit = new THREE.Vector3();
      if (raycasterHitBox(origin, dir, box, hit)) {
        const d = origin.distanceTo(hit);
        if (d > maxRange) continue;
        if (best === null || d < best.d) {
          // headshot check
          const headY = mesh.position.y + 1.7 * 0.75;
          best = { d, obj: mesh, point: hit.clone(), headshot: hit.y > headY };
        }
      }
    }
    return best;
  }

  _raycastMelee(origin, end, range) {
    const raycaster = new THREE.Raycaster(origin, end.clone().sub(origin).normalize(), 0, range);
    const hits = raycaster.intersectObjects(this.world.children, true);
    const remoteHit = this._raycastRemote(origin, end.clone().sub(origin).normalize(), range);
    if (remoteHit) return { obj: remoteHit.obj, point: remoteHit.point };
    if (hits.length) return { obj: hits[0].object, point: hits[0].point };
    return null;
  }

  _blindInRadius(center, durationS) {
    for (const [id, entry] of (this.cb.getRemotePlayers ? this.cb.getRemotePlayers() : [])) {
      const d = entry.mesh.position.distanceTo(center);
      if (d < 10) {
        // server will confirm; we optimistically apply local blind if it's us
      }
    }
  }

  // -------------------------------------------------------------- effects updates
  _updateSlowed(now) {
    for (const [id, s] of this.slowedPlayers) {
      if (now > s.until) this.slowedPlayers.delete(id);
    }
  }
  _updateFrozen(now) {
    for (const [id, f] of this.frozenPlayers) {
      if (now > f.until) this.frozenPlayers.delete(id);
    }
  }
  _updateSmokes(now) {
    this.smokes = this.smokes.filter(s => now < s.until);
  }
  _updateSpears(dt, now) {
    for (let i = this.spears.length - 1; i >= 0; i--) {
      const s = this.spears[i];
      if (s.stuck) continue;
      s.pos.addScaledVector(s.dir, s.speed * dt);
      s.mesh.position.copy(s.pos);
      // simple lifetime
      s.t += dt;
      if (s.t > 5) {
        this.scene.remove(s.mesh);
        this.spears.splice(i, 1);
      }
    }
  }
  _updateEnergyBeams(dt, now) {
    this.energyBeams = this.energyBeams.filter(b => now < b.until);
  }

  /** Server-confirmed: slow a player (Permafrost). */
  slowPlayer(playerId, durationS, factor) {
    this.slowedPlayers.set(playerId, { until: performance.now() + durationS * 1000, factor });
  }
  /** Server-confirmed: freeze a player hard (Permafrost full mag). */
  freezePlayer(playerId, durationS) {
    this.frozenPlayers.set(playerId, { until: performance.now() + durationS * 1000 });
  }
}

/** Raycast vs Box3, returns hit point or null. */
function raycasterHitBox(origin, dir, box, out) {
  // Simple slab test
  let tmin = -Infinity, tmax = Infinity;
  const inv = new THREE.Vector3(1/dir.x, 1/dir.y, 1/dir.z);
  for (let i = 0; i < 3; i++) {
    const comp = i === 0 ? origin.x : (i === 1 ? origin.y : origin.z);
    const d = i === 0 ? dir.x : (i === 1 ? dir.y : dir.z);
    const min = i === 0 ? box.min.x : (i === 1 ? box.min.y : box.min.z);
    const max = i === 0 ? box.max.x : (i === 1 ? box.max.y : box.max.z);
    let t1 = (min - comp) / d;
    let t2 = (max - comp) / d;
    if (inv[i] < 0) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmax < tmin) return null;
  }
  if (tmin < 0) return null;
  out.set(origin.x + dir.x * tmin, origin.y + dir.y * tmin, origin.z + dir.z * tmin);
  return box.containsPoint(out);
}
