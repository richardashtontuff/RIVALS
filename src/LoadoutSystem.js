/**
 * RIVALS — LoadoutSystem (spec §4.1).
 *
 * Enforces the Four-Slot Loadout rule: every player must equip exactly one
 * weapon from each category — Primary, Secondary, Melee, Utility.
 * `validateLoadout(loadout)` returns { valid, reason }.
 */
import { CONFIG } from './config.js';

const CATEGORIES = ['primary', 'secondary', 'melee', 'utility'];

/** The free starter kit (spec §4.1). */
export const STARTER_LOADOUT = {
  primary: 'ASSAULT_RIFLE',
  secondary: 'HANDGUN',
  melee: 'FISTS',
  utility: 'GRENADE',
};

/**
 * Validate a loadout object against the four-slot rule.
 * @param {object} loadout { primary, secondary, melee, utility } weapon keys
 * @returns {{valid: boolean, reason?: string}}
 */
export function validateLoadout(loadout) {
  if (!loadout || typeof loadout !== 'object') {
    return { valid: false, reason: 'loadout is required' };
  }

  const slots = {};
  for (const cat of CATEGORIES) {
    const key = loadout[cat];
    if (!key) {
      return { valid: false, reason: `missing ${cat} weapon` };
    }
    const weapon = CONFIG.WEAPONS[key];
    if (!weapon) {
      return { valid: false, reason: `unknown ${cat} weapon: ${key}` };
    }
    if (weapon.category !== cat) {
      return {
        valid: false,
        reason: `${key} is a ${weapon.category}, not a ${cat}`,
      };
    }
    // No duplicate weapon across slots.
    if (slots[key]) {
      return { valid: false, reason: `duplicate weapon: ${key}` };
    }
    slots[key] = cat;
  }

  return { valid: true };
}

/** Return the weapon config for a loadout slot, or null. */
export function weaponForSlot(loadout, slot) {
  if (!CATEGORIES.includes(slot)) return null;
  const key = loadout[slot];
  if (!key) return null;
  return CONFIG.WEAPONS[key] || null;
}

/** Default competitive loadout = starter kit. */
export const DEFAULT_LOADOUT = { ...STARTER_LOADOUT };

// Sanity-check the starter kit at import time.
const check = validateLoadout(STARTER_LOADOUT);
if (!check.valid) {
  throw new Error(`Starter loadout invalid: ${check.reason}`);
}
