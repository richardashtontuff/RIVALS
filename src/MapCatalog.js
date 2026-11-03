/** Maps offered in the vote. Names must also exist in MapSystem's metadata. */
export const MAP_POOL = Object.freeze([
  'Arena', 'Backrooms', 'Battleground', 'Bridge', 'Chess', 'Construction',
  'Crossroads', 'Dimension', 'Docks', 'Graveyard', 'Iceberg', 'Museum',
  'Onyx', 'Playground', 'Sandbox', 'Station', 'Studio', 'Village', 'Westown',
  'Shooting Range', 'Big Arena', 'Big Backrooms', 'Big Crossroads',
  'Big Graveyard', 'Big Onyx', 'Big Splash', 'Big Station',
]);

/** Paths are constructed only for known map names, never from arbitrary input. */
export function mapPreviewPath(name) {
  if (!MAP_POOL.includes(name)) return null;
  return `/assets/maps/${name.toLowerCase().replaceAll(' ', '-')}.jpg`;
}
