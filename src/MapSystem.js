/**
 * RIVALS — MapSystem (spec §5).
 *
 * Map metadata table + procedural map loading + map-specific mechanics:
 *   - Destructible windows (Station, Docks, Westown): shot-out = permanent
 *     open sightline, collider removed
 *   - Onyx lava: collision sensor, damage randomInt(5,70), impulse away
 *     from surface normal
 *   - Battleground bridge buttons: shoot to close middle section + collider
 *   - Museum scanner: trigger volume + audible buzzer on pass (no minimap)
 *   - Sandbox shovels: climbable ramps to sand bucket tops
 *   - Big variants: new geometry (not a Scale multiplier), required for 3v3+
 *
 * Maps are loaded from GLB where available; procedural placeholder geometry
 * is used when no asset exists (assets must pass through the gltf-transform
 * Draco + WebP pipeline per spec §10).
 */
import * as THREE from '/node_modules/three/build/three.module.js';
import { CONFIG } from './config.js';

const M = CONFIG.MAPS;

/** Map metadata table (spec §5.1). */
export const MAP_METADATA = {
  Arena: { name: 'Arena', difficulty: 'Easy', tiles: 26, size: 'small',
    features: ['mirrored', 'ramps'], recommended: 'Assault Rifle', glbPath: null },
  Backrooms: { name: 'Backrooms', difficulty: 'Easy', size: 'small',
    features: ['mirrored', 'maze', 'darkness', 'fog', 'echoes'],
    recommended: 'Shotgun / SMG + Katana', glbPath: null },
  Battleground: { name: 'Battleground', difficulty: 'Easy', size: 'small',
    features: ['vertical_bridge', 'shootable_buttons_close_middle'],
    recommended: 'Assault Rifle / Burst Rifle', glbPath: null },
  Bridge: { name: 'Bridge', difficulty: 'Easy', size: 'small',
    features: ['seoul_inspired', 'yellow_bus', 'scythe_dash_reachable'],
    recommended: 'Shotgun / SMG + Scythe', glbPath: null },
  Chess: { name: 'Chess', difficulty: 'Easy', size: 'small',
    features: ['giant_chessboard', 'cover_pieces', 'open'],
    recommended: 'Assault Rifle / Burst Rifle', glbPath: null },
  Construction: { name: 'Construction', difficulty: 'Hard', size: 'medium',
    features: ['crane', 'red_crate', 'second_floor_spawns', 'jump_shard_crane_top'],
    recommended: 'High-mobility loadout', glbPath: null },
  Crossroads: { name: 'Crossroads', difficulty: 'Medium', size: 'medium',
    features: ['classic_2006', 'bridges', 'jump_shard_black_area'],
    recommended: 'Sniper / Crossbow', glbPath: null },
  'Big Crossroads': { name: 'Big Crossroads', difficulty: 'Medium', size: 'big',
    features: ['tall_green_hill', 'extra_trampolines', 'extra_tunnel'],
    recommended: 'Sniper / Crossbow', glbPath: null, big: true },
  Dimension: { name: 'Dimension', difficulty: 'Hard', size: 'medium',
    features: ['portal_bottom_center', 'stairs', 'glass', 'easy_to_fall'],
    recommended: 'Assault Rifle / Burst Rifle + mobility', glbPath: null },
  Docks: { name: 'Docks', difficulty: 'Medium', size: 'medium',
    features: ['long_range', 'breakable_glass', 'water_death', 'jump_shard_oob'],
    recommended: 'Sniper / Crossbow + spray secondary', glbPath: null },
  Graveyard: { name: 'Graveyard', difficulty: 'Medium', size: 'medium',
    features: ['big_church', 'graveyard', 'bell_sudden_death', 'underground_tunnel'],
    recommended: 'Assault Rifle / Burst Rifle', glbPath: null },
  'Big Graveyard': { name: 'Big Graveyard', difficulty: 'Medium', size: 'big',
    features: ['underground_tunnel'], recommended: 'Assault Rifle / Burst Rifle',
    glbPath: null, big: true },
  Iceberg: { name: 'Iceberg', difficulty: 'Medium', size: 'medium',
    features: ['three_spawns', 'tents', 'radio_towers', 'water_death'],
    recommended: 'Mixed', glbPath: null },
  Museum: { name: 'Museum', difficulty: 'Medium', size: 'large',
    features: ['two_floors', 'purple_fossils', 'scanner_buzzer', 'update23_sightlines'],
    recommended: 'Sniper / Burst Rifle', glbPath: null },
  Onyx: { name: 'Onyx', difficulty: 'Hard', size: 'medium',
    features: ['lava_5_70_dmg_bounce', 'pillars', 'jump_shard_rubber_duck'],
    recommended: 'Shotgun / SMG + Scythe', glbPath: null },
  Playground: { name: 'Playground', difficulty: 'Medium', size: 'medium',
    features: ['tires', 'crates', 'wooden_walls', 'mazes'],
    recommended: 'Shotgun / SMG', glbPath: null },
  Sandbox: { name: 'Sandbox', difficulty: 'Easy', size: 'small',
    features: ['symmetrical', 'ramp_to_sandcastle', 'shovel_climbable_ramps'],
    recommended: 'Shotgun / SMG', glbPath: null },
  Station: { name: 'Station', difficulty: 'Medium', size: 'medium',
    features: ['western_station', 'destructible_windows', 'two_trains'],
    recommended: 'Assault Rifle / Burst Rifle', glbPath: null },
  'Big Station': { name: 'Big Station', difficulty: 'Medium', size: 'big',
    features: ['multiple_shops', 'more_trains'], recommended: 'Assault Rifle / Burst Rifle',
    glbPath: null, big: true },
  Studio: { name: 'Studio', difficulty: 'Medium', size: 'small',
    features: ['hollywood_set', 'two_balconies', 'van_forklift', 'tents', 'green_screen'],
    recommended: 'Spear / Shotgun', glbPath: null },
  Village: { name: 'Village', difficulty: 'Medium', size: 'medium',
    features: ['standard'], recommended: 'Mixed', glbPath: null },
  Westown: { name: 'Westown', difficulty: 'Medium', size: 'medium',
    features: ['wild_west', 'four_small_houses', 'two_big_houses', 'rail_track_train',
      'dynamite_crates', 'destructible_windows'],
    recommended: 'Assault Rifle / Shotgun', glbPath: null },
  'Shooting Range': { name: 'Shooting Range', difficulty: 'Medium', size: 'large',
    features: ['complex', 'pillars', 'ziplines', 'lobby_accessible'],
    recommended: 'Any (practice)', glbPath: null },
  // Additional Big variants (spec §5.2)
  'Big Arena': { name: 'Big Arena', difficulty: 'Easy', size: 'big',
    features: ['more_platforms'], recommended: 'Assault Rifle', glbPath: null, big: true },
  'Big Backrooms': { name: 'Big Backrooms', difficulty: 'Easy', size: 'big',
    features: ['maze_sections'], recommended: 'Shotgun / SMG', glbPath: null, big: true },
  'Big Onyx': { name: 'Big Onyx', difficulty: 'Hard', size: 'big',
    features: ['lava', 'extra_pillars'], recommended: 'Shotgun / SMG + Scythe',
    glbPath: null, big: true },
  'Big Splash': { name: 'Big Splash', difficulty: 'Medium', size: 'big',
    features: ['water'], recommended: 'Mixed', glbPath: null, big: true },
};

