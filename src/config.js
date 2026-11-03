/**
 * RIVALS (Web Edition) — Tunable configuration.
 *
 * The Golden Rule from spec §11: per-patch tuning values must be exposed as
 * tunable constants here, NOT hard-coded, so the clone can be re-tuned to match
 * whichever RIVALS patch is being targeted. All values reflect Update 24 /
 * Season 4+ meta where the spec gives a number.
 */
export const CONFIG = {
  // ------------------------------------------------------------------ Network
  // Spec §7: server tick ~20 Hz (50 ms steps); max rewind window 250 ms;
  // hitreg degrades over 90 ms ping.
  NETWORK: {
    TICK_RATE: 20,
    TICK_INTERVAL_MS: 50,
    MAX_REWIND_MS: 250,
    LATENCY_DEGRADATION_MS: 90,
    SERVER_MOVE_TOLERANCE: 1.5, // displacement may exceed MAX_SPEED*dt*1.5
  },

  // ----------------------------------------------------------------- Movement
  // Spec §3: kinematic character controller at fixed 60 Hz timestep.
  MOVEMENT: {
    WALK_SPEED: 6.0,
    SPRINT_SPEED: 9.0,
    // Auto-Sprint is ON by default in competitive settings.
    AUTO_SPRINT: true,
    CROUCH_WALK_SPEED: 3.0,
    SLIDE_SPEED: 11.0,
    SLIDE_DURATION_S: 0.5,
    SLIDE_HITBOX_REDUCE: 0.40, // capsule ducking lowers hitbox ~40%
    SLIDE_CANCEL_WINDOW_START: 0.15,
    SLIDE_CANCEL_WINDOW_END: 0.55,
    JUMP_FORCE: 9.0,
    DOUBLE_JUMP_FORCE: 8.0,
    GRAVITY: 30.0,
    GROUND_ACCEL: 22.0,
    AIR_CONTROL: 6.0,
    FRICTION: 10.0,
    STAND_HEIGHT: 1.70,
    CROUCH_HEIGHT: 1.02,
    CAMERA_Y_OFFSET: 0.05, // eyes slightly below top of capsule
    // Dash (Spec §3 / Scythe): sideways preferred, 0.15-0.25 s, 15 units.
    DASH_SPEED: 22.0,
    DASH_DURATION_S: 0.20,
    DASH_DISTANCE: 15.0,
    DASH_COOLDOWN_S: 4.0,
    // Wall-bounce / explosive jump are handled by CombatSystem impulses.
  },

  // ----------------------------------------------------------------- Combat
  COMBAT: {
    HITMARKER_DURATION_MS: 120,
    MAX_RANGE: 200,
    DEFAULT_HEALTH: 150,
    // Headshot multipliers are weapon-specific; null = use crit table.
  },

  // ---------------------------------------------------------------- Weapons
  // Spec §4.3 / §4.4. damage = [start -> end] across effective range (falloff).
  // crit = headshot damage. fireCooldown in seconds. reloadTime in seconds.
  WEAPONS: {
    ASSAULT_RIFLE: {
      name: 'Assault Rifle', category: 'Primary', tier: 'Standard', cost: 0,
      unlockLevel: 5, sTier: true,
      damage: { start: 12, end: 3 }, crit: { start: 15, end: 4 },
      fireCooldown: 0.10, ammoMag: 20, ammoReserve: 100,
      reloadTime: 1.56, moveSpeedPenalty: 0.10,
      hitscan: true, range: 200,
    },
    SHOTGUN: {
      name: 'Shotgun', category: 'Primary', tier: 'Standard', cost: 20,
      unlockLevel: 8, aTier: true,
      damage: { start: 80, end: 25 }, pellets: 10,
      fireCooldown: 0.70, ammoMag: 7, ammoReserve: 35,
      reloadTime: 2.10, segmentedReload: true, moveSpeedPenalty: 0.0,
      hitscan: true, range: 15,
    },
    SNIPER: {
      name: 'Sniper', category: 'Primary', tier: 'Standard', cost: 75,
      unlockLevel: 12, bTier: true,
      damage: { start: 50, end: 50 }, crit: { start: 150, end: 150 },
      fireCooldown: 1.50, ammoMag: 4, ammoReserve: 12,
      reloadTime: 1.80, moveSpeedPenalty: 0.20,
      hitscan: true, range: 400, noFalloff: true,
      hitboxIncrease: 0.17, // Summer Update
    },
    BURST_RIFLE: {
      name: 'Burst Rifle', category: 'Primary', tier: 'Standard', cost: 25,
      unlockLevel: 18, aTier: true,
      damage: { start: 20, end: 5 }, crit: { start: 25, end: 6 },
      pellets: 3, fireCooldown: 0.60, ammoMag: 12, ammoReserve: 60,
      reloadTime: 1.60, moveSpeedPenalty: 0.10, hitscan: true, range: 200,
    },
    SMG: {
      name: 'SMG', category: 'Primary', tier: 'Standard', cost: 0,
      unlockLevel: 3,
      damage: { start: 22, end: 10 }, fireCooldown: 0.05,
      ammoMag: 30, ammoReserve: 150, reloadTime: 1.40, hitscan: true, range: 15,
    },
    WILDCAT: {
      name: 'Wildcat', category: 'Primary', tier: 'Standard', cost: 35,
      unlockLevel: 5,
      damage: { start: 10, end: 2.5 }, crit: { start: 13, end: 3.2 },
      fireCooldown: 0.06, ammoMag: 30, ammoReserve: 120, reloadTime: 0.78,
      moveSpeedBonus: 0.10, hitscan: true, range: 60, falloffStart: 40,
      update23Buff: true,
    },
    BOW: {
      name: 'Bow', category: 'Primary', tier: 'Standard', cost: 15,
      unlockLevel: 5, projectile: true,
      damageTiers: [30, 37.5, 45, 60], critTiers: [60, 75, 90, 120],
      fireCooldown: 0.25, ammoMag: 1, ammoReserve: 30, reloadTime: 0.19,
      moveSpeedBonus: 0.05, range: 150, doubleJump: true,
    },
    RPG: {
      name: 'RPG', category: 'Primary', tier: 'Standard', cost: 25,
      unlockLevel: 12, projectile: true, explosive: true,
      damage: { start: 50, end: 50 }, crit: { start: 100, end: 100 },
      fireCooldown: 0.25, ammoMag: 1, ammoReserve: 17, reloadTime: 1.04,
      moveSpeedPenalty: 0.15, range: 300, rocketJump: true,
    },
    CROSSBOW: {
      name: 'Crossbow', category: 'Primary', tier: 'Standard', cost: 35,
      unlockLevel: 15, projectile: true,
      damage: { start: 37.5, end: 37.5 }, crit: { start: 75, end: 75 },
      fireCooldown: 1.00, ammoMag: 1, ammoReserve: 20, reloadTime: 1.15,
      moveSpeedBonus: 0.05, range: 300, bypassesKatana: true,
    },
    GUNBLADE: {
      name: 'Gunblade', category: 'Primary', tier: 'Standard', cost: 45,
      damage: { start: 45, end: 45 }, crit: { start: 55, end: 55 },
      fireCooldown: 0.75, ammoMag: 12, ammoReserve: 60, reloadTime: 1.20,
      hitscan: true, dashMelee: true, moveSpeedPenalty: 0.0,
    },
    ENERGY_RIFLE: {
      name: 'Energy Rifle', category: 'Primary', tier: 'Prime', cost: 425,
      damage: { start: 20, end: 20 }, crit: { start: 25, end: 25 },
      fireCooldown: 0.30, ammoMag: -1, ammoReserve: -1, // infinite
      hitscan: true, range: 250, wallBounces: 2, moveSpeedPenalty: 0.0,
    },
    GRENADE_LAUNCHER: {
      name: 'Grenade Launcher', category: 'Primary', tier: 'Prime', cost: 425,
      damage: { start: 40, end: 10 }, crit: { start: 80, end: 20 },
      fireCooldown: 0.60, ammoMag: 6, ammoReserve: 24, reloadTime: 1.80,
      moveSpeedPenalty: 0.10, projectile: true, explosive: true, range: 200,
      rocketJump: true,
    },
    MINIGUN: {
      name: 'Minigun', category: 'Primary', tier: 'Prime', cost: 450,
      damage: { start: 8, end: 4 }, crit: { start: 10, end: 5 },
      fireCooldown: 0.05, ammoMag: 300, ammoReserve: 900, reloadTime: 3.00,
      moveSpeedPenalty: 0.25, hitscan: true, range: 180,
    },
    PERMAFROST: {
      name: 'Permafrost', category: 'Primary', tier: 'Contraband', cost: 600,
      sTier: true, damage: { start: 14, end: 3.5 }, crit: { start: 17.5, end: 4 },
      fireCooldown: 0.20, ammoMag: 24, ammoReserve: 72, reloadTime: 1.90,
      burst: 2, slowOnHit: true, hitscan: true, range: 180,
    },
    DISTORTION: {
      name: 'Distortion', category: 'Primary', tier: 'Contraband', cost: 700,
      damage: { start: 35, end: 10 }, pellets: 5, fireCooldown: 0.40,
      ammoMag: 45, ammoReserve: 180, reloadTime: 1.60, hitscan: true, range: 120,
    },
    FLAMETHROWER: {
      name: 'Flamethrower', category: 'Primary', tier: 'Prime', cost: 400,
      continuous: true, damagePerTick: 4, moveSpeedPenalty: 0.05,
      ammoMag: 100, ammoReserve: -1, range: 15,
    },
    // --- Secondaries ---
    HANDGUN: {
      name: 'Handgun', category: 'Secondary', tier: 'Standard', cost: 0,
      damage: { start: 12, end: 3 }, crit: { start: 15, end: 4 },
      fireCooldown: 0.13, ammoMag: 13, ammoReserve: 91, reloadTime: 1.06,
      hitscan: true, range: 100,
    },
    UZI: {
      name: 'Uzi', category: 'Secondary', tier: 'Standard', cost: 20, aTier: true,
      damage: { start: 8, end: 2 }, crit: { start: 10, end: 2 },
      fireCooldown: 0.07, ammoMag: 27, ammoReserve: 108, reloadTime: 1.50,
      hitscan: true, range: 60,
    },
    REVOLVER: {
      name: 'Revolver', category: 'Secondary', tier: 'Standard', cost: 25, cTier: true,
      damage: { start: 30, end: 8 }, crit: { start: 40, end: 10 },
      fireCooldown: 0.40, ammoMag: 6, ammoReserve: 36, reloadTime: 1.80,
      fanCooldown: 0.15, hitscan: true, range: 120, moveSpeedPenalty: 0.05,
    },
    EXOGUN: {
      name: 'Exogun', category: 'Secondary', tier: 'Prime', cost: 350, sTier: true,
      damage: { start: 10, end: 2 }, crit: { start: 20, end: 4 },
      fireCooldown: 0.28, ammoMag: 6, ammoReserve: 28, reloadTime: 0.65,
      hitscan: true, aoe: true, range: 120,
    },
    ENERGY_PISTOLS: {
      name: 'Energy Pistols', category: 'Secondary', tier: 'Prime', cost: 400,
      damage: { start: 2.4, end: 2.4 }, critMult: 1.25,
      fireCooldown: 0.03, ammoMag: -1, ammoReserve: -1, hitscan: true, range: 100,
    },
    SLINGSHOT: {
      name: 'Slingshot', category: 'Secondary', tier: 'Prime', cost: 300,
      damage: { start: 7, end: 7 }, critMult: 1.5,
      fireCooldown: 0.10, ammoMag: 75, ammoReserve: -1,
      projectile: true, wallBounces: true, moveSpeedBonus: 0.05, range: 100,
    },
    WARPER: { name: 'Warper', category: 'Secondary', tier: 'Contraband', cost: 650 },
    // --- Melee (the movement / defense slot) ---
    FISTS: {
      name: 'Fists', category: 'Melee', tier: 'Standard', cost: 0,
      damage: 30, doubleJump: true, reloadCancel: true, fireCooldown: 0.50, range: 2.2,
    },
    KATANA: {
      name: 'Katana', category: 'Melee', tier: 'Standard', cost: 0,
      unlockLevel: 6, aTier: true, damage: 45, silent: true, deflectsHitscan: true,
      fireCooldown: 0.60, range: 2.6,
    },
    SCYTHE: {
      name: 'Scythe', category: 'Melee', tier: 'Standard', cost: 0,
      aTier: true, damage: 35, dashCooldown: 4.00, fireCooldown: 0.70, range: 2.4,
    },
    KNIFE: {
      name: 'Knife', category: 'Melee', tier: 'Standard', cost: 0, bTier: true,
      damage: 30, backstabInstantKill: true, fireCooldown: 0.40, range: 2.0,
    },
    SPEAR: {
      name: 'Spear', category: 'Melee', tier: 'Prime', cost: 200, aTier: true,
      damage: 15, longestReach: true, throwable: true, fireCooldown: 0.80, range: 4.0,
    },
    GRAPPLE: {
      name: 'Grapple', category: 'Melee', tier: 'SeasonPass', damage: 0,
      fireCooldown: 3.0, range: 60,
    },
    MAUL: {
      name: 'Maul', category: 'Melee', tier: 'Prime', cost: 550, damage: 75,
      fireCooldown: 1.0, range: 2.8,
    },
    BATTLE_AXE: {
      name: 'Battle Axe', category: 'Melee', tier: 'Standard', cost: 50,
      damage: 55, fireCooldown: 0.80, range: 2.8,
    },
    CHAINSAW: {
      name: 'Chainsaw', category: 'Melee', tier: 'Standard', cost: 15,
      damage: 100, sprintDamage: 180, fireCooldown: 0.15, range: 2.2,
    },
    // --- Utility ---
    GRENADE: {
      name: 'Grenade', category: 'Utility', tier: 'Standard', cost: 0,
      damage: 75, explosive: true, fireCooldown: 1.0, range: 40,
    },
    FLASHBANG: {
      name: 'Flashbang', category: 'Utility', tier: 'Standard', cost: 0,
      blindDuration: 3.0, fireCooldown: 2.0, range: 40,
    },
    SMOKE_GRENADE: {
      name: 'Smoke Grenade', category: 'Utility', tier: 'Standard', cost: 0,
      duration: 8.0, fireCooldown: 4.0, range: 40,
    },
    MEDKIT: {
      name: 'Medkit', category: 'Utility', tier: 'Prime', cost: 300,
      heal: 50, fireCooldown: 4.0,
    },
    SUBSPACE_TRIPMINE: {
      name: 'Subspace Tripmine', category: 'Utility', tier: 'Prime', cost: 250,
      damage: 150, disabledInArcade: true, fireCooldown: 1.0,
    },
    WARPSTONE: { name: 'Warpstone', category: 'Utility', tier: 'Prime', cost: 400 },
  },

  // ----------------------------------------------------------------- Economy
  // Spec §6: key costs and free income targets (~55-60 keys/week).
  ECONOMY: {
    KEYS_PER_WEEK_FREE_TARGET: 58,
    TIER_COST: { Standard: [5, 75], Prime: [200, 550], Contraband: [600, 700] },
    DAILY_KEYS: 6,
    PRIZE_WHEEL_KEYS: [4, 10],
    CONTRACT_FIRST_TIER_KEYS: 2, // 1 for 5 elims + 1 for 5 min playtime
    WEAPON_TRIAL_AD_KEYS: 0,
  },

  // ------------------------------------------------------------------- UI
  UI: {
    FOV: 97, // recommended 90-105; 97 midpoint
    CROSSHAIR_STYLE: 'dot',
    CROSSHAIR_STATIC: false,
    CROSSHAIR_DOT_COLOR: '#ff0d00',
    CROSSHAIR_OUTLINE_COLOR: '#000000',
    CROSSHAIR_DOT_THICKNESS: 4,
    MATCH_POINT_DESATURATE: true,
    SUDDEN_DEATH_RED_TINT: true,
  },

  // ---------------------------------------------------------------- Maps
  MAPS: {
    BIG_REQUIRED_TEAM_SIZE: 3,
    ARENA_TILES: 26,
  },
};

// Starter kit per spec §4.1
export const STARTER_LOADOUT = {
  Primary: 'ASSAULT_RIFLE',
  Secondary: 'HANDGUN',
  Melee: 'FISTS',
  Utility: 'GRENADE',
};

// Default competitive loadout used by the client prototype.
export const DEFAULT_LOADOUT = { ...STARTER_LOADOUT };
