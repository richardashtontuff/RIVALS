/**
 * RIVALS — EconomySystem (spec §6).
 *
 * Keys currency: free sources, key costs, level gates, weapon contracts.
 * Server-authoritative; client displays balance and can purchase weapons.
 */
import { CONFIG } from './config.js';

const E = CONFIG.ECONOMY;
const W = CONFIG.WEAPONS;

/** Level gates for weapon unlocks (spec §6.3). */
export const LEVEL_GATES = {
  SMG: 3,
  ASSAULT_RIFLE: 5,
  KATANA: 6,
  SHOTGUN: 8,
  SNIPER: 12,
};

/**
 * Check whether a player can buy/use a weapon given their level and keys.
 * @param {object} player { level, keys, ownedWeapons: Set }
 * @param {string} weaponKey
 * @returns {{allowed: boolean, reason?: string}}
 */
export function canAfford(player, weaponKey) {
  const w = W[weaponKey];
  if (!w) return { allowed: false, reason: 'unknown weapon' };
  const gate = LEVEL_GATES[weaponKey];
  if (gate && player.level < gate) {
    return { allowed: false, reason: `requires Level ${gate}` };
  }
  if (w.cost > 0 && player.keys < w.cost) {
    return { allowed: false, reason: `needs ${w.cost} keys (have ${player.keys})` };
  }
  if (player.ownedWeapons && player.ownedWeapons.has(weaponKey)) {
    return { allowed: false, reason: 'already owned' };
  }
  return { allowed: true };
}

/** Purchase a weapon; deduct keys. Returns {success, reason, newKeys}. */
export function purchase(player, weaponKey) {
  const check = canAfford(player, weaponKey);
  if (!check.allowed) return { success: false, reason: check.reason };
  const w = W[weaponKey];
  player.keys -= w.cost;
  if (!player.ownedWeapons) player.ownedWeapons = new Set();
  player.ownedWeapons.add(weaponKey);
  return { success: true, newKeys: player.keys };
}

/** Award keys for a free source. */
export function awardKeys(player, source, amount) {
  player.keys = (player.keys || 0) + amount;
  return player.keys;
}

/** Free key sources per spec §6.1. */
export const FREE_KEY_SOURCES = {
  BEGINNER_TASKS: { total: 18, once: true, note: '9 tasks, once per account' },
  DAILY_TASKS: { perDay: 6, note: '1 + 2 + 3 keys; up to 5 Prize Wheels/week' },
  BONUS_TASKS: { perTask: [1, 3], note: 'repeatable after dailies' },
  PRIZE_WHEEL: { values: [4, 10], chanceKeys: 0.55, maxSpinsPerWeek: 5 },
  WEAPON_CONTRACT_FIRST_TIER: { keys: 2, note: '1 for 5 elims + 1 for 5 min playtime' },
  CODE_FREE: { keys: 3, note: 'e.g. FREE199' },
};

/** Target free income: ~55-60 keys/week (spec §6.1). */
export function weeklyFreeIncomeEstimate() {
  // 6 daily * 7 = 42 + bonus tasks (~5) + prize wheel (~5) + codes (~3) ≈ 55
  return 55;
}

/**
 * Weapon Contract milestones (spec §6.3).
 * Returns the reward for a given milestone.
 */
export const CONTRACT_MILESTONES = {
  5: { type: 'key', amount: 1, label: '5 eliminations → 1 Key' },
  '5_min': { type: 'key', amount: 1, label: '5 minutes playtime → 1 Key' },
  20: { type: 'charm_capsule', label: '20 minutes → Charm Capsule' },
  60: { type: 'wrap', label: '1 hour → weapon-themed wrap' },
  1440: { type: 'wrap', label: '24 hours → another wrap' },
};

/** Key cost tiers (spec §6.2). */
export const KEY_TIER_COSTS = {
  Standard: [5, 75],
  Prime: [200, 550],
  Contraband: [600, 700],
};

/** Update contract progress for a weapon. */
export function updateContract(player, weaponKey, { eliminations = 0, playtimeMinutes = 0 } = {}) {
  if (!player.contracts) player.contracts = {};
  const c = player.contracts[weaponKey] || { eliminations: 0, playtimeMinutes: 0, claimed: [] };
  c.eliminations += eliminations;
  c.playtimeMinutes += playtimeMinutes;
  const rewards = [];
  // Check milestones
  const milestones = [
    { key: 5, type: 'elims', threshold: 5, reward: 1 },
    { key: '5_min', type: 'time', threshold: 5, reward: 1 },
    { key: 20, type: 'time', threshold: 20, reward: 'charm_capsule' },
    { key: 60, type: 'time', threshold: 60, reward: 'wrap' },
    { key: 1440, type: 'time', threshold: 1440, reward: 'wrap' },
  ];
  for (const m of milestones) {
    if (c.claimed.includes(m.key)) continue;
    const met = m.type === 'elims' ? c.eliminations >= m.threshold : c.playtimeMinutes >= m.threshold;
    if (met) {
      c.claimed.push(m.key);
      rewards.push({ milestone: m.key, reward: m.reward, label: m.label || CONTRACT_MILESTONES[m.key].label });
      if (m.reward === 1) player.keys = (player.keys || 0) + 1;
    }
  }
  player.contracts[weaponKey] = c;
  return rewards;
}
