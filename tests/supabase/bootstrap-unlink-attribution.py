"""Real local Auth transport regression for B0 identity attribution; no external providers."""
import pathlib
source=pathlib.Path(__file__).with_name('bootstrap-unlink-http.py').read_text()
exec(compile(source.split('assert sql(')[0], 'bootstrap-unlink-http.py', 'exec'))
root=pathlib.Path(__file__).resolve().parents[2]
migration=(root/'supabase/migrations/20260914092616_lifecycle_unlink_bootstrap.sql').read_text()
start=migration.index('CREATE OR REPLACE FUNCTION public.delete_discord_account_link()')
end=migration.index('REVOKE ALL ON FUNCTION public.delete_discord_account_link()',start)
reviewed=migration[start:end]
saved=sql("SELECT pg_get_functiondef('public.delete_discord_account_link()'::regprocedure)")
check(sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL")=='0','no concurrent local lifecycle invocation')
check(sql("SELECT bool_and(NOT enabled) FROM private.lifecycle_delivery_controls WHERE component='provider_processing'")=='t','external provider processing disabled')
try:
 sql(reviewed)
 uid,email,token=create();identity,original=link(uid,email,token)
 different=str(uuid.uuid4().int % 10**18)
 sql(f"UPDATE public.discord_account_links SET discord_user_id='{different}' WHERE user_id='{uid}'")
 status,_,_=request('/auth/v1/user/identities/'+identity,token,method='DELETE')
 check(status==200,'direct Auth unlink succeeds with differing current app link')
 check(sql(f"SELECT discord_user_id='{different}' FROM public.discord_account_links WHERE user_id='{uid}'")=='t','different current linkage remains intact')
 check(sql(f"SELECT count(*)>0 FROM private.lifecycle_bootstrap_discord WHERE user_id='{uid}' AND discord_id='{original}'")=='t','removed authoritative identity durably preserved')
 check(sql(f"SELECT count(*) FROM private.lifecycle_bootstrap_discord WHERE user_id='{uid}' AND discord_id='{different}'")=='0','current different identity not queued by bootstrap unlink')
 check(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE user_id='{uid}' AND resource_id='{different}'")=='0','handoff cannot schedule removal for still-linked identity')
 check(sql(f"SELECT count(*) FROM auth.identities WHERE id='{identity}'")=='0','original linkage removed only through supported Auth API')
finally:
 sql(saved)
check(sql("SELECT pg_get_functiondef('public.delete_discord_account_link()'::regprocedure)")==saved,'original local runtime definition restored')
print(json.dumps({'passed':len(passed),'transport':'real local Auth','providers':'synthetic OAuth only','production_changes':0}))
