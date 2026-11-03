/** Hand-authored, approximate layouts informed by the RIVALS wiki and reference imagery.
 * All solid boxes are shared with the server for movement and shot occlusion.
 * Coordinates are in game units; these are not extracted Roblox assets.
 */
const layouts = {};
function create(name, floor, sky, fog = 150) {
  return layouts[name] = { name, floor, sky, fog, solids: [], details: [] };
}
function box(map, name, x, z, w, d, h, color, options = {}) {
  const entry = { name, x, z, w, d, h, y: options.y ?? h / 2, color, shape: options.shape || 'box' };
  (options.detail ? map.details : map.solids).push(entry);
  return entry;
}
function wall(map, name, x, z, w, d, h, color) { return box(map, name, x, z, w, d, h, color); }
function detail(map, name, x, z, w, d, h, color, y = h / 2, shape = 'box') {
  box(map, name, x, z, w, d, h, color, { detail: true, y, shape });
}
function perimeter(map, color, height = 12) {
  wall(map, 'perimeter', -59, 0, 2, 120, height, color);
  wall(map, 'perimeter', 59, 0, 2, 120, height, color);
  wall(map, 'perimeter', 0, -59, 120, 2, height, color);
  wall(map, 'perimeter', 0, 59, 120, 2, height, color);
}
// Short rises have small steps that both the server and client can traverse.
function stairs(map, name, x, startZ, direction, width, length, rise, color) {
  const count = Math.ceil(rise / .32);
  for (let i = 0; i < count; i++) {
    const depth = length / count;
    const height = rise * (i + 1) / count;
    box(map, name, x, startZ + direction * (i + .5) * depth, width, depth + .02, height, color);
  }
}
function arena(big = false) {
  const m = create(big ? 'Big Arena' : 'Arena', 0xcbd1d7, 0xbac9da);
  perimeter(m, 0xb6bec8, 11);
  // Rotationally mirrored lanes with staggered cover, drawn from the classic arena layout.
  for (const side of [-1, 1]) {
    wall(m, 'central_cover', side * 7, 0, 9, 3, 5, 0xe3e7ea);
    wall(m, 'lane_wall', side * 21, side * 9, 3, 18, 5, 0xd4dce3);
    wall(m, 'short_cover', side * 11, side * 23, 10, 3, 4, 0xe9edf0);
    wall(m, 'outer_cover', side * 38, side * 12, 3, 16, 4, 0xd9e1e7);
    stairs(m, 'arena_ramp', side * 29, side * 26, -side, 9, 13, 3.2, 0xd9dfe5);
    box(m, 'arena_platform', side * 29, side * 8, 9, 10, 3.2, 0xc3ced9);
    if (big) {
      wall(m, 'big_lane_cover', side * 43, -side * 22, 3, 18, 5, 0xbcc7d4);
      stairs(m, 'big_ramp', side * 44, -side * 10, -side, 7, 10, 2.4, 0xd9dfe5);
    }
  }
  return m;
}
function backrooms(big = false) {
  const m = create(big ? 'Big Backrooms' : 'Backrooms', 0x77682e, 0x5e542e, 75);
  perimeter(m, 0x8d7c40, 9);
  // Offset partial walls create multiple routes, not a solid row of boxes.
  for (const side of [-1, 1]) {
    wall(m, 'maze_wall', side * 18, side * 24, 2, 20, 8, 0xb1a05f);
    wall(m, 'maze_wall', side * 32, side * 11, 23, 2, 8, 0xa99757);
    wall(m, 'maze_wall', side * 12, side * 5, 2, 20, 8, 0xb5a467);
    wall(m, 'maze_wall', side * 28, -side * 13, 2, 18, 8, 0xa99757);
    wall(m, 'maze_wall', side * 7, -side * 19, 16, 2, 8, 0xb1a05f);
    wall(m, 'maze_wall', side * 43, -side * 30, 2, 20, 8, 0xa99757);
    if (big) wall(m, 'extra_maze', -side * 20, side * 36, 20, 2, 8, 0xb1a05f);
  }
  // Ceiling and fluorescent panels are decorative, so they don't obstruct the overhead preview.
  detail(m, 'ceiling', 0, 0, 118, 118, .4, 0x8c8053, 8.4);
  for (let x = -42; x <= 42; x += 21) for (let z = -42; z <= 42; z += 21)
    detail(m, 'ceiling_light', x, z, 5, 2.5, .08, 0xffe7a5, 8.15);
  return m;
}
function battleground() {
  const m = create('Battleground', 0x82a982, 0xc5d9e4);
  perimeter(m, 0x929da8);
  // Distinct center bridge, paired blue/white approaches and side barriers.
  for (const side of [-1, 1]) {
    wall(m, 'bridge_support', side * 9, 0, 3, 12, 7, 0xaaaeb4);
    wall(m, 'spawn_barrier', side * 21, side * 26, 16, 3, 4, 0xe3e7e6);
    stairs(m, 'blue_ramp', side * 9, side * 24, -side, 7, 14, 3.2, 0x4277b2);
    box(m, 'blue_platform', side * 9, side * 8, 7, 5, 3.2, 0x4277b2);
    stairs(m, 'outer_ramp', side * 41, side * 20, -side, 9, 16, 2.6, 0xe5e7e3);
  }
  detail(m, 'bridge_deck', 0, 0, 25, 9, 1, 0xe2e5e5, 7.5);
  detail(m, 'bridge_arch', 0, 0, 17, 2, 1.2, 0x788b99, 8.5);
  detail(m, 'bridge_button', 7, 7, 1.5, 1.5, 1, 0xef3f42);
  return m;
}
function bridge() {
  const m = create('Bridge', 0x818b8e, 0x9bb8cd);
  perimeter(m, 0x788790, 12);
  // Yellow bus and road barriers; the bus is the recognizable center landmark.
  box(m, 'yellow_bus', 0, 0, 8, 20, 5.3, 0xeabf35);
  detail(m, 'bus_window_left', -4.03, 0, .08, 14, 1.8, 0x354c5c, 3.6);
  detail(m, 'bus_window_right', 4.03, 0, .08, 14, 1.8, 0x354c5c, 3.6);
  for (const end of [-1, 1]) {
    detail(m, 'bus_windscreen', 0, end * 10.04, 7, .08, 1.8, 0x354c5c, 3.6);
    detail(m, 'bus_bumper', 0, end * 10.1, 8, .18, .5, 0x34383b, .4);
    for (const side of [-1,1]) detail(m, 'bus_lamp', side * 2.8, end * 10.15, .7, .12, .5, 0xf6df8d, 1.1);
  }
  for (const side of [-1, 1]) {
    wall(m, 'road_barrier', side * 17, side * 20, 3, 18, 3, 0xd0d5ce);
    wall(m, 'bridge_pillar', side * 34, side * 10, 5, 5, 12, 0x7b8790);
    wall(m, 'road_barrier', side * 28, -side * 19, 3, 15, 3, 0xd0d5ce);
    detail(m, 'lane_marking', side * 11, 0, .35, 90, .04, 0xf1e7b6, .025);
    detail(m, 'cable', side * 34, 0, .6, 95, .6, 0x586c76, 12);
  }
  return m;
}
function chess() {
  const m = create('Chess', 0xbeb6a8, 0x8f9daa);
  perimeter(m, 0x473f3c, 5);
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++)
    detail(m, 'board_square', (x - 3.5) * 14, (z - 3.5) * 14, 14, 14, .08, (x + z) % 2 ? 0x574b47 : 0xeee8db, .05);
  for (const side of [-1, 1]) for (const x of [-27, -9, 9, 27]) {
    box(m, 'chess_piece', x, side * (x === 9 ? 8 : 17), 5, 5, x === 9 ? 7 : 5, side < 0 ? 0x292d31 : 0xf3eee0, { shape: 'cylinder' });
    detail(m, 'piece_head', x, side * (x === 9 ? 8 : 17), 3, 3, 3, side < 0 ? 0x292d31 : 0xf3eee0, x === 9 ? 8 : 6, 'sphere');
  }
  return m;
}
function sandbox() {
  const m = create('Sandbox', 0xd8b66f, 0x8ec6db);
  perimeter(m, 0x926743, 10);
  // Castle wall is hollow enough to move around; bucket colors and shovels define the silhouette.
  for (const side of [-1, 1]) {
    wall(m, 'castle_wall', side * 10, 0, 3, 15, 5, 0xe2c481);
    wall(m, 'castle_tower', side * 10, side * 8, 6, 6, 6, 0xd9b874);
    for (const dx of [-2,2]) for (const dz of [-2,2])
      detail(m, 'castle_battlement', side * 10 + dx, side * 8 + dz, 1.6, 1.6, 1.3, 0xe7cc8f, 6.65);
    detail(m, 'castle_flagpole', side * 10, side * 8, .18, .18, 3, 0x8f7047, 8);
    detail(m, 'castle_flag', side * 10 + .9, side * 8, 1.8, .08, .9, side < 0 ? 0xd9534f : 0x4c93cb, 8.8);
    stairs(m, 'castle_ramp', 0, side * 26, -side, 7, 12, 2.4, 0xe9cf90);
    box(m, 'bucket', side * 32, side * 4, 11, 11, 3.2, side < 0 ? 0xe4564d : 0x5497cd, { shape: 'cylinder' });
    detail(m, 'sand_in_bucket', side * 32, side * 4, 10.4, 10.4, .1, 0xe6cc8e, 3.25, 'cylinder');
    stairs(m, 'shovel_ramp', side * 32, -side * 14, side, 5, 12, 3.2, 0xe5dccc);
  }
  return m;
}
function onyx(big = false) {
  const m = create(big ? 'Big Onyx' : 'Onyx', 0x312b31, 0x4a2022, 120);
  perimeter(m, 0x392d32, 12);
  // Lava is presently visual only; safe-height stepping stones show the intended route.
  detail(m, 'lava', 0, 0, 70, 70, .06, 0xf05216, .04, 'cylinder');
  for (const [x,z,r,h] of [[-27,-25,9,1], [27,25,9,1], [-24,24,8,.9], [24,-24,8,.9], [0,0,11,1.2], [-13,-8,6,.9], [13,8,6,.9], [-10,15,6,1], [10,-15,6,1]]) {
    box(m, 'onyx_stone', x, z, r * 2, r * 2, h, 0x494149, { shape: 'cylinder' });
  }
  for (const side of [-1,1]) {
    box(m, 'onyx_pillar', side * 37, side * 8, 5, 5, 7, 0x51444b, { shape:'cylinder' });
    if (big) box(m, 'extra_stone', side * 42, -side * 22, 13, 13, .9, 0x494149, {shape:'cylinder'});
  }
  return m;
}

