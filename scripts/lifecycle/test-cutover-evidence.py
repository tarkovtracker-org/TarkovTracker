"""Deterministic evidence-validator regression; no network or production claims."""
import importlib.util,pathlib,datetime,copy
spec=importlib.util.spec_from_file_location('gate',pathlib.Path(__file__).with_name('verify-cutover-evidence.py'));gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
start=datetime.datetime(2026,9,15,tzinfo=datetime.timezone.utc);end=start+datetime.timedelta(seconds=400)
approved={'revision':'a'*40,'bridge_source_sha256':{n:'b'*64 for n in gate.FUNCTIONS}}
e={'project':'knptqelvsodccnoehmbj','approved_revision':approved['revision'],'hosted_wall_clock_bound_seconds':400,'runtime_limit_evidence_reference':'synthetic/runtime',
 'functions':{n:{'source_verified':True,'old_version_routing_closed':True,'old_version':'old','bridge_version':'bridge','source_sha256':'b'*64,'cutoff_confirmed_at':start.isoformat(),'evidence_reference':'synthetic/route'} for n in gate.FUNCTIONS}}
for name in ('database','external_outcomes','unlink_capture','exclusive_release_window'):e[name]={'verified':True,'observed_at':end.isoformat(),'evidence_reference':'synthetic/'+name}
e['database'].update(active_legacy_requests=0,active_deletion_claims=0)
e['external_outcomes'].update(routing_cutoff_confirmed_at=start.isoformat(),all_dispatched_mutations_accounted_for=True,unresolved_effects=0,terminal_evidence_references={n:'synthetic/'+n for n in ('auth','postgrest','discord')})
e['unlink_capture']['prebarrier_identity_transactions_drained']=True
assert gate.verify(e,end,approved)['gate']=='PASS'
assert gate.verify(e,end,approved)['deletion_reopen_authorized'] is False
checks=2

def reject(changed,now=end):
 global checks
 try:gate.verify(changed,now,approved)
 except (ValueError,KeyError):checks+=1;return
 raise AssertionError('Invalid evidence accepted')
for seconds in (0,150,399):reject(e,start+datetime.timedelta(seconds=seconds))
for name in ('database','external_outcomes','unlink_capture','exclusive_release_window'):
 for key,value in [('verified',False),('observed_at',start.isoformat()),('evidence_reference','')]:
  changed=copy.deepcopy(e);changed[name][key]=value;reject(changed)
reject(e,end+datetime.timedelta(seconds=301))
for key,value in [('unresolved_effects',1),('all_dispatched_mutations_accounted_for',False),('routing_cutoff_confirmed_at',end.isoformat())]:
 changed=copy.deepcopy(e);changed['external_outcomes'][key]=value;reject(changed)
for name in gate.FUNCTIONS:
 changed=copy.deepcopy(e);changed['functions'][name]['source_sha256']='c'*64;reject(changed)
 changed=copy.deepcopy(e);changed['functions'][name]['cutoff_confirmed_at']=(start+datetime.timedelta(seconds=50)).isoformat();reject(changed)
changed=copy.deepcopy(e);changed['external_outcomes']['terminal_evidence_references']['auth']='';reject(changed)
print(f'PASS {checks} offline assertions; no hosted execution or production evidence claim')
