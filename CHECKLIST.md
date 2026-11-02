# RIVALS (Web Edition) — Implementation Checklist

Source of truth: `PROMPT` (Full Technical Specification, Update 24).
Rule: An item is NOT checked off until I can confirm the feature exists in code
and behaves per spec. Work top-to-bottom; do not skip ahead.

## Phase 1 — Foundation (DONE, committed)
- [x] `src/config.js` — all spec-§11 tunable constants (movement, combat, weapon
  roster per Update 24, economy, UI, maps) + starter loadout
- [x] `src/MovementController.js` — fixed 60 Hz kinematic character controller:
  walk / auto-sprint, crouch, slide (capsule ducking ~40%), slide-cancel
  (0.15–0.55 s window), slide-jump, double-jump (Fists/Bow passive),
  Scythe dash (validated distance), ground/world-bounds collision
- [x] `src/main.js` — Three.js WebGL renderer, pointer-lock FPS camera,
  Assault Rifle hitscan combat with ammo/reload/reload-cancel,
  hitmarkers, health/ammo HUD
- [x] `index.html` — entry with importmap, spec-§8.1 dot crosshair
  (red `#ff0d00` dot, 4 px thickness, black `#000000` outline)
- [x] `.gitignore` excludes `node_modules/`; clean commit on branch
  `arena/2922f171-rivals`

## Phase 2 — Weapon & Loadout System (spec §4)
- [ ] LoadoutSystem: `validateLoadout(player, {primary, secondary, melee, utility})`
  enforces exactly one weapon per category; prevents invalid combinations
- [ ] Weapon switching: number keys 1-4 cycle loadout slots; Fists = slot 4 / melee
- [ ] All Primary weapons from spec §4.3 with correct stats:
  Assault Rifle, Shotgun, Sniper, SMG, Burst Rifle, Wildcat, Bow, RPG,
  Crossbow, Gunblade, Energy Rifle, Grenade Launcher, Minigun, Permafrost,
  Distortion, Flamethrower
- [ ] All Secondary weapons from spec §4.4:
  Handgun, Uzi, Revolver, Exogun, Energy Pistols, Slingshot, Warper
- [ ] All Melee weapons from spec §4.5:
  Fists, Katana (silent, deflects hitscan), Scythe (dash), Knife (backstab),
  Spear (throwable, launch pad), Grapple, Maul, Battle Axe, Chainsaw
- [ ] All Utility weapons from spec §4.6:
  Grenade, Flashbang (3s blind), Smoke Grenade (8s), Medkit (50 HP),
  Subspace Tripmine (150 dmg, disabled in Arcade), Warpstone
- [ ] Projectile weapons (Bow, Crossbow, Spear, Grenade Launcher, RPG,
  Slingshot) — Raycast Projectile system (spec §4.2)
- [ ] Hitscan weapons with per-weapon damage falloff `[start -> end]`
- [ ] Headshot multipliers per weapon (crit values)
- [ ] Reload-cancel with Fists works on Sniper, Shotgun, Burst Rifle,
  Assault Rifle (ammo refills at `reloadTime * 600` ms)
- [ ] Katana bullet deflection (timed)
- [ ] Scythe dash-in melee
- [ ] Spear throw / pin to wall / launch pad
- [ ] Exogun AOE blast, Permafrost slow + freeze stun, Energy Rifle wall bounces

## Phase 3 — Networking & Hitreg (spec §7) — "single most important section"
- [ ] Node.js + `ws` (or Colyseus) authoritative WebSocket server
- [ ] Round state machine on server:
  Lobby → Intermission (Map Vote) → Round Active → Round End → Match End (first to 5)
- [ ] Client-side raycast → immediate local hitmarker/audio
- [ ] Client sends hit result (origin, direction, hit object ID, hit position) to server
- [ ] Server sanity check: hit position within reasonable distance of target's
  current server-side position
- [ ] Server second raycast from shooter's server-side position → reported hit
  position to confirm no obstruction
- [ ] Lag compensation: rewind player positions using short position-history buffer
- [ ] Server tick ~20 Hz (50 ms steps); latency 20–200 ms
- [ ] Max rewind window 250 ms (prevents "dying behind cover" >90 ping)
- [ ] Server-side speed validation: displacement per tick ≤ MAX_SPEED*dt*1.5
- [ ] Ammo/fire-rate validation: drop shots faster than 1/cooldown (jitter tolerance)
- [ ] Never trust client damage values

## Phase 4 — Movement Tech (spec §3) — verify against success criteria #1-2
- [ ] Slide-cancel preserves momentum + low hitbox; full slide ends crouched/vulnerable
- [ ] Jiggle-peek baits & punishes enemy shot ≥70% vs competent aimer
- [ ] Slide-cancel window constants exposed: `SLIDE_CANCEL_WINDOW_START = 0.15`,
  `SLIDE_CANCEL_WINDOW_END = 0.55`
- [ ] Dash sideways (not forward), 0.15–0.25 s, DASH_DISTANCE 15 units
- [ ] Rocket/explosive jumping (RPG / Grenade Launcher)
- [ ] Wall-bounce on Construction / Warehouse
- [ ] A-D rhythm (direction change every 0.4–0.5 s)

