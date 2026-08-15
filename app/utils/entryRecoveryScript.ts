// Recovery for entry-module load failures (e.g. a stale chunk request served
// the SPA fallback during a rolling deploy). Runs before the bundle so it
// works when the app itself never boots. Shares the reload-cooldown key with
// ChunkRecovery in app.vue so both mechanisms share one retry budget.
export const ENTRY_RECOVERY_SCRIPT = [
  '(function(){',
  'var KEY="tt:auto-reload-on-asset-error",COOLDOWN=120000;',
  'try{',
  'var last=Number(window.sessionStorage.getItem(KEY));',
  'if(last&&Date.now()-last<COOLDOWN){return;}',
  '}catch(e){return;}',
  'window.addEventListener("error",function(event){',
  'var target=event.target;',
  'if(!target||target.tagName!=="SCRIPT"||target.type!=="module"){return;}',
  'var src=target.getAttribute("src")||"";',
  'if(!src){return;}',
  'var parsed;',
  'try{parsed=new URL(src,window.location.href);}catch(e){return;}',
  'if(parsed.origin!==window.location.origin){return;}',
  'if(window.__ttEntryRecovery){return;}',
  'window.__ttEntryRecovery=true;',
  'try{window.sessionStorage.setItem(KEY,String(Date.now()));}catch(e){return;}',
  'var url=new URL(window.location.href);',
  'url.searchParams.set("_tt_retry",String(Date.now()));',
  'window.location.replace(url.toString());',
  '},true);',
  '})();',
].join('');
