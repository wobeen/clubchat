import { seedState } from './domain.js';
import { DataError, migrateState, parseState } from './schema.js';
import { LEGACY_KEY } from './repository.js';

const ok = () => ({ok:true, code:'saved', message:''});
function openDatabase(factory, name) {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('snapshots')) request.result.createObjectStore('snapshots'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 창이 저장소 업그레이드를 막고 있어요. 다른 ITDA 창을 닫고 다시 열어주세요.'));
  });
}
function transaction(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', mode), store = tx.objectStore('snapshots');
    let result, failure;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(failure || tx.error);
    tx.onabort = () => reject(failure || tx.error || new Error('저장이 중단됐어요.'));
    try { operation(store, value => { result = value; }, error => { failure = error; tx.abort(); }); }
    catch (error) { failure = error; tx.abort(); }
  });
}
const read = (db, key) => transaction(db, 'readonly', (store, done) => { const req = store.get(key); req.onsuccess = () => done(req.result); });

/** All mutating methods return {ok,code,message}. get() keeps its object identity.
 * save captures the state at invocation; operations are serialized per repository.
 * Cross-tab revision checks and backup/current writes share one IDB transaction.
 */
export async function createBrowserRepository(options = {}) {
  const {memory = false, dbName = 'itda-capsules-v3', legacyKey = LEGACY_KEY, seed = seedState} = options;
  const factory = options.indexedDB ?? globalThis.indexedDB;
  let db, state = migrateState(seed()), revision = 0, original = null, backup = null, queue = Promise.resolve();
  let observedRevision = 0;
  let committed = structuredClone(state);
  let status = {kind:'ready', message:'', revision:0};
  const setStatus = (kind, message = '') => { status = {kind, message, revision}; options.onStatus?.({...status}); };
  const fail = (code, message) => { setStatus(code === 'conflict' ? 'conflict' : code === 'invalid-data' || code === 'future-version' ? 'recovery' : 'unsaved', message); return {ok:false, code, message}; };
  const replace = next => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, next); };
  const serialize = job => { const pending = queue.then(job, job); queue = pending.catch(() => {}); return pending; };
  function legacyRaw() {
    if (!legacyKey) return null;
    const storage = options.storage ?? globalThis.localStorage;
    return storage?.getItem(legacyKey) ?? null;
  }
  async function load() {
    if (memory) { replace(structuredClone(committed)); setStatus('ready'); return ok(); }
    try {
      if (!db) {
        if (!factory) throw new Error('이 브라우저에서 안전한 저장소를 사용할 수 없어요. 현재 내용을 내보낼 수 있어요.');
        db = await openDatabase(factory, dbName);
        db.onversionchange = () => { db.close(); db = null; setStatus('unavailable', '저장소 버전이 변경됐어요. 페이지를 다시 열어주세요.'); };
      }
      let record = await read(db, 'current');
      backup = await read(db, 'backup') ?? null;
      if (!record) {
        original = legacyRaw();
        const candidate = original == null ? migrateState(seed()) : parseState(original);
        // Concurrent first launches must not overwrite the first initializer.
        record = await transaction(db, 'readwrite', (store, done) => {
          const req = store.get('current'); req.onsuccess = () => {
            if (req.result) { done(req.result); return; }
            const first = {revision:1, state:candidate};
            store.put(first, 'current'); if (original != null) store.put(original, 'legacy-original'); done(first);
          };
        });
      }
      revision = Number.isInteger(record.revision) ? record.revision : 0;
      observedRevision = record.revision ?? 0;
      original = JSON.stringify(record.state);
      if (!Number.isInteger(record.revision) || record.revision < 1) throw new DataError('저장소 버전 정보가 손상됐어요. 원본을 내보낸 뒤 복구해주세요.');
      const next = parseState(record.state);
      original = await read(db, 'legacy-original') ?? await read(db, 'quarantine') ?? original;
      committed = structuredClone(next); replace(next); setStatus('ready'); return ok();
    } catch (error) {
      if (error.code === 'invalid-data' || error.code === 'future-version') {
        // Keep both the original key and an additional recovery copy untouched.
        if (db && original != null) try { await transaction(db, 'readwrite', (store, done) => { store.put(original, 'quarantine'); done(true); }); } catch {}
        setStatus('recovery', error.message);
        return {ok:false, code:error.code, message:error.message};
      }
      setStatus('unavailable', error.message || '저장소를 열지 못했어요.');
      return {ok:false, code:'unavailable', message:status.message};
    }
  }
  async function commit(candidate, {replaceState = false, recovery = false} = {}) {
    if (status.kind === 'conflict') return {ok:false, code:'conflict', message:status.message};
    if (status.kind === 'recovery' && !recovery) return {ok:false, code:'recovery', message:status.message};
    let normalized;
    try { normalized = migrateState(candidate); } catch (error) { return fail(error.code || 'invalid-data', error.message); }
    if (memory) { backup = {revision, state:structuredClone(committed)}; committed = structuredClone(normalized); revision++; if (replaceState) replace(normalized); setStatus('ready'); return ok(); }
    if (!db) return fail('unavailable', '저장소를 열지 못했어요. 내보낸 뒤 다시 불러와 주세요.');
    try {
      const result = await transaction(db, 'readwrite', (store, done, abort) => {
        const req = store.get('current'); req.onsuccess = () => {
          const current = req.result;
          if ((current?.revision ?? 0) !== observedRevision) { done({conflict:true}); return; }
          if (current) {
            try { migrateState(current.state); store.put(current, 'backup'); }
            catch { if (!recovery) { abort(new Error('저장된 데이터가 손상됐어요. 다시 불러와 주세요.')); return; } store.put(JSON.stringify(current.state), 'quarantine'); }
          }
          const next = {revision:revision+1, state:normalized}; store.put(next, 'current'); done({record:next, previous:current});
        };
      });
      if (result.conflict) return fail('conflict', '다른 창에서 변경됐어요. 내 작업을 내보낸 뒤 최신 내용을 다시 불러와 주세요.');
      backup = result.previous || backup; revision = result.record.revision; observedRevision = revision;
      committed = structuredClone(normalized);
      if (replaceState) replace(normalized); setStatus('ready'); return ok();
    } catch (error) { return fail('save-failed', '저장하지 못했어요. 다시 시도하거나 현재 내용을 내보내 주세요. ' + (error.message || '')); }
  }
  await load();
  return {
    get: () => state,
    get status() { return {...status}; },
    get warning() { return status.message; },
    save() { const candidate = structuredClone(state); return serialize(() => commit(candidate)); },
    retry() { const candidate = structuredClone(state); return serialize(() => commit(candidate)); },
    reset() { return serialize(() => commit(seed(), {replaceState:true, recovery:true})); },
    reload() { return serialize(load); },
    recover(value = 'backup') {
      return serialize(async () => {
        try {
          const candidate = value === 'backup' ? backup?.state : value === 'original' ? original : value;
          if (candidate == null) return {ok:false, code:'no-backup', message:'복원할 백업이 없어요.'};
          return await commit(parseState(candidate), {replaceState:true, recovery:true});
        } catch (error) { return {ok:false, code:error.code || 'invalid-data', message:error.message}; }
      });
    },
    export({source = 'current'} = {}) { return source === 'original' ? original ?? '' : source === 'backup' ? backup ? JSON.stringify(backup.state,null,2) : '' : JSON.stringify(state,null,2); },
    close() { db?.close(); db = null; }
  };
}
