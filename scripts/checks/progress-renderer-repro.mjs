// Standalone native-storage boundary probe; does not load the application or contact its services.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
const executable = process.env.W10_CHROMIUM;
if (!executable) throw new Error('Set W10_CHROMIUM to a local Chromium executable');
const rounds = Number(process.env.W10_ROUNDS ?? 50);
assert(
  Number.isSafeInteger(rounds) && rounds > 0 && rounds <= 1000,
  'W10_ROUNDS must be an integer from 1 to 1000 per order'
);
const output = process.env.W10_RECEIPT ?? 'progress-renderer-receipt.json';
const profile = await mkdtemp(join(tmpdir(), 'w10-renderer-'));
const repositorySource = await readFile(
  new URL('../../app/stores/tarkov/progressRepository.ts', import.meta.url),
  'utf8'
);
const repositoryModule = ts.transpileModule(repositorySource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const server = createServer((request, response) => {
  if (request.url === '/repository.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(repositoryModule);
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  response.end('<!doctype html><title>W10 native boundary probe</title>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const child = spawn(
  executable,
  [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--site-per-process',
    '--process-per-tab',
  ],
  { windowsHide: true, stdio: 'ignore' }
);
let socket;
const receipt = {
  scope: 'Native browser boundary only; not application acceptance',
  sourceSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
  repositorySha256: createHash('sha256').update(repositorySource).digest('hex'),
  rounds,
  results: [],
  storageBarrier: [],
  indexedDB: [],
  repository: [],
  frames: [],
};
try {
  const deadline = Date.now() + 15000;
  let port;
  while (!port && Date.now() < deadline) {
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert.ok(port, 'Chromium started');
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  receipt.browser = version.Browser;
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  const pending = new Map();
  const trace = [];
  let finishTrace;
  const traceFinished = new Promise((resolve) => {
    finishTrace = resolve;
  });
  const settleMessage = (message) => {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timeout);
    message.error
      ? waiter.reject(new Error(JSON.stringify(message.error)))
      : waiter.resolve(message.result);
  };
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Tracing.dataCollected') trace.push(...message.params.value);
    if (message.method === 'Tracing.tracingComplete') finishTrace();
    settleMessage(message);
  };
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, 15000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const evaluate = async (session, expression) => {
    const result = await call(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      session
    );
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Tracing.start', {
    categories:
      'blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame',
    transferMode: 'ReportEvents',
  });
  const sessions = [];
  for (const actor of ['a', 'b']) {
    const { targetId } = await call('Target.createTarget', {
      url: `${origin}/${actor}`,
      newWindow: true,
    });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    await call('Runtime.enable', {}, sessionId);
    await evaluate(
      sessionId,
      `new Promise(resolve => document.readyState === 'complete' ? resolve() : addEventListener('load', resolve, {once:true}))`
    );
    sessions.push(sessionId);
    await evaluate(
      sessionId,
      `window.actor=${JSON.stringify(actor)}; performance.mark('w10-actor-'+actor); window.seen=new Map(); addEventListener('storage',e=>seen.set(e.key,e.newValue)); true`
    );
    await evaluate(
      sessionId,
      `new Promise((resolve,reject)=>{const open=indexedDB.open('w10-native-probe',1);open.onupgradeneeded=()=>open.result.createObjectStore('records');open.onerror=()=>reject(open.error);open.onsuccess=()=>{window.db=open.result;resolve(true)}})`
    );
  }
  const initial = JSON.stringify({ pvp: 20, pve: 42, seasonal: 33, clock: 100 });
  const updated = JSON.stringify({ pvp: 20, pve: 55, seasonal: 33, clock: 500 });
  for (const order of [
    [0, 1],
    [1, 0],
  ]) {
    const [writer, resetter] = order.map((index) => sessions[index]);
    for (let round = 0; round < rounds; round++) {
      const key = `w10-${order.join('')}-${round}`;
      const lock = `${key}:mutation`;
      // Baseline equality is proved explicitly before contention, never by a delay.
      await evaluate(
        writer,
        `localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(initial)}); true`
      );
      await evaluate(
        resetter,
        `new Promise(resolve=>{const key=${JSON.stringify(key)}, expected=${JSON.stringify(initial)}; if(localStorage.getItem(key)===expected)return resolve(true); const handler=e=>{if(e.key===key&&e.newValue===expected){removeEventListener('storage',handler);resolve(true)}};addEventListener('storage',handler)})`
      );
      await evaluate(
        writer,
        `window.held=new Promise(resolve=>{window.holder=navigator.locks.request(${JSON.stringify(lock)},()=>{resolve(true);return new Promise(release=>window.release=()=>{localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(updated)});release()})})}); held`
      );
      await evaluate(
        resetter,
        `window.reset=navigator.locks.request(${JSON.stringify(lock)},()=>{const raw=localStorage.getItem(${JSON.stringify(key)});const state=JSON.parse(raw);state.pvp=1;localStorage.setItem(${JSON.stringify(key)},JSON.stringify(state));return {raw,state}}); true`
      );
      const contention = await evaluate(writer, 'navigator.locks.query()');
      assert.equal(contention.held.filter((item) => item.name === lock).length, 1);
      assert.equal(contention.pending.filter((item) => item.name === lock).length, 1);
      await evaluate(writer, 'release(); true');
      const result = await evaluate(resetter, 'reset');
      const recorded = { order, round, contention, ...result, lostUpdate: result.state.pve !== 55 };
      if (
        recorded.lostUpdate &&
        !receipt.results.some((item) => item.lostUpdate && item.order.join('') === order.join(''))
      ) {
        const { targetId } = await call('Target.createTarget', {
          url: `${origin}/reload-${order.join('')}`,
          newWindow: true,
        });
        const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
        await call('Runtime.enable', {}, sessionId);
        await evaluate(
          sessionId,
          `new Promise(resolve => document.readyState === 'complete' ? resolve() : addEventListener('load', resolve, {once:true}))`
        );
        recorded.freshRendererRead = await evaluate(
          sessionId,
          `localStorage.getItem(${JSON.stringify(key)})`
        );
        await call('Target.closeTarget', { targetId });
      }
      receipt.results.push(recorded);
    }
  }
  for (const order of [
    [0, 1],
    [1, 0],
  ]) {
    const [writer, resetter] = order.map((index) => sessions[index]);
    const key = `barrier-${order.join('')}`;
    const lock = `${key}:mutation`;
    await evaluate(
      writer,
      `localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(initial)});true`
    );
    await evaluate(
      resetter,
      `window.eventBarrier=new Promise(resolve=>{const handler=e=>{if(e.key===${JSON.stringify(key)}&&e.newValue===${JSON.stringify(updated)}){removeEventListener('storage',handler);resolve({eventValue:e.newValue,nativeRead:localStorage.getItem(e.key)})}};addEventListener('storage',handler)});true`
    );
    await evaluate(
      writer,
      `window.held=new Promise(resolve=>{window.holder=navigator.locks.request(${JSON.stringify(lock)},()=>{resolve(true);return new Promise(release=>window.release=release)})});held`
    );
    await evaluate(
      resetter,
      `window.reset=navigator.locks.request(${JSON.stringify(lock)},()=>{const state=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));state.pvp=1;localStorage.setItem(${JSON.stringify(key)},JSON.stringify(state));return state});true`
    );
    await evaluate(
      writer,
      `localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(updated)});true`
    );
    const barrier = await evaluate(resetter, 'eventBarrier');
    const contention = await evaluate(writer, 'navigator.locks.query()');
    assert.equal(contention.held.filter((item) => item.name === lock).length, 1);
    assert.equal(contention.pending.filter((item) => item.name === lock).length, 1);
    assert.equal(barrier.nativeRead, updated);
    await evaluate(writer, 'release();true');
    const state = await evaluate(resetter, 'reset');
    assert.equal(state.pve, 55);
    receipt.storageBarrier.push({ order, barrier, contention, state });
  }
  // Control: preceding IDB transactions become visible without storage events or delays.
  for (const order of [
    [0, 1],
    [1, 0],
  ]) {
    const [writer, reader] = order.map((index) => sessions[index]);
    for (const firstSave of [false, true]) {
      const key = `idb-${order.join('')}-${firstSave}`;
      if (!firstSave)
        await evaluate(
          writer,
          `new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(${initial},${JSON.stringify(key)});tx.oncomplete=()=>resolve(true);tx.onabort=()=>reject(tx.error)})`
        );
      const lock = `${key}:mutation`;
      await evaluate(
        writer,
        `window.held=new Promise(resolve=>{window.holder=navigator.locks.request(${JSON.stringify(lock)},()=>{resolve(true);return new Promise(release=>window.release=()=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(${updated},${JSON.stringify(key)});window.commit=new Promise((done,reject)=>{tx.oncomplete=()=>done(true);tx.onabort=()=>reject(tx.error)});release()})})});held`
      );
      await evaluate(
        reader,
        `window.control=navigator.locks.request(${JSON.stringify(lock)},()=>new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');const store=tx.objectStore('records');const read=store.get(${JSON.stringify(key)});let before,after,saved=false;read.onsuccess=()=>{before=read.result;after={...before,pvp:1};store.put(after,${JSON.stringify(key)})};tx.oncomplete=()=>{saved=true;resolve({before,after,saved})};tx.onabort=()=>reject(tx.error)}));true`
      );
      const contention = await evaluate(writer, 'navigator.locks.query()');
      assert.equal(contention.pending.filter((item) => item.name === lock).length, 1);
      await evaluate(writer, 'release();true');
      const result = await evaluate(reader, 'control');
      assert.equal(result.before.pve, 55);
      assert.equal(result.after.pve, 55);
      assert.equal(result.saved, true);
      receipt.indexedDB.push({ order, firstSave, ...result });
      const aborted = await evaluate(
        reader,
        `new Promise(resolve=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put({pve:999},${JSON.stringify(key)});tx.oncomplete=()=>resolve({saved:true});tx.onabort=()=>resolve({saved:false});tx.abort()})`
      );
      const retained = await evaluate(
        writer,
        `new Promise(resolve=>{const read=db.transaction('records').objectStore('records').get(${JSON.stringify(key)});read.onsuccess=()=>resolve(read.result)})`
      );
      assert.equal(aborted.saved, false);
      assert.equal(retained.pve, 55);
      receipt.indexedDB.push({ order, firstSave, abort: aborted, retained });
    }
  }
  const fixtureMode = {
    level: 1,
    pmcFaction: 'USEC',
    displayName: null,
    xpOffset: 0,
    taskObjectives: {},
    taskCompletions: {},
    taskAvailability: {},
    hideoutParts: {},
    hideoutModules: {},
    traders: {},
    skills: {},
    prestigeLevel: 0,
    progressEpoch: 0,
    skillOffsets: {},
    storyChapters: {},
    apiUpdateHistory: [],
    manualActivityHistory: [],
    manualActivityEpoch: 0,
  };
  const fixture = {
    currentGameMode: 'pvp',
    gameEdition: 1,
    tarkovUid: null,
    pvp: fixtureMode,
    pve: fixtureMode,
    seasonal: fixtureMode,
    seasonalSeasonNumber: 1,
  };
  for (const order of [
    [0, 1],
    [1, 0],
  ]) {
    const [writer, reader] = order.map((index) => sessions[index]);
    const name = `w10-repository-${order.join('')}`;
    for (const session of [writer, reader]) {
      await evaluate(
        session,
        `(async()=>{window.repo=await import('/repository.js').then(m=>m.openProgressRepository(indexedDB,${JSON.stringify(name)}));window.token=await repo.activateOwner(null);return true})()`
      );
    }
    await evaluate(
      writer,
      `(async()=>{window.draft=${JSON.stringify(fixture)};draft.pve.level=55;await repo.commit({token,expectedRevision:0,kind:'edit',state:draft});return true})()`
    );
    const rejected = await evaluate(
      reader,
      `repo.commit({token,expectedRevision:0,kind:'edit',state:${JSON.stringify(fixture)}}).then(()=>({saved:true}),e=>({saved:false,reason:e.reason}))`
    );
    assert.deepEqual(rejected, { saved: false, reason: 'revision' });
    const reset = await evaluate(
      reader,
      `(async()=>{window.current=await repo.read(token);window.next=structuredClone(current.state);next.pvp.progressEpoch=1;return await repo.commit({token,expectedRevision:current.revision,kind:'reset',resetModes:['pvp'],state:next})})()`
    );
    assert.equal(reset.state.pve.level, 55);
    assert.equal(reset.epochs.pvp, 1);
    const abort = await evaluate(
      writer,
      `(async()=>{window.originalPut=IDBObjectStore.prototype.put;window.putSucceeded=false;IDBObjectStore.prototype.put=function(...args){const request=originalPut.apply(this,args);request.addEventListener('success',()=>{putSucceeded=true;this.transaction.abort()});return request};window.saved=false;window.baseline=2;window.latest=await repo.read(token);window.failure=await repo.commit({token,expectedRevision:latest.revision,kind:'edit',state:latest.state}).then(result=>{saved=true;baseline=result.revision;return null},error=>error.name);IDBObjectStore.prototype.put=originalPut;return {failure,putSucceeded,saved,baseline}})()`
    );
    assert.deepEqual(abort, {
      failure: 'AbortError',
      putSucceeded: true,
      saved: false,
      baseline: 2,
    });
    const afterAbort = await evaluate(reader, 'repo.read(token)');
    assert.equal(afterAbort.revision, 2);
    assert.equal(afterAbort.state.pve.level, 55);
    const removal = await evaluate(
      reader,
      `(async()=>{await repo.remove(token,2);repo.close();window.repo=await import('/repository.js').then(m=>m.openProgressRepository(indexedDB,${JSON.stringify(name)}));return await repo.read(token)})()`
    );
    assert.equal(removal.deleted, true);
    assert.equal(removal.state, null);
    const reimport = await evaluate(
      reader,
      `repo.commit({token,expectedRevision:3,kind:'import',legacyRaw:'retained legacy bytes',state:${JSON.stringify(fixture)}}).then(()=>({saved:true}),e=>({saved:false,reason:e.reason}))`
    );
    assert.deepEqual(reimport, { saved: false, reason: 'deleted' });
    receipt.repository.push({ order, rejected, reset, abort, afterAbort, removal, reimport });
  }
  await call('Tracing.end');
  await traceFinished;
  // A CDP round trip allows trace delivery; no storage visibility depends on it.
  await call('SystemInfo.getProcessInfo').then((result) => {
    receipt.processes = result.processInfo;
  });
  receipt.frames = trace.filter(
    (event) => event.name === 'TracingStartedInBrowser' || event.name === 'FrameCommittedInBrowser'
  );
  receipt.actorMarks = trace.filter(
    (event) => event.name === 'w10-actor-a' || event.name === 'w10-actor-b'
  );
  assert.equal(
    new Set(receipt.actorMarks.map((event) => event.pid)).size,
    2,
    'Actors used separate renderer processes'
  );
  await writeFile(`${output}.trace.json`, JSON.stringify(trace));
  receipt.lostUpdates = receipt.results.filter((result) => result.lostUpdate).length;
  await writeFile(output, JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      browser: receipt.browser,
      rounds: receipt.results.length,
      lostUpdates: receipt.lostUpdates,
      output,
      frames: receipt.frames,
    })
  );
} finally {
  socket?.close();
  child.kill();
  server.close();
  // Do not recursively remove a profile while Chromium still owns it; retain it for inspection.
  console.log(`Temporary isolated browser profile: ${profile}`);
}
