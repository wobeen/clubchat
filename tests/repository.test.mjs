import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserRepository} from '../public/browser-repository.js';
import {createRepository,LEGACY_KEY} from '../public/repository.js';
import {migrateState,parseState} from '../public/schema.js';
import {seedState,createMeeting,sendMessage,extractDraft,confirmMeeting,updateDraftItem,createCorrection,disposeChild,delegate} from '../public/domain.js';

const memoryStorage = initial => {
  const values = new Map(initial == null ? [] : [[LEGACY_KEY,initial]]);
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
};
const open = (indexedDB,storage,options={}) => createBrowserRepository({indexedDB,storage,...options});

test('v2 migration preserves raw local data and upgrades the in-memory version',async()=>{
  const source=seedState(); source.organization='사용자가 만든 조직';
  const raw=JSON.stringify(source,null,2), storage=memoryStorage(raw), factory=new IDBFactory();
  const repo=await open(factory,storage);
  assert.equal(repo.status.kind,'ready');assert.equal(repo.get().version,3);
  assert.equal(repo.get().organization,source.organization);
  assert.equal(storage.getItem(LEGACY_KEY),raw);assert.equal(repo.export({source:'original'}),raw);
  repo.get().organization='새 이름';assert.equal((await repo.save()).ok,true);
  const reopened=await open(factory,storage);assert.equal(reopened.get().organization,'새 이름');
  assert.equal(reopened.export({source:'original'}),raw);
  repo.close();reopened.close();
});

test('atomic IDB compare-and-save rejects a stale writer and preserves its pending work',async()=>{
  const factory=new IDBFactory(),storage=memoryStorage();
  const [a,b]=await Promise.all([open(factory,storage),open(factory,storage)]);
  const bObject=b.get();a.get().organization='A 수정';b.get().organization='B 수정';
  const results=await Promise.all([a.save(),b.save()]);
  assert.equal(results.filter(x=>x.ok).length,1);assert.equal(results.filter(x=>x.code==='conflict').length,1);
  const loser=results[0].ok?b:a,winner=results[0].ok?a:b;
  assert.equal(loser.status.kind,'conflict');assert.equal((await loser.save()).code,'conflict');
  assert.notEqual(loser.get().organization,winner.get().organization);
  assert.equal((await loser.reload()).ok,true);assert.equal(loser.get().organization,winner.get().organization);
  assert.equal(b.get(),bObject);a.close();b.close();
});

test('serialized saves use independent invocation snapshots without overwriting newer state references',async()=>{
  const repo=await open(new IDBFactory(),memoryStorage()), reference=repo.get();
  repo.get().organization='첫 저장';const first=repo.save();
  repo.get().organization='두 번째 저장';const second=repo.save();
  assert.ok((await first).ok);assert.ok((await second).ok);
  assert.equal(repo.get(),reference);assert.equal(repo.get().organization,'두 번째 저장');
  assert.equal(JSON.parse(repo.export({source:'backup'})).organization,'첫 저장');
  await repo.reload();assert.equal(repo.get().organization,'두 번째 저장');repo.close();
});

test('damaged and future-version legacy records stay intact and cannot be overwritten by autosave',async()=>{
  for(const raw of ['{damaged original',JSON.stringify({...seedState(),version:99})]){
    const storage=memoryStorage(raw),repo=await open(new IDBFactory(),storage);
    assert.equal(repo.status.kind,'recovery');assert.equal(repo.export({source:'original'}),raw);
    repo.get().organization='새 시연';assert.equal((await repo.save()).ok,false);
    assert.equal(storage.getItem(LEGACY_KEY),raw);
    assert.equal((await repo.recover(JSON.stringify(seedState()))).ok,true);
    assert.equal(repo.status.kind,'ready');assert.equal(storage.getItem(LEGACY_KEY),raw);repo.close();
  }
});

test('last committed backup can be restored, while malformed imports leave current state unchanged',async()=>{
  const repo=await open(new IDBFactory(),memoryStorage());
  repo.get().organization='이전 정상본';await repo.save();repo.get().organization='현재 정상본';await repo.save();
  const previous=repo.get();const before=JSON.stringify(previous);
  assert.equal((await repo.recover('{oops')).ok,false);assert.equal(JSON.stringify(repo.get()),before);
  assert.equal((await repo.recover('backup')).ok,true);assert.equal(repo.get(),previous);
  assert.equal(repo.get().organization,'이전 정상본');await repo.reload();assert.equal(repo.get().organization,'이전 정상본');repo.close();
});

test('memory preview uses committed snapshots and isolated practice database never changes main data',async()=>{
  const mem=await createBrowserRepository({memory:true});
  mem.get().organization='저장된 연습';await mem.save();mem.get().organization='미저장 수정';await mem.reload();
  assert.equal(mem.get().organization,'저장된 연습');
  mem.get().organization='새 연습';await mem.save();await mem.recover('backup');assert.equal(mem.get().organization,'저장된 연습');
  const factory=new IDBFactory(),storage=memoryStorage();
  const main=await open(factory,storage),practice=await open(factory,storage,{dbName:'practice',legacyKey:null,seed:()=>({...seedState(),meetings:[],calendar:[]})});
  practice.get().organization='연습만';await practice.save();await main.reload();assert.notEqual(main.get().organization,'연습만');
  assert.equal(practice.get().meetings.length,0);main.close();practice.close();
});

