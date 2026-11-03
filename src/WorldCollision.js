/** Shared horizontal collision for the prototype's common cover and crates. */
export const BASE_OBSTACLES = Object.freeze([
  { minX: -3, maxX: 3, minZ: -3, maxZ: 3, height: 4 },
  ...Array.from({ length: 36 }, (_, i) => {
    const x = (i % 6) * 6 - 15;
    const z = Math.floor(i / 6) * 6 - 15;
    return { minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1, height: 2 };
  }),
]);

/** Axis-separated movement lets a player slide along the side of cover. */
export function resolveHorizontal(previous, next, footY, obstacles = BASE_OBSTACLES, bounds = 58, radius = 0.4, stepHeight = 0) {
  const collides = (x, z) => obstacles.some(box =>
    !box.step && (box.minY ?? 0) < footY + 1.7 && footY + stepHeight < box.height && x > box.minX - radius && x < box.maxX + radius &&
    z > box.minZ - radius && z < box.maxZ + radius);
  const clamp = value => Math.max(-bounds, Math.min(bounds, value));
  let x = clamp(next.x), z = clamp(next.z);
  if (collides(x, previous.z)) x = previous.x;
  if (collides(x, z)) z = previous.z;
  return { x, z };
}

/** Highest accessible top under a player, allowing small stair steps. */
export function supportHeight(x, z, previousFoot, obstacles, stepHeight = .4) {
  let ground = 0;
  for (const box of obstacles) {
    if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ &&
        box.height > ground && box.height <= previousFoot + stepHeight + 1e-6) ground = box.height;
  }
  return ground;
}
