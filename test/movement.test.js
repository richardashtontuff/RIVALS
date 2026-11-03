import test from 'node:test';
import assert from 'node:assert/strict';
import { MovementController } from '../src/MovementController.js';
import { resolveHorizontal } from '../src/WorldCollision.js';

test('idle movement settles on the floor instead of bouncing', () => {
  const mc = new MovementController();
  for (let i = 0; i < 180; i++) mc.update(1 / 60, {}, i * 1000 / 60);
  assert.equal(mc.position.y, 0.85);
  assert.equal(mc.velocity.y, 0);
  assert.equal(mc.onGround, true);
});

test('prototype cover blocks horizontal movement, but can be cleared above its height', () => {
  assert.deepEqual(resolveHorizontal({x: 4, z: 0}, {x: 2, z: 0}, 0), {x: 4, z: 0});
  assert.deepEqual(resolveHorizontal({x: 4, z: 0}, {x: 2, z: 0}, 5), {x: 2, z: 0});
});
