import { seedState } from './domain.js';
import { parseState, migrateState } from './schema.js';
export const LEGACY_KEY = 'itda.capsules.v2';
// Compatibility adapter only: browser writes use atomic IndexedDB transactions.
export function createRepository(storage) {
  let state, raw, warning = '', blocked = false;
  try { raw = storage.getItem(LEGACY_KEY) ?? null; state = raw ? parseState(raw) : migrateState(seedState()); }
  catch (error) { state = migrateState(seedState()); warning = error.message; blocked = true; }
  return {
    get: () => state,
    get warning() { return warning; },
    save() {
      if (blocked) return false;
      try {
        if ((storage.getItem(LEGACY_KEY) ?? null) !== raw) { blocked = true; warning = '다른 창에서 변경됐어요. 다시 불러와 주세요.'; return false; }
        const next = JSON.stringify(migrateState(state)); storage.setItem(LEGACY_KEY, next); raw = next; return true;
      } catch (error) { warning = error.message; return false; }
    },
    reset() { if (blocked) return false; state = migrateState(seedState()); return this.save(); },
    export() { return raw ?? JSON.stringify(state); }
  };
}
