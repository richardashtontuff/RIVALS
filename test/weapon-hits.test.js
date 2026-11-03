import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WeaponSystem } from '../src/WeaponSystem.js';
import { CONFIG } from '../src/config.js';

test('hits a player along a negative axis and respects visible cover', () => {
  const world = new THREE.Group();
  const scene = new THREE.Scene(); scene.add(world);
  const remote = new THREE.Mesh(new THREE.BoxGeometry(.7, 1.7, .7), new THREE.MeshBasicMaterial());
  remote.position.set(0, .85, -10);
  remote.userData = { playerId: 'enemy', health: 150 };
  scene.add(remote);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1), new THREE.MeshBasicMaterial());
  cover.position.set(0, 1.5, -5); cover.name = 'cover'; world.add(cover);
  scene.updateMatrixWorld(true);
  const weapon = new WeaponSystem({}, scene, world, { getRemotePlayers: () => new Map([['enemy', { mesh: remote }]]) });
  const origin = new THREE.Vector3(0, 1.65, 0), dir = new THREE.Vector3(0, 0, -1);
  assert.equal(weapon._doHitscan(CONFIG.WEAPONS.ASSAULT_RIFLE, origin, dir).targetId, 'cover');
  cover.visible = false;
  assert.equal(weapon._doHitscan(CONFIG.WEAPONS.ASSAULT_RIFLE, origin, dir).targetId, 'enemy');
});