/** Is a map a Big variant? */
export function isBigMap(mapName) {
  return Boolean(MAP_METADATA[mapName] && MAP_METADATA[mapName].big);
}

/** Big maps are mandatory for 3v3+ (spec §5.2). */
export function bigRequired(teamSize) {
  return teamSize >= M.BIG_REQUIRED_TEAM_SIZE;
}

// ================================================================== Map mechanics

/** Destructible window (Station, Docks, Westown). */
export class BreakableWindow {
  constructor(mesh, health = 1) {
    this.mesh = mesh;
    this.health = health;
    this.destroyed = false;
    // Collider reference (Rapier or Three.js raycast target)
    this.collider = mesh;
  }
  /** Shoot the window: destroy it permanently (open sightline). */
  break() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.mesh.visible = false;
    if (this.collider) this.collider.visible = false; // remove collider from obstruction
    console.log('[map] window destroyed — permanent open sightline');
  }
}

/** Onyx lava zone. Contact damages 5-70 and bounces away from surface normal. */
export class LavaZone {
  constructor(mesh, damageRange = [5, 70]) {
    this.mesh = mesh;
    this.damageRange = damageRange;
  }
  /** Apply lava effect to a character controller. Returns damage dealt. */
  apply(character, now) {
    const damage = Math.floor(Math.random() * (this.damageRange[1] - this.damageRange[0] + 1)) + this.damageRange[0];
    // Bounce impulse away from lava surface normal (upward)
    character.applyImpulse(new THREE.Vector3(0, 6, 0));
    console.log(`[map] lava: ${damage} dmg + bounce`);
    return damage;
  }
}