// Open-sided building: door gap in its front wall, with a decorative roof.
function building(m, x, z, width, depth, height, wallColor, roofColor) {
  const t = 1.2, front = z - depth / 2;
  wall(m, 'building_side', x - width/2, z, t, depth, height, wallColor);
  wall(m, 'building_side', x + width/2, z, t, depth, height, wallColor);
  wall(m, 'building_back', x, z + depth/2, width, t, height, wallColor);
  wall(m, 'building_front', x - width*.34, front, width*.32, t, height, wallColor);
  wall(m, 'building_front', x + width*.34, front, width*.32, t, height, wallColor);
  detail(m, 'roof', x, z, width + 2, depth + 2, .7, roofColor, height + .35);
}
function docks() {
  const m = create('Docks', 0x929ba0, 0xa5c6d5); perimeter(m, 0x818c90, 6);
  for (const side of [-1,1]) {
    building(m, side * 37, side * 26, 17, 15, 7, 0xb7b5a6, 0x617582);
    box(m, 'shipping_container', side * 17, side * 6, 8, 17, 5, side < 0 ? 0xb54b40 : 0x447ba0);
    box(m, 'dock_crate', -side * 24, side * 20, 4, 4, 4, 0xb28b58);
    detail(m, 'water', side * 54, 0, 8, 100, .04, 0x3d849c, .03);
  }
  return m;
}
function station(big = false) {
  const m = create(big ? 'Big Station' : 'Station', 0xb59670, 0xd5a484); perimeter(m, 0x8f6e59, 10);
  for (const side of [-1,1]) {
    building(m, side * 39, side * 19, 19, 19, 9, 0xbca486, 0x7d5142);
    box(m, 'train_car', side * 12, 0, 8, 30, 6, side < 0 ? 0x7b4d46 : 0x777166);
    detail(m, 'rail', side * 12, 0, .7, 108, .15, 0x4f5151, .1);
    detail(m, 'wire', side * 35, 0, .15, 90, .15, 0x3d3632, 13);
    wall(m, 'utility_pole', side * 35, -side * 39, 1, 1, 13, 0x735644);
    if (big) box(m, 'extra_train', side * 28, -side * 13, 7, 20, 5, 0x776355);
  }
  return m;
}
function playground() {
  const m = create('Playground', 0x8f9b6b, 0xbad1db); perimeter(m, 0x8a6547, 10);
  for (const side of [-1,1]) {
    box(m, 'container', side * 35, side * 23, 9, 15, 6, side < 0 ? 0x617d87 : 0x926352);
    wall(m, 'wooden_wall', side * 15, side * 20, 18, 1.2, 6, 0xa57d54);
    wall(m, 'wooden_wall', side * 21, -side * 7, 1.2, 19, 6, 0x9a704a);
    wall(m, 'wooden_wall', -side * 4, side * 3, 14, 1.2, 6, 0xb08a5f);
    box(m, 'tire_stack', side * 33, -side * 8, 4, 4, 2, 0x33373a, {shape:'cylinder'});
  }
  return m;
}
function construction() {
  const m = create('Construction', 0xa2a4a0, 0xc3d2dc); perimeter(m, 0x8c999f);
  for (const side of [-1,1]) {
    wall(m, 'concrete_wall', side * 30, side * 16, 2, 24, 8, 0xb4b7b5);
    wall(m, 'concrete_wall', side * 23, -side * 15, 18, 2, 6, 0xaeb3b3);
    stairs(m, 'site_ramp', side * 33, side * 35, -side, 8, 13, 3.2, 0xcbb48a);
    box(m, 'site_platform', side * 33, side * 20, 8, 10, 3.2, 0xa5a9a9);
    box(m, 'construction_crate', side * 12, side * 13, 7, 8, 4, 0xa87555);
  }
  wall(m, 'crane_pillar', 46, 5, 4, 4, 24, 0xe7ad35);
  detail(m, 'crane_boom', 23, 5, 48, 2, 2, 0xe7ad35, 23);
  detail(m, 'suspended_container', 0, 5, 12, 8, 5, 0xb44e44, 11);
  return m;
}
function crossroads(big = false) {
  const m = create(big ? 'Big Crossroads' : 'Crossroads', 0x6b9b58, 0xa8d3ea); perimeter(m, 0x76975e, 7);
  for (const side of [-1,1]) {
    wall(m, 'castle_tower', side*31, side*19, 8, 8, 12, 0xb3b5ac);
    wall(m, 'castle_wall', side*20, side*19, 18, 2, 6, 0xb3b5ac);
    stairs(m, 'hill_ramp', -side*30, side*31, -side, 10, 17, 4, 0x79a857);
    box(m, 'hill', -side*30, side*8, 16, 15, 4, 0x78a45b);
    if (big) wall(m, 'extra_tower', side*45, -side*27, 8, 8, 10, 0xb3b5ac);
  }
  detail(m, 'central_bridge', 0, 0, 46, 6, 1, 0x966f4a, 6);
  return m;
}
function graveyard(big = false) {
  const m = create(big ? 'Big Graveyard' : 'Graveyard', 0x58635b, 0x303b48, 100); perimeter(m, 0x616b68, 9);
  building(m, -25, -4, 22, 28, 11, 0x777a78, 0x3d424b);
  wall(m, 'church_tower', -25, -19, 9, 8, 18, 0x777a78);
  for (const side of [-1,1]) for (let i = 0; i < (big ? 5 : 3); i++)
    box(m, 'gravestone', side * (8 + i * 7), side * (8 + (i%2)*10), 3.5, 1, 3, 0xa3a6a1);
  return m;
}
function ice(kind = 'Iceberg') {
  const village = kind === 'Village';
  const m = create(kind, 0xc7dce0, 0x9ebfcf); perimeter(m, 0x9fbfc8, 7);
  for (const side of [-1,1]) {
    if (village) building(m, side*34, side*17, 16, 16, 7, 0x896b52, 0xd8e2de);
    else {
      building(m, side*28, side*16, 12, 12, 5, side < 0 ? 0xc36c63 : 0xe2dfd1, 0xb65d56);
      wall(m, 'radio_tower', side*38, -side*22, 1.5, 1.5, 17, 0x637d88);
    }
    box(m, 'ice_cover', side*11, side*5, 8, 5, 3, 0xa8d3db);
    detail(m, 'water', side*54, 0, 8, 100, .04, 0x457f95, .03);
  }
  if (village) detail(m, 'campfire', 0, 0, 3, 3, 2, 0xf58935, 1);
  return m;
}
function westown() {
  const m = create('Westown', 0xc3a172, 0xd6b69a); perimeter(m, 0x9a795d, 10);
  for (const side of [-1,1]) {
    building(m, side*38, side*20, 16, 17, 9, 0xa77a52, 0x77523d);
    building(m, side*38, -side*19, 11, 12, 6, 0xb68d65, 0x73503d);
    box(m, 'train_car', side*9, 0, 8, 22, 5, 0x69574a);
    detail(m, 'rail', side*9, 0, .5, 105, .15, 0x514c46, .1);
  }
  return m;
}
function studio() {
  const m = create('Studio', 0x767c7d, 0xb9c8cb); perimeter(m, 0x5d6667, 12);
  building(m, -30, 0, 18, 30, 10, 0xb38b68, 0x785d4d);
  wall(m, 'green_screen', 43, 0, 2, 35, 12, 0x3b9f51);
  for (const side of [-1,1]) {
    box(m, 'film_van', side*8, side*14, 7, 14, 4, 0xd4d5cb);
    wall(m, 'set_barrier', side*23, -side*21, 14, 2, 4, 0x9e8c74);
  }
  return m;
}
function dimension() {
  const m = create('Dimension', 0x6c657c, 0x594c78); perimeter(m, 0x53445e, 12);
  for (const side of [-1,1]) {
    wall(m, 'ruined_wall', side*22, side*15, 3, 22, 8, 0xb1a9bc);
    wall(m, 'ruined_wall', side*6, side*25, 16, 2, 5, 0x978ba5);
    stairs(m, 'dimension_ramp', side*34, side*26, -side, 8, 13, 2.5, 0x9089a1);
  }
  detail(m, 'portal', 0, 0, 13, 13, .12, 0xa63de4, .08, 'cylinder');
  detail(m, 'floating_cube', 0, 0, 9, 9, 9, 0x895dc5, 12);
  return m;
}
function museum() {
  const m = create('Museum', 0xc7bba7, 0xd3c8bd); perimeter(m, 0x9c968e, 12);
  for (const side of [-1,1]) {
    wall(m, 'gallery_wall', side*30, side*6, 2, 36, 9, 0xdfd6c9);
    wall(m, 'display_case', side*13, side*15, 8, 3, 3, 0x8e7c70);
    stairs(m, 'museum_stairs', side*7, side*26, -side, 7, 14, 3.2, 0xe2d8ca);
    box(m, 'museum_landing', side*7, side*8, 7, 9, 3.2, 0xc6b9aa);
    detail(m, 'purple_fossil', side*19, -side*4, 3, 3, 5, 0x9872a8, 2.5, 'cylinder');
  }
  return m;
}
function splash() {
  const m = create('Big Splash', 0xaad9de, 0x9ad4ef); perimeter(m, 0x61a4bc, 8);
  for (const side of [-1,1]) {
    box(m, 'pool_island', side*28, side*16, 16, 14, 2.4, 0xf5cb54);
    stairs(m, 'pool_ramp', side*28, side*32, -side, 7, 10, 2.4, 0x55b6d5);
    wall(m, 'splash_cover', side*11, side*8, 10, 3, 5, 0xf08b62);
    detail(m, 'slide', side*38, -side*15, 7, 25, 1, 0xe96a71, 5);
  }
  return m;
}
function shootingRange() {
  const m = create('Shooting Range', 0xa5a8a6, 0xb2c6cf); perimeter(m, 0x8d989b, 10);
  for (const side of [-1,1]) {
    wall(m, 'range_wall', side*22, side*12, 3, 24, 6, 0xc3c7c5);
    box(m, 'range_cover', side*10, -side*16, 7, 3, 4, 0xabb4b2);
    wall(m, 'range_pillar', side*40, -side*25, 4, 4, 12, 0x9ba4a6);
    detail(m, 'zipline', side*40, 0, .25, 80, .25, 0x3b4951, 11);
  }
  return m;
}
arena(); arena(true); backrooms(); backrooms(true); battleground(); bridge(); chess(); sandbox(); onyx(); onyx(true);
docks(); station(); station(true); playground(); construction(); crossroads(); crossroads(true); graveyard(); graveyard(true);
ice(); ice('Village'); westown(); studio(); dimension(); museum(); splash(); shootingRange();

export const REBUILT_MAPS = Object.freeze(Object.keys(layouts));
export function getMapLayout(name) { return layouts[name] || null; }
const obstacleCache = new Map();
export function getMapObstacles(name) {
  const map = getMapLayout(name);
  if (!map) return null;
  if (obstacleCache.has(name)) return obstacleCache.get(name);
  const obstacles = map.solids.map(b => ({ name: b.name, minX: b.x-b.w/2, maxX: b.x+b.w/2,
    minZ: b.z-b.d/2, maxZ: b.z+b.d/2, minY: b.y-b.h/2, height: b.y+b.h/2, step: b.name.includes('ramp') }));
  obstacleCache.set(name, obstacles);
  return obstacles;
}