## Phase 5 — Maps (spec §5)
- [ ] MapSystem: loads maps from GLB; Big-variant selection based on team size
- [ ] Map metadata table: `{name, difficulty, size, features, jumpShardLocation, glbPath}`
- [ ] Arena (26 tiles, smallest, mirrored, ramps)
- [ ] Backrooms (mirrored maze, darkness/fog, echoes)
- [ ] Battleground (vertical bridge, shootable buttons close middle)
- [ ] Bridge (Seoul-inspired, yellow bus, Scythe-dash reachable)
- [ ] Chess (giant chessboard, floating pieces)
- [ ] Construction (crane, red crate, 2nd-floor L-spawns, Jump Shard top of crane)
- [ ] Crossroads (classic 2006, Jump Shard near black area)
- [ ] Big Crossroads (tall green hill, extra trampolines, extra tunnel)
- [ ] Dimension (portal bottom center, stairs/glass, easy to fall)
- [ ] Docks (long-range, breakable glass, water = death, Jump Shard OOB)
- [ ] Graveyard (big church, graveyard, bell on Sudden Death, underground tunnel)
- [ ] Big Graveyard (underground tunnel)
- [ ] Iceberg (3 spawns, tents/radio towers, water = death)
- [ ] Museum (2 floors, purple fossils, scanner buzzer on far doors, Update 23 sightlines)
- [ ] Onyx (lava 5–70 dmg + bounce away, pillars, Jump Shard on rubber duck)
- [ ] Playground (tires, crates, wooden walls, mazes)
- [ ] Sandbox (symmetrical, ramp to sandcastle, shovel climbable ramps to bucket tops)
- [ ] Station (Western train station, destructible windows, 2 stationary trains)
- [ ] Big Station (multiple shops, more trains)
- [ ] Studio (Hollywood set, 2 balconies, van/forklift, tents, green screen)
- [ ] Village, Westown (4 small + 2 big houses, rail track + train, dynamite crates)
- [ ] Shooting Range (lobby-accessible practice)
- [ ] Big Arena, Big Backrooms, Big Onyx, Big Splash (new geometry, not Scale multiplier)
- [ ] Destructible windows (Station, Docks, Westown): `BreakableWindow`, shot-out = permanent open sightline
- [ ] Onyx lava: collision sensor, damage randomInt(5,70), impulse away from surface normal
- [ ] Battleground bridge buttons: raycast hit closes middle section + collider
- [ ] Museum scanner: trigger volume + Web Audio buzzer on pass, no minimap marker
- [ ] Sandbox shovels: climbable ramps to sand bucket tops

## Phase 6 — Game Modes (spec §2)
- [ ] Duel (Core): 1v1–5v5, first to 5 round wins, map vote, Big mandatory for 3v3+
- [ ] Ranked: 1v1, 2v2, 3v3, ELO, entry Level 100 + verification
- [ ] Team Deathmatch: 8v8, most kills before timer
- [ ] Free For All: 16 players, top 5 winners
- [ ] Gun Game: cycle weapons per kill
- [ ] Special Playlists: Juggernaut, Boss Arena (Gargoyle Tower), Obby, Spleef

## Phase 7 — Economy & Progression (spec §6)
- [ ] Keys currency; free sources: Beginner Tasks (18), Daily Tasks (6/day),
  Bonus Tasks (1–3), Prize Wheel (4 or 10, 5/week), Weapon Contracts,
  Season Pass free track, Codes
- [ ] Key costs: Standard 5–75, Prime 200–550, Contraband 600–700
- [ ] Level gates: L3 SMG, L5 Assault Rifle, L6 Katana, L8 Shotgun, L12 Sniper
- [ ] Weapon Contract milestones: 5 elims → 1 Key, 5 min → 1 Key, 20 min → Charm Capsule,
  1 hr → wrap, 24 hr → wrap
- [ ] Free Trials: ad for single-duel trial of any locked standard weapon
- [ ] ~55–60 keys/week free income target

## Phase 8 — UI, HUD & Visual Style (spec §8)
- [ ] Crosshair settings: color, thickness, transparency, outline, static/dynamic
- [ ] Settings menu: Graphics Quality (pixel ratio, shadow map, AA), Max Frame Rate
- [ ] Sensitivity, FOV (90–105, 97 default), Crosshair settings
- [ ] Kill feed top-right
- [ ] Round timer + score (rounds won per team) central/top
- [ ] Health bar + ammo counter fixed corners
- [ ] Key balance top in menus; green `+` opens currency shop
- [ ] Match Point: desaturate screen; Sudden Death: bell + red screen tint
- [ ] Texture packs: "No textures," "No skybox," "No hands" support
- [ ] Simple `THREE.Color` background or low-res cubemap

## Phase 9 — Performance & Anti-Cheat (spec §9.3)
- [ ] Instancing: `THREE.InstancedMesh` for repeated static geometry
- [ ] LOD: `THREE.LOD` high→low poly at distance
- [ ] Frustum culling via chunked geometry
- [ ] Server speed validation + rubber-band
- [ ] Ammo/fire-rate validation

## Phase 10 — Asset Pipeline (spec §10)
- [ ] `@gltf-transform/cli` optimize: Draco + WebP, texture-size 1024
- [ ] Every loaded model < 10 MB, loads < 2 seconds
- [ ] Kenney Blaster Kit / Quaternius guns for weapons
- [ ] Quaternius Universal Base Characters for players
- [ ] Kenney environment packs for map props
- [ ] GLTFLoader + DRACOLoader setup

## Phase 11 — Success Criteria Verification (spec §11)
All 15 criteria verified in live browser playtest (see checklist items above).
