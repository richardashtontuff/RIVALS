import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseWeapon, purchase, startFreeTrial, updateContract } from '../src/EconomySystem.js';

test('owned starter weapons work; affordability alone does not grant use', () => {
  const player = { level: 1, keys: 100, ownedWeapons: new Set(['ASSAULT_RIFLE']) };
  assert.equal(canUseWeapon(player, 'ASSAULT_RIFLE').allowed, true);
  assert.equal(canUseWeapon(player, 'SNIPER').allowed, false);
  player.level = 12;
  assert.equal(canUseWeapon(player, 'SNIPER').allowed, false);
  assert.equal(purchase(player, 'SNIPER').success, true);
  assert.equal(player.keys, 25);
  assert.equal(canUseWeapon(player, 'SNIPER').allowed, true);
});

test('standard trials grant use and contract rewards are only awarded once', () => {
  const player = { level: 12, keys: 0, ownedWeapons: new Set() };
  assert.equal(startFreeTrial(player, 'SNIPER').allowed, true);
  assert.equal(canUseWeapon(player, 'SNIPER').allowed, true);
  assert.equal(startFreeTrial(player, 'MINIGUN').allowed, false);
  const rewards = updateContract(player, 'SNIPER', { eliminations: 5, playtimeMinutes: 5 });
  assert.equal(rewards.length, 2);
  assert.equal(player.keys, 2);
  assert.equal(updateContract(player, 'SNIPER').length, 0);
});