/** Battleground bridge button: shooting it closes the middle section. */
export class BridgeButton {
  constructor(buttonMesh, bridgeMesh, bridgeCollider) {
    this.buttonMesh = buttonMesh;
    this.bridgeMesh = bridgeMesh;
    this.bridgeCollider = bridgeCollider;
    this.closed = false;
  }
  /** Activate: animate bridge middle section closing + collider update. */
  close() {
    if (this.closed) return;
    this.closed = true;
    // Hide middle section visually
    if (this.bridgeMesh) this.bridgeMesh.visible = false;
    if (this.bridgeCollider) this.bridgeCollider.visible = false;
    console.log('[map] Battleground bridge middle section closed');
  }
}

/** Museum scanner trigger volume: plays audible buzzer when a player passes. */
export class MuseumScanner {
  constructor(triggerVolume) {
    this.triggerVolume = triggerVolume;
    this.audioCtx = null;
  }
  /** Trigger buzzer via Web Audio API. Announces position, no minimap marker. */
  buzz() {
    console.log('[map] Museum scanner buzzer — player position announced');
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, this.audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);
      osc.connect(gain); gain.connect(this.audioCtx.destination);
      osc.start(); osc.stop(this.audioCtx.currentTime + 0.3);
    } catch (e) { /* audio context may be blocked */ }
  }
}

/** Sandbox shovel: climbable ramp to sand bucket top. */
export class ShovelRamp {
  constructor(mesh, topPosition) {
    this.mesh = mesh;
    this.topPosition = topPosition; // Vector3 top of bucket
  }
}

/**
 * Build a procedural placeholder map for prototyping when no GLB asset exists.
 * Applies map-specific mechanics (lava, windows, bridge, scanner, shovels).
 * @param {string} mapName
 * @param {THREE.Scene} scene
 * @param {THREE.Group} world
 * @returns {object} { mechanics: {lava, windows, bridge, scanner, shovels} }
 */
