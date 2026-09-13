"""Real local Edge signature/inbox transport; synthetic no-provider-effect events only."""
import json,pathlib,subprocess,uuid,time,hmac,hashlib,urllib.request,urllib.error
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());base=cfg['API_URL'];c='supabase_db_tt-b-http-disposable'
if base!='http://127.0.0.1:59321':raise RuntimeError('Unexpected API')
labels=json.loads(subprocess.check_output(['docker','inspect',c,'--format','{{json .Config.Labels}}']))
if labels.get('com.supabase.cli.project')!='tt-b-http-disposable':raise RuntimeError('Unexpected project')
def sql(q):return subprocess.check_output(['docker','exec','-i',c,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=q,text=True).strip()
passed=[]
def check(v,label):
 if not v:raise AssertionError(label)
 passed.append(label);print('PASS',label,flush=True)
def send(identifier,valid=True):
 body=json.dumps({'id':identifier,'type':'candidate.no_effect_probe','data':{'object':{}}}).encode();timestamp=str(int(time.time()))
 signature=hmac.new(b'whsec_synthetic_edge_only',timestamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
 req=urllib.request.Request(base+'/functions/v1/stripe-webhook',data=body,headers={'Content-Type':'application/json','stripe-signature':f't={timestamp},v1={signature}' if valid else 'invalid'})
 try:
  with urllib.request.urlopen(req,timeout=15) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
id='evt_'+uuid.uuid4().hex
status,body=send(id,False);check(status==401,'actual Edge rejects invalid signature')
check(sql(f"SELECT count(*) FROM public.stripe_events WHERE event_id='{id}'")=='0','invalid signature creates no receipt')
status,body=send(id);check(status==200 and body.get('completed') is True,'actual Edge valid no-effect event completes')
status,body=send(id);check(status==200 and body.get('completed') is True,'actual Edge duplicate completion remains idempotent')
check(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE resource_id='{id}'")=='1','duplicate delivery has one inbox item')
id='evt_'+uuid.uuid4().hex
sql(f"SELECT public.claim_stripe_lifecycle('{id}','candidate.no_effect_probe')")
status,body=send(id);check(status==503 and body.get('completed') is False,'receipt and active claim are not completion')
sql(f"UPDATE private.lifecycle_work SET lease_until=clock_timestamp()-interval '1 second' WHERE resource_id='{id}'")
status,body=send(id);check(status==200 and body.get('completed') is True,'actual Edge recovers expired crashed claim')
legacy='evt_'+uuid.uuid4().hex
sql(f"INSERT INTO public.stripe_events(event_id,event_type,received_at) VALUES('{legacy}','candidate.no_effect_probe',clock_timestamp()-interval '1 year')")
status,body=send(legacy);check(status==202 and body.get('review') is True,'legacy receipt becomes visible unknown review rather than completed')
check(sql(f"SELECT count(*) FROM public.stripe_events WHERE event_id='{legacy}'")=='1','legacy receipt preserved')
status,body=send('evt_'+uuid.uuid4().hex);check(status==200,'unrelated new delivery is not suppressed by legacy receipt')
print(json.dumps({'passed':len(passed),'edge_runtime':'real','stripe_provider_calls':0,'provider_effect_edge_matrix':'BLOCKED_NO_TEST_MODE_ACCESS'}))
