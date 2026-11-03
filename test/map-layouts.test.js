import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_POOL } from '../src/MapCatalog.js';
import { REBUILT_MAPS, getMapLayout, getMapObstacles } from '../src/MapLayouts.js';
import { resolveHorizontal, supportHeight } from '../src/WorldCollision.js';

test('every map has an authored layout, clear spawns, and a traversable ground route', () => {
  assert.deepEqual([...REBUILT_MAPS].sort(), [...MAP_POOL].sort());
  for (const name of MAP_POOL) {
    const map = getMapLayout(name), obstacles = getMapObstacles(name);
    assert.ok(map.solids.length > 0, name);
    for (const z of [-35, 35]) {
      const blocked = obstacles.some(b => !b.step && b.minY < 1.7 && b.height > .4 && b.minX < .4 && b.maxX > -.4 && z > b.minZ-.4 && z < b.maxZ+.4);
      assert.equal(blocked, false, `${name}: spawn ${z} is blocked`);
    }
    // Coarse ground-plane connectivity check. Elevated geometry is ignored here;
    // map-specific traversal still requires manual testing.
    const key = (x,z) => `${x},${z}`;
    const queue = [[0,35]], seen = new Set([key(0,35)]);
    let found = false;
    for (let i=0; i<queue.length && !found; i++) {
      const [x,z] = queue[i];
      if (x === 0 && z === -35) { found=true; break; }
      for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx, nz=z+dz, k=key(nx,nz);
        if (Math.abs(nx)>57 || Math.abs(nz)>57 || seen.has(k)) continue;
        const p=resolveHorizontal({x,z},{x:nx,z:nz},0,obstacles,58,.4,.4);
        if (p.x!==nx || p.z!==nz) continue;
        seen.add(k); queue.push([nx,nz]);
      }
    }
    assert.ok(found, `${name}: no ground route between spawns`);
  }
});

test('steps offer reachable support but tall cover remains solid', () => {
  const obstacles=getMapObstacles('Arena');
  const first=obstacles.find(b=>b.name==='arena_ramp');
  assert.ok(first.step);
  const x=(first.minX+first.maxX)/2, z=(first.minZ+first.maxZ)/2;
  assert.ok(supportHeight(x,z,0,obstacles) > 0);
  const wall=obstacles.find(b=>b.name==='central_cover');
  const p=resolveHorizontal({x:0,z:0},{x:wall.minX+.5,z:0},0,obstacles,58,.4,.4);
  assert.equal(p.x,0);
});

test('large variants add geometry rather than just renaming the standard map', () => {
  for (const [small,big] of [['Arena','Big Arena'],['Backrooms','Big Backrooms'],['Onyx','Big Onyx'],['Crossroads','Big Crossroads'],['Graveyard','Big Graveyard'],['Station','Big Station']])
    assert.ok(getMapLayout(big).solids.length > getMapLayout(small).solids.length, big);
});
