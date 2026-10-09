// Real Nuxt application acceptance. Run against an offline local development server.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = new URL(process.env.PROGRESS_APP_URL ?? 'http://localhost:3102');
assert(
  ['localhost', '127.0.0.1'].includes(base.hostname),
  'Acceptance requires an isolated local app'
);
const executable = process.env.W10_CHROMIUM;
assert(executable, 'Set W10_CHROMIUM');
const profile = await mkdtemp(join(tmpdir(), 'progress-app-'));
const screenshotPath = join(profile, 'recovery-ui.png');
const receiptPath = join(profile, 'acceptance-receipt.json');
const privateWriteOptions = { flag: 'wx', mode: 0o600 };
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
  { stdio: 'ignore' }
);
let socket;
const receipt = {
  scope: 'Real application, native IndexedDB and locks, separate renderer processes',
  results: [],
  profile,
};
try {
  let port;
  const deadline = Date.now() + 15000;
  while (!port && Date.now() < deadline) {
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert(port, 'Chromium started');
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  receipt.browser = version.Browser;
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const trace = [];
  let finishTrace;
  const traceComplete = new Promise((resolve) => {
    finishTrace = resolve;
  });
  const collectTrace = (message) => {
    if (message.method === 'Tracing.dataCollected') trace.push(...message.params.value);
    if (message.method === 'Tracing.tracingComplete') finishTrace();
  };
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    collectTrace(message);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timeout);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  };
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const callId = ++id;
      const timeout = setTimeout(() => {
        pending.delete(callId);
        reject(new Error(`${method} timed out`));
      }, 30000);
      pending.set(callId, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id: callId, method, params, sessionId }));
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
    categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing',
    transferMode: 'ReportEvents',
  });
  const bootOnce = async (session) =>
    evaluate(
      session,
      `(async()=>{
    const nuxt=await new Promise((resolve,reject)=>{
      const deadline=Date.now()+20000;const poll=()=>{
        const el=[...document.querySelectorAll('*')].find(el=>el.__vueParentComponent);
        const app=el?.__vueParentComponent.appContext.app.config.globalProperties.$nuxt;
        if(app)return resolve(app);
        if(Date.now()>deadline)return reject(new Error('App hydration timed out'));
        setTimeout(poll,20);
      };poll();
    });
    const [stores,storage,authority,status]=await Promise.all([
      import('/_nuxt/stores/useTarkov.ts'),import('/_nuxt/stores/tarkov/localStorage.ts'),
      import('/_nuxt/stores/tarkov/progressAuthority.ts'),import('/_nuxt/stores/tarkov/progressSaveStatus.ts')]);
    await new Promise((resolve,reject)=>{const deadline=Date.now()+20000;const check=()=>{if(authority.isProgressAuthorityReady())return resolve();if(Date.now()>deadline)return reject(new Error('Progress authority hydration timed out'));setTimeout(check,20);};check();});
    if(nuxt.$supabase.user.loggedIn)throw new Error('Acceptance must use an offline guest');
    window.tt={nuxt,store:stores.useTarkovStore(nuxt.$pinia),storage,authority,status};
    performance.mark('progress-app-renderer');
    return {ready:authority.isProgressAuthorityReady(),levels:[tt.store.pvp.level,tt.store.pve.level,tt.store.seasonal.level]};
  })()`
    );
  const boot = async (session) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        return await bootOnce(session);
      } catch (error) {
        if (
          !/Execution context was destroyed|Inspected target navigated or closed/.test(
            error.message
          )
        )
          throw error;
      }
    }
    throw new Error('Navigation never stabilized');
  };
  const actors = [];
  for (const name of ['a', 'b']) {
    const { targetId } = await call('Target.createTarget', {
      url: new URL('/settings#backup-restore', base).href,
      newWindow: true,
    });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    await call('Runtime.enable', {}, sessionId);
    await call('Page.enable', {}, sessionId);
    assert.equal((await boot(sessionId)).ready, true);
    actors.push({ sessionId, targetId, name });
  }
  const reload = async (actor) => {
    await call(
      'Page.navigate',
      {
        url: new URL(`/settings?actor=${actor.name}&reload=${Date.now()}#backup-restore`, base)
          .href,
      },
      actor.sessionId
    );
    assert.equal((await boot(actor.sessionId)).ready, true);
  };
  const committed = async (actor) =>
    evaluate(
      actor.sessionId,
      `(async()=>{const record=await tt.authority.readCommittedProgressAuthority();return {record,state:record.raw&&JSON.parse(record.raw).data,local:tt.status.progressSaveStatus.local};})()`
    );
  const hold = async (actor, patch) => {
    await evaluate(
      actor.sessionId,
      `(()=>{
      const request=navigator.locks.request.bind(navigator.locks);
      const gate=new Promise(resolve=>tt.release=resolve);
      tt.entered=new Promise(resolve=>tt.enter=resolve);let hold=true;
      navigator.locks.request=(name,options,callback)=>request(name,options,async lock=>{
        if(hold&&name==='v2_progress:mutation'){hold=false;tt.enter();await gate;}
        return callback(lock);
      });
      tt.store.$patch(state=>{${patch}});
      return true;
    })()`
    );
    await evaluate(actor.sessionId, 'tt.entered');
  };
  const contender = async (actor, kind) =>
    evaluate(
      actor.sessionId,
      `(()=>{
    tt.done=false;
    const request=navigator.locks.request.bind(navigator.locks);
    tt.queued=new Promise(resolve=>tt.queue=resolve);
    navigator.locks.request=(name,...args)=>{const result=request(name,...args);if(name==='v2_progress:mutation')tt.queue();return result;};
    tt.operation=${kind === 'all-reset' ? 'tt.nuxt.runWithContext(()=>tt.store.resetAllData())' : kind === 'reset' ? 'tt.nuxt.runWithContext(()=>tt.store.resetPvPData())' : '(async()=>{tt.store.$patch(state=>{state.pvp.level=7;});await tt.storage.flushActiveProgressWrites();})()'};
    tt.operation.then(()=>tt.done=true);return true;
  })()`
    );
  const contend = async (writer, reader, kind, patch) => {
    await hold(writer, patch);
    await contender(reader, kind);
    await evaluate(reader.sessionId, 'tt.queued');
    const locks = await evaluate(writer.sessionId, 'navigator.locks.query()');
    assert.equal(locks.held.filter((lock) => lock.name === 'v2_progress:mutation').length, 1);
    assert.equal(locks.pending.filter((lock) => lock.name === 'v2_progress:mutation').length, 1);
    assert.equal(await evaluate(reader.sessionId, 'tt.done'), false);
    await evaluate(writer.sessionId, 'tt.release();true');
    await evaluate(reader.sessionId, 'tt.operation');
    await evaluate(writer.sessionId, 'tt.storage.flushActiveProgressWrites()');
    return committed(reader);
  };
  // First save: both renderers start with no active raw envelope.
  const first = await contend(actors[0], actors[1], 'edit', 'state.pve.level=55;');
  assert.equal(first.state.pve.level, 55);
  assert.equal(first.state.pvp.level, 7);
  receipt.results.push({ kind: 'first-save', state: first.state });
  for (const order of [
    [0, 1],
    [1, 0],
  ]) {
    const [writer, reader] = order.map((index) => actors[index]);
    for (const kind of ['reset', 'edit', 'all-reset']) {
      await reload(writer);
      await evaluate(
        writer.sessionId,
        `(async()=>{tt.store.$patch(state=>{state.pvp.level=20;state.pve.level=42;state.seasonal.level=33;});await tt.storage.flushActiveProgressWrites();})()`
      );
      await reload(reader);
      const before = await committed(reader);
      assert.equal(before.state.pve.level, 42);
      const after = await contend(writer, reader, kind, 'state.pve.level=55;');
      assert.equal(after.state.pve.level, kind === 'all-reset' ? 1 : 55);
      assert.equal(after.state.pvp.level, kind === 'edit' ? 7 : 1);
      assert.equal(after.state.seasonal.level, kind === 'all-reset' ? 1 : 33);
      assert.equal(after.local, 'saved');
      await reload(writer);
      assert.equal((await committed(writer)).state.pve.level, kind === 'all-reset' ? 1 : 55);
      receipt.results.push({
        order,
        kind,
        revision: after.record.revision,
        levels: [after.state.pvp.level, after.state.pve.level, after.state.seasonal.level],
      });
    }
  }
  // Quota failure is injected into native IDB; application status and durable bytes are checked.
  const writer = actors[0];
  const before = await committed(writer);
  await evaluate(
    writer.sessionId,
    `(()=>{
    tt.originalPut=IDBObjectStore.prototype.put;let fail=true;
    IDBObjectStore.prototype.put=function(value,key){if(fail&&key==='active-envelope'){fail=false;throw new DOMException('fixture quota','QuotaExceededError');}return tt.originalPut.call(this,value,key);};
    tt.store.$patch(state=>{state.pve.level=60;});return true;
  })()`
  );
  await evaluate(writer.sessionId, 'tt.storage.flushActiveProgressWrites()');
  const failed = await committed(writer);
  assert.equal(failed.local, 'failed');
  assert.equal(failed.record.raw, before.record.raw);
  await evaluate(
    writer.sessionId,
    `(async()=>{IDBObjectStore.prototype.put=tt.originalPut;tt.store.$patch(state=>{state.pve.displayName='retry';});await tt.storage.flushActiveProgressWrites();})()`
  );
  const retry = await committed(writer);
  assert.equal(retry.local, 'saved');
  assert.equal(retry.state.pve.level, 60);
  receipt.failure = { status: failed.local, unchanged: true, retryLevel: retry.state.pve.level };
  const beforeAbort = await committed(writer);
  await evaluate(
    writer.sessionId,
    `(()=>{
    tt.originalPut=IDBObjectStore.prototype.put;let abort=true;
    IDBObjectStore.prototype.put=function(value,key){const request=tt.originalPut.call(this,value,key);
      if(abort&&key==='active-envelope'){abort=false;request.addEventListener('success',()=>this.transaction.abort());}return request;};
    tt.store.$patch(state=>{state.pve.level=61;});return true;
  })()`
  );
  await evaluate(writer.sessionId, 'tt.storage.flushActiveProgressWrites()');
  await evaluate(writer.sessionId, 'IDBObjectStore.prototype.put=tt.originalPut;true');
  const aborted = await committed(writer);
  assert.equal(aborted.local, 'failed');
  assert.equal(aborted.record.raw, beforeAbort.record.raw);
  await evaluate(
    writer.sessionId,
    `(async()=>{tt.store.$patch(state=>{state.pve.displayName='after-abort';});await tt.storage.flushActiveProgressWrites();})()`
  );
  const afterAbort = await committed(writer);
  assert.equal(afterAbort.local, 'saved');
  assert.equal(afterAbort.state.pve.level, 61);
  receipt.abort = { status: aborted.local, unchanged: true, retryLevel: 61 };
  Object.assign(retry, afterAbort);
  // An old client's localStorage write is recovery input and never replaces new-only data.
  const olderRaw = JSON.stringify({
    ...JSON.parse(retry.record.raw),
    data: { ...retry.state, pvp: { ...retry.state.pvp, level: 90 } },
  });
  await evaluate(
    actors[1].sessionId,
    `localStorage.setItem('v2_progress',${JSON.stringify(olderRaw)});true`
  );
  await evaluate(writer.sessionId, 'tt.authority.refreshProgressAuthority()');
  const recovered = await committed(writer);
  assert.equal(recovered.record.raw, retry.record.raw);
  assert.ok(recovered.record.legacyUpdates.includes(olderRaw));
  const exported = await evaluate(
    writer.sessionId,
    `(async()=>{
    let blob;const original=URL.createObjectURL;URL.createObjectURL=value=>{blob=value;return original(value);};
    try {document.querySelector('[data-testid="device-progress-recovery-export"]').click();
      await new Promise((resolve,reject)=>{const deadline=Date.now()+10000;const check=()=>{if(blob)return resolve();if(Date.now()>deadline)return reject(new Error('Recovery export timed out'));setTimeout(check,20);};check();});
      return JSON.parse(await blob.text());
    }finally{URL.createObjectURL=original;}
  })()`
  );
  assert.equal(exported.current, retry.record.raw);
  assert.ok(exported.older_tab_edits.includes(olderRaw));
  await evaluate(
    writer.sessionId,
    `document.querySelector('[data-testid="older-tab-review-1"]').click();true`
  );
  const preview = await evaluate(
    writer.sessionId,
    `(async()=>{const deadline=Date.now()+10000;while(!document.body.innerText.includes('90 (')){if(Date.now()>deadline)throw new Error('Older edit preview timed out');await new Promise(resolve=>setTimeout(resolve,20));}return document.body.innerText.includes('90 (');})()`
  );
  assert.equal(preview, true);
  assert.equal((await committed(writer)).record.raw, retry.record.raw);
  await evaluate(
    writer.sessionId,
    `document.querySelector('[data-testid="older-tab-cleanup"]').click();true`
  );
  const beforeCleanup = await committed(writer);
  assert.ok(beforeCleanup.record.legacyUpdates.includes(olderRaw));
  await evaluate(
    writer.sessionId,
    `document.querySelector('[data-testid="older-tab-cleanup-confirm"]').click();true`
  );
  const cleared = await evaluate(
    writer.sessionId,
    `(async()=>{
    const deadline=Date.now()+10000;
    while((await tt.authority.readCommittedProgressAuthority()).legacyUpdates?.includes(${JSON.stringify(olderRaw)})) {
      if(Date.now()>deadline)throw new Error('Recovery cleanup timed out');
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    return await tt.authority.readCommittedProgressAuthority();
  })()`
  );
  assert.equal(cleared.raw, retry.record.raw);
  assert.equal(cleared.legacyRaw, beforeCleanup.record.legacyRaw);
  const screenshot = await call('Page.captureScreenshot', { format: 'png' }, writer.sessionId);
  const png = Buffer.from(screenshot.data, 'base64');
  assert(
    png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'Invalid screenshot PNG'
  );
  await writeFile(screenshotPath, png, privateWriteOptions);
  assert((await readFile(screenshotPath)).equals(png), 'Screenshot write validation failed');
  receipt.recovery = {
    currentPreserved: true,
    olderBytesPreserved: true,
    uiExport: true,
    confirmedExportCleanup: true,
  };
  await call('Tracing.end');
  await traceComplete;
  receipt.frames = trace
    .filter((event) => event.name === 'FrameCommittedInBrowser')
    .map((event) => event.args?.data)
    .filter(Boolean);
  const rendererProcesses = new Set(
    trace.filter((event) => event.name === 'progress-app-renderer').map((event) => event.pid)
  );
  receipt.traceMarks = trace.filter((event) => event.name === 'progress-app-renderer');
  assert(rendererProcesses.size >= 2, 'Acceptance requires distinct renderer processes');
  receipt.rendererProcesses = [...rendererProcesses];
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', privateWriteOptions);
  assert.deepEqual(JSON.parse(await readFile(receiptPath, 'utf8')), receipt);
  console.log(`Acceptance artifacts: ${screenshotPath}, ${receiptPath}`);
  console.log(
    `Application acceptance passed: ${receipt.results.length} write/reset orders, native quota/retry, reload, recovery UI export, ${rendererProcesses.size} renderers`
  );
} finally {
  socket?.close();
  child.kill();
}