test('schema rejects corrupt nested data, references, confirmations and relationship cycles',()=>{
  const corruptions=[
    s=>s.meetings[0].messages=[null],
    s=>s.meetings[0].memberIds.push('nobody'),
    s=>s.meetings[0].status='mystery',
    s=>s.meetings[0].parentId='absent',
    s=>s.meetings[0].parentId=s.meetings[0].id,
    s=>s.meetings[0].confirmations=['minsu','minsu'],
    s=>{s.meetings[0].confirmationMemberIds=['minsu'];s.meetings[0].confirmations=['jieun'];},
    s=>{s.meetings[0].status='review';s.meetings[0].draft=null;},
    s=>{extractDraft(s,s.meetings[0]);s.meetings[0].draft.decisions[0].evidenceIds=['absent'];},
    s=>{extractDraft(s,s.meetings[0]);s.meetings[0].draft.events[0].participantIds=['absent'];},
    s=>{const a=s.meetings[0],b=createMeeting(s,{title:'B',memberIds:[]});a.previousId=b.id;b.previousId=a.id;},
    s=>{s.meetings[0].conclusions=[{meetingId:'absent',title:'누락',memberIds:[],decisions:[],tasks:[],unresolved:[]}];},
  ];
  for(const corrupt of corruptions){const s=seedState();corrupt(s);assert.throws(()=>migrateState(s),{code:'invalid-data'});}
  assert.equal(migrateState({...seedState(),meetings:[]}).meetings.length,0);
  assert.throws(()=>parseState('{oops'),{code:'invalid-data'});
});

test('new domain history, confirmations, deferred child and correction survive persistence validation',async()=>{
  const repo=await open(new IDBFactory(),memoryStorage()),s=repo.get();
  const m=createMeeting(s,{title:'저장 검증',memberIds:[]});sendMessage(s,m,'결정: 시작');extractDraft(s,m);
  updateDraftItem(s,m,'decisions',{...m.draft.decisions[0],text:'시작 확정'});
  const child=delegate(s,m,{title:'하위',messageIds:[m.messages[0].id],memberIds:['minsu']});
  disposeChild(s,m,child.id,{status:'deferred',reason:'다음 논의'});confirmMeeting(s,m);
  assert.equal((await repo.save()).ok,true);
  const correction=createCorrection(s,m,'문구 보완');confirmMeeting(s,correction);
  const result=await repo.save();assert.equal(result.ok,true,result.message);
  await repo.reload();assert.equal(repo.get().meetings.find(x=>x.id===correction.id).status,'confirmed');repo.close();
});

test('sync compatibility adapter detects stale saves and never resets damaged originals',()=>{
  const storage=memoryStorage(),a=createRepository(storage),b=createRepository(storage);
  a.get().organization='A';assert.equal(a.save(),true);b.get().organization='B';assert.equal(b.save(),false);
  assert.equal(createRepository(storage).get().organization,'A');
  storage.setItem(LEGACY_KEY,'{broken');const broken=createRepository(storage);assert.equal(broken.reset(),false);assert.equal(storage.getItem(LEGACY_KEY),'{broken');
});

test('write failure preserves pending state, reports unsaved, and retries after storage recovers',async()=>{
  const factory=new IDBFactory();let failWrites=false;
  const injected={open(...args){const req=factory.open(...args);req.addEventListener('success',()=>{
    const db=req.result,transaction=db.transaction.bind(db);
    db.transaction=(names,mode,...rest)=>{if(failWrites&&mode==='readwrite')throw Error('QuotaExceededError');return transaction(names,mode,...rest);};
  });return req;}};
  const repo=await open(injected,memoryStorage());repo.get().organization='보존할 미저장 입력';failWrites=true;
  assert.equal((await repo.save()).code,'save-failed');assert.equal(repo.status.kind,'unsaved');
  assert.equal(JSON.parse(repo.export()).organization,'보존할 미저장 입력');
  failWrites=false;assert.equal((await repo.retry()).ok,true);await repo.reload();
  assert.equal(repo.get().organization,'보존할 미저장 입력');repo.close();
});

test('corrupt IDB current record can be recovered from valid backup without losing the corrupt original',async()=>{
  const factory=new IDBFactory(),storage=memoryStorage(),repo=await open(factory,storage);
  repo.get().organization='복원 목표';await repo.save();repo.get().organization='새 값';await repo.save();repo.close();
  const db=await new Promise((resolve,reject)=>{const req=factory.open('itda-capsules-v3',1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({revision:'damaged',state:{version:3,broken:true}},'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  const reopened=await open(factory,storage);assert.equal(reopened.status.kind,'recovery');
  const raw=reopened.export({source:'original'});assert.equal(JSON.parse(raw).broken,true);
  assert.equal((await reopened.recover('backup')).ok,true);assert.equal(reopened.get().organization,'복원 목표');
  assert.equal(reopened.export({source:'original'}),raw);reopened.close();
});
