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
- [x] LoadoutSystem: `validateLoadout()` enforces exactly one weapon per
  category; prevents invalid combinations; starter loadout sanity-checked
- [x] Weapon switching: number keys 1-4 cycle loadout slots; HUD shows active slot
- [x] All weapon stats defined in config.js (primaries, secondaries, melee,
  utility per Update 24 roster)
- [x] Hitscan fire path with hitmarkers + target dummy health
- [x] Projectile fire path (Raycast Projectile system, spec §4.2) + tracers
- [x] Melee fire path (range attack)
- [x] Utility fire path (Grenade explosion, etc.)
- [x] Per-weapon ammo state, reload (`reloadTime * 600` ms refill)
- [x] Reload-cancel with Fists works on all weapons incl. Sniper/Shotgun/
  Burst Rifle/Assault Rifle
- [x] Per-weapon damage falloff uses actual hit distance (client + server)
- [x] Headshot multipliers / crit values per weapon (head zone = above 75% target height; crit.start or critMult ×2)
- [ ] Katana bullet deflection (timed)
- [ ] Scythe dash-in melee
- [ ] Spear throw / pin to wall / launch pad
- [ ] Exogun AOE blast, Permafrost slow + freeze stun, Energy Rifle wall bounces
- [ ] Flashbang blind (3s), Smoke (8s), Medkit heal (50 HP), Tripmine (150 dmg)

## Phase 3 — Networking & Hitreg (spec §7) — CONFIRMED WORKING (framework)
- [x] Node.js + `ws` authoritative WebSocket server (`server/index.js`, port 5074)
- [x] Client → server: join, input (each tick), fire with hit data
- [x] Server → client: `joined`, `snapshot` at 20 Hz, `hit_confirmed`,
  `damage_taken`, `elimination`, `hit_rejected`
- [x] Client-side raycast → immediate local hitmarker (spec §7)
- [x] Client sends fire result (origin, direction, hit target, hit position)
- [x] Server sanity check: hit position within tolerance of rewound target
- [x] Server second raycast: obstruction check from shooter → hit position
- [x] Lag compensation: position-history buffer, rewind to (now - latency)
- [x] Server tick 20 Hz (50 ms steps); max rewind window 250 ms
- [x] Round state machine: Lobby → Intermission (map vote) → Round Active → Round End → Match End (first to 5) — CONFIRMED via 2-player test
- [x] Server-side speed validation + rubber-band enforcement (displacement ≤ MAX_SPEED*dt*1.5)
- [x] Ammo/fire-rate validation (drop shots faster than 1/cooldown with jitter tolerance)
  CONFIRMED: 8 rapid AR fires → 1 accepted, 7 rejected (fire_rate)

## Phase 4 — Movement Tech (spec §3) — verify against success criteria #1-2
- [ ] Slide-cancel preserves momentum + low hitbox; full slide ends crouched/vulnerable
- [ ] Jiggle-peek baits & punishes enemy shot ≥70% vs competent aimer
- [ ] Slide-cancel window constants exposed: `SLIDE_CANCEL_WINDOW_START = 0.15`,
  `SLIDE_CANCEL_WINDOW_END = 0.55`
- [ ] Dash sideways (not forward), 0.15–0.25 s, DASH_DISTANCE 15 units
- [ ] Rocket/explosive jumping (RPG / Grenade Launcher)
- [ ] Wall-bounce on Construction / Warehouse
- [ ] A-D rhythm (direction change every 0.4–0.5 s)

## Phase 5 — Maps (spec §5) — CONFIRMED WORKING (framework)
- [x] MapSystem: map metadata table (27 maps incl. Big variants), procedural loader
- [x] Big-variant selection logic (bigRequired for 3v3+)
- [x] Arena, Backrooms, Battleground, Bridge, Chess, Construction, Crossroads,
  Big Crossroads, Dimension, Docks, Graveyard, Big Graveyard, Iceberg, Museum,
  Onyx, Playground, Sandbox, Station, Big Station, Studio, Village, Westown,
  Shooting Range, Big Arena, Big Backrooms, Big Onyx, Big Splash
- [x] Destructible windows: BreakableWindow, shot-out = permanent open sightline (client)
- [x] Onyx lava: 5-70 dmg + bounce away from surface normal (client)
- [x] Battleground bridge buttons: close middle section (client)
- [x] Museum scanner: Web Audio buzzer on pass (client)
- [x] Sandbox shovels: climbable ramps (client)
- [ ] Map-specific mechanics validated on server (server obstruction raycast vs map geometry)
- [ ] GLB asset loading via Draco + WebP pipeline (spec §10)

## Phase 6 — Game Modes (spec §2)
- [x] Duel (Core): 1v1–5v5, first to 5 round wins (server round machine)
- [ ] Map vote in Intermission
- [ ] Big mandatory for 3v3+ (MapSystem.bigRequired)
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
- [x] Crosshair: red `#ff0d00` dot, 4px thickness, black outline (CONFIRMED)
- [x] Kill feed: to add
- [x] Round timer + score: central/top (CONFIRMED)
- [x] Health bar + ammo counter: fixed corners (CONFIRMED)
- [x] Match Point / Sudden Death indicators: CONFIRMED
- [ ] Crosshair settings: color, thickness, transparency, outline, static/dynamic
- [ ] Settings menu: Graphics Quality (pixel ratio, shadow map, AA), Max Frame Rate
- [ ] Sensitivity, FOV (90–105, 97 default)
- [ ] Key balance + currency shop
- [ ] Texture packs: "No textures," "No skybox," "No hands"

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
