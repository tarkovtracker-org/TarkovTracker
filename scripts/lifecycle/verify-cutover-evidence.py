"""Offline fail-closed validation of operator evidence, never evidence collection.

400 seconds bounds verified hosted Edge execution, NOT accepted downstream effects.
Those require correlated terminal outcomes. Missing/unknown evidence blocks schema changes.
"""
import datetime,json,re,sys
FUNCTIONS=('stripe-webhook','account-delete','account-delete-reconcile')
HOSTED_WORKER_BOUND_SECONDS=400
MAX_EVIDENCE_AGE_SECONDS=300

def stamp(value):
 parsed=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
 if parsed.tzinfo is None or parsed.utcoffset()!=datetime.timedelta(0):raise ValueError('UTC timestamp required')
 return parsed

def reference(value):
 if not isinstance(value,str) or not value.strip():raise ValueError('Restricted evidence reference required')

def fresh(item,earliest,now):
 reference(item['evidence_reference'])
 observed=stamp(item['observed_at'])
 if observed<earliest or observed>now or (now-observed).total_seconds()>MAX_EVIDENCE_AGE_SECONDS:
  raise ValueError('Evidence predates drain boundary, is stale, or is future-dated')
 if item['verified'] is not True:raise ValueError('Observation is not verified')

def verify(evidence,now,approved):
 if evidence['project']!='knptqelvsodccnoehmbj':raise ValueError('Unexpected project')
 if evidence['approved_revision']!=approved['revision'] or not re.fullmatch('[0-9a-f]{40}',approved['revision']):raise ValueError('Unapproved source revision')
 if evidence['hosted_wall_clock_bound_seconds']!=HOSTED_WORKER_BOUND_SECONDS:raise ValueError('Runtime bound differs; stop for review')
 reference(evidence['runtime_limit_evidence_reference'])
 cutoffs=[]
 for name in FUNCTIONS:
  item=evidence['functions'][name]
  for gate in ('source_verified','old_version_routing_closed'):
   if item[gate] is not True:raise ValueError(name+': '+gate+' not verified')
  reference(item['evidence_reference'])
  reference(item['old_version']);reference(item['bridge_version'])
  if item['old_version']==item['bridge_version']:raise ValueError('Bridge version did not change')
  expected=approved['bridge_source_sha256'][name]
  if not re.fullmatch('[0-9a-f]{64}',expected) or item['source_sha256']!=expected:raise ValueError('Bridge source mismatch')
  cutoffs.append(stamp(item['cutoff_confirmed_at']))
 cutoff=max(cutoffs);earliest=cutoff+datetime.timedelta(seconds=HOSTED_WORKER_BOUND_SECONDS)
 if now<earliest:raise ValueError('Hosted worker drain interval not complete')
 for key in ('database','external_outcomes','unlink_capture','exclusive_release_window'):
  fresh(evidence[key],earliest,now)
 database=evidence['database']
 for key in ('active_legacy_requests','active_deletion_claims'):
  if database[key]!=0:raise ValueError('Database work remains active')
 outcomes=evidence['external_outcomes']
 if outcomes['routing_cutoff_confirmed_at']!=cutoff.isoformat():raise ValueError('Outcomes are not bound to latest routing cutoff')
 if outcomes['all_dispatched_mutations_accounted_for'] is not True or outcomes['unresolved_effects']!=0:
  raise ValueError('Outstanding or unaccounted Auth/database/Discord effects')
 for provider in ('auth','postgrest','discord'):
  reference(outcomes['terminal_evidence_references'][provider])
 if evidence['unlink_capture']['prebarrier_identity_transactions_drained'] is not True:raise ValueError('Unlink barrier incomplete')
 return {'gate':'PASS','earliest_schema_change_at':earliest.isoformat(),'deletion_reopen_authorized':False,'scope':'pre-schema operator evidence validation only; application delivery/session reconciliation and all final runtime gates remain required'}

if __name__=='__main__':
 try:
  result=verify(json.load(open(sys.argv[1])),datetime.datetime.now(datetime.timezone.utc),json.load(open(sys.argv[2])))
 except (KeyError,ValueError,IndexError) as error:
  raise SystemExit('CUTOVER BLOCKED: '+str(error))
 print(json.dumps(result))