export function buildProceduralMap(mapName, scene, world) {
  const meta = MAP_METADATA[mapName];
  if (!meta) throw new Error(`Unknown map: ${mapName}`);
  const mechanics = { lava: [], windows: [], bridge: null, scanner: null, shovels: [] };

  const mat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 });

  // Base floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'floor';
  world.add(floor);

  // Map-specific procedural geometry
  if (mapName === 'Onyx' || mapName === 'Big Onyx') {
    // Lava pit in center
    const lava = new THREE.Mesh(new THREE.CircleGeometry(18, 32), new THREE.MeshBasicMaterial({ color: 0xff4400 }));
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = 0.01;
    lava.name = 'lava';
    world.add(lava);
    mechanics.lava.push(new LavaZone(lava));
    // Pillars as spawns
    for (const [x, z] of [[-25, -25], [25, -25], [-25, 25], [25, 25]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 6, 16), mat);
      p.position.set(x, 3, z);
      p.name = 'pillar';
      world.add(p);
    }
  } else if (mapName === 'Battleground') {
    // Vertical bridge through center
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 4), mat);
    bridge.position.set(0, 6, 0);
    bridge.name = 'bridge';
    world.add(bridge);
    // Middle section (hollow) + button
    const middle = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 4), mat);
    middle.position.set(0, 6, 0);
    middle.name = 'bridge_middle';
    world.add(middle);
    const button = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    button.position.set(0, 6.6, 2);
    button.name = 'bridge_button';
    world.add(button);
    mechanics.bridge = new BridgeButton(button, middle, middle);
  } else if (mapName === 'Museum') {
    // Two floors + scanner trigger volume near far doors
    const floor2 = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat);
    floor2.rotation.x = -Math.PI / 2;
    floor2.position.y = 6;
    floor2.name = 'floor2';
    world.add(floor2);
    const stairs = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 4), mat);
    stairs.position.set(35, 3, 0);
    stairs.name = 'stairs';
    world.add(stairs);
    const scanner = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 1), mat);
    scanner.position.set(0, 3, 38);
    scanner.name = 'museum_scanner';
    world.add(scanner);
    mechanics.scanner = new MuseumScanner(scanner);
  } else if (mapName === 'Station' || mapName === 'Big Station' ||
             mapName === 'Docks' || mapName === 'Westown') {
    // Destructible windows
    const windowPositions = [
      [-20, 6, -30], [20, 6, -30], [-20, 6, 30], [20, 6, 30],
    ];
    for (const [x, y, z] of windowPositions) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.5), mat);
      win.position.set(x, y, z);
      win.name = 'breakable_window';
      win.userData = { breakable: true };
      world.add(win);
      mechanics.windows.push(new BreakableWindow(win));
    }
    if (mapName === 'Station') {
      // Two stationary trains center
      for (const x of [-8, 8]) {
        const train = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 20), mat);
        train.position.set(x, 2, 0);
        train.name = 'train';
        world.add(train);
      }
    }
  } else if (mapName === 'Sandbox') {
    // Sandcastle + buckets + shovel ramps
    const castle = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 20), mat);
    castle.position.set(0, 4, 0);
    castle.name = 'sandcastle';
    world.add(castle);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 10), mat);
    ramp.position.set(-10, 1, 0);
    ramp.rotation.x = -0.4;
    ramp.name = 'shovel_ramp';
    ramp.userData = { shovel: true };
    world.add(ramp);
    mechanics.shovels.push(new ShovelRamp(ramp, new THREE.Vector3(-10, 4, 6)));
  } else if (mapName === 'Arena') {
    // Ramps on both sides
    for (const x of [-30, 30]) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 16), mat);
      ramp.position.set(x, 2, 0);
      ramp.rotation.x = -0.3;
      ramp.name = 'ramp';
      world.add(ramp);
    }
  }

  return { name: mapName, metadata: meta, mechanics };
}

/** Raycast against breakable windows; break the first hit window. */
export function shootWindow(mechanics, origin, dir, maxRange) {
  const raycaster = new THREE.Raycaster(origin, dir, 0, maxRange);
  for (const win of mechanics.windows) {
    if (win.destroyed) continue;
    const box = new THREE.Box3().setFromObject(win.mesh);
    const hit = new THREE.Vector3();
    if (raycasterHitBox(origin, dir, box, hit)) {
      win.break();
      return true;
    }
  }
  return false;
}

/** Check lava contact for a position. Returns damage or null. */
export function checkLava(mechanics, position, character, now) {
  for (const lava of mechanics.lava) {
    const box = new THREE.Box3().setFromObject(lava.mesh);
    if (box.containsPoint(position)) {
      return lava.apply(character, now);
    }
  }
  return null;
}

/** Check museum scanner trigger. */
export function checkScanner(mechanics, position) {
  if (mechanics.scanner && mechanics.scanner.triggerVolume) {
    const box = new THREE.Box3().setFromObject(mechanics.scanner.triggerVolume);
    if (box.containsPoint(position)) {
      mechanics.scanner.buzz();
      return true;
    }
  }
  return false;
}

function raycasterHitBox(origin, dir, box, out) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const comp = i === 0 ? origin.x : (i === 1 ? origin.y : origin.z);
    const d = i === 0 ? dir.x : (i === 1 ? dir.y : dir.z);
    const min = i === 0 ? box.min.x : (i === 1 ? box.min.y : box.min.z);
    const max = i === 0 ? box.max.x : (i === 1 ? box.max.y : box.max.z);
    if (Math.abs(d) < 1e-6) {
      if (comp < min || comp > max) return null;
    } else {
      const invD = 1 / d;
      let t1 = (min - comp) * invD;
      let t2 = (max - comp) * invD;
      if (invD < 0) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmax < tmin) return null;
    }
  }
  if (tmin < 0) return null;
  out.set(origin.x + dir.x * tmin, origin.y + dir.y * tmin, origin.z + dir.z * tmin);
  return box.containsPoint(out);
}
