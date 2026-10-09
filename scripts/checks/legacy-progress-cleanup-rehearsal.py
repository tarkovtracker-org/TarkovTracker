#!/usr/bin/env python3
"""Local-only cleanup/recovery rehearsal. Never connects to a production host."""
import datetime as dt
import hashlib
import json
import pathlib
import subprocess
import sys
import time

CONTAINER = "supabase_db_TarkovTracker1086"
ROOT = pathlib.Path(sys.argv[1]).resolve()
BASELINE = pathlib.Path(sys.argv[2]).resolve()
OUT = ROOT.parent / "cleanup-local-rehearsal" / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
OUT.mkdir(parents=True, exist_ok=False)
STAMP = dt.datetime.now(dt.timezone.utc).strftime("%H%M%S")
LAB = "tt_cleanup_lab_" + STAMP
RECOVERY = "tt_cleanup_recovered_" + STAMP
CANDIDATE = (ROOT / "supabase/migrations/20261009085500_drop_legacy_progress_columns.sql").read_text()
checks = []

def command(args, data=None, expected=0):
    result = subprocess.run(["docker", "exec", "-i", CONTAINER] + args,
                            input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if expected is not None and result.returncode != expected:
        raise RuntimeError(result.stderr.decode(errors="replace")[-6000:])
    return result

def sql(db, query, expected=0):
    if db != "postgres" and not db.startswith(("tt_cleanup_lab_", "tt_cleanup_recovered_")):
        raise RuntimeError("Unexpected local database")
    return command(["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db],
                   query.encode(), expected)

def scalar(db, query):
    return sql(db, query).stdout.decode().strip().splitlines()[-1]

def check(label, condition, detail=None):
    checks.append({"label": label, "passed": bool(condition), "detail": detail})
    if not condition:
        raise AssertionError(label)

def fingerprints(db, legacy=False):
    account = "to_jsonb(t)" if legacy else "to_jsonb(t) - 'pvp_data' - 'pve_data'"
    parts = []
    for table, expr in [("public.user_progress", account), ("public.user_game_mode_progress", "to_jsonb(t)"),
                        ("public.user_prestige_runs", "to_jsonb(t)"), ("public.user_preferences", "to_jsonb(t)"),
                        ("public.teams", "to_jsonb(t)"), ("public.team_memberships", "to_jsonb(t)"),
                        ("private.account_retention", "to_jsonb(t)")]:
        parts.append("'" + table.split(".")[-1] + "', (SELECT jsonb_build_object('rows', count(*), 'md5',"
                     "md5(COALESCE(string_agg((" + expr + ")::text, E'\\n' ORDER BY (" + expr +
                     ")::text),''))) FROM " + table + " t)")
    return json.loads(scalar(db, "SELECT jsonb_build_object(" + ",".join(parts) + ");"))

def dump(db, name):
    path = "/tmp/" + name + ".dump"
    command(["pg_dump", "-U", "postgres", "-d", db, "--format=custom", "--file=" + path])
    listing = command(["pg_restore", "--list", path]).stdout.decode()
    # pg_cron is cluster-bound to postgres. Preserve application objects, but exclude that
    # platform extension/schema/events from the secondary-database rehearsal.
    lines = listing.splitlines()
    excluded = [line for line in lines if not line.startswith(";") and
                ("pg_cron" in line or " cron " in line)]
    filtered = "\n".join(line for line in lines if line not in excluded) + "\n"
    tocpath = "/tmp/" + name + ".toc"
    command(["sh", "-c", "cat > " + tocpath], filtered.encode())
    archive = command(["cat", path]).stdout
    (OUT / (name + ".dump")).write_bytes(archive)
    (OUT / (name + ".toc")).write_text(filtered)
    return path, tocpath, {"name": name, "sha256": hashlib.sha256(archive).hexdigest(),
                          "bytes": len(archive), "excluded_cluster_bound_toc_entries": excluded}

def restore(db, archive, toc):
    command(["createdb", "-U", "supabase_admin", "--owner=postgres", db])
    command(["pg_restore", "-U", "supabase_admin", "-d", db, "--exit-on-error",
             "--use-list=" + toc, archive])

def guarded_candidate(db):
    return sql(db, CANDIDATE, expected=None)

def sizes(db):
    return json.loads(scalar(db, """SELECT jsonb_build_object(
      'heap',pg_relation_size('public.user_progress'),
      'table',pg_table_size('public.user_progress'),
      'total',pg_total_relation_size('public.user_progress'));"""))

source_users = int(scalar("postgres", "SELECT count(*) FROM auth.users;"))
check("source isolated Supabase database has no user rows", source_users == 0)
version = scalar("postgres", "SELECT version();")
check("matching PostgreSQL 17 server/dump tools", "PostgreSQL 17." in version)
baseline_bytes = BASELINE.read_bytes()
baseline_hash = hashlib.sha256(baseline_bytes).hexdigest()
check("verified synthetic pre-cleanup source archive",
      baseline_hash == "18673d23b70f698cf73dfd4dbde0fe953bdc229f587941ae7e21d119c0964572")
source_archive = "/tmp/cleanup-source-" + STAMP + ".dump"
command(["sh", "-c", "cat > " + source_archive], baseline_bytes)
listing = command(["pg_restore","--list",source_archive]).stdout.decode()
lines = listing.splitlines()
excluded = [line for line in lines if not line.startswith(";") and
            ("pg_cron" in line or " cron " in line)]
source_toc = "/tmp/cleanup-source-" + STAMP + ".toc"
command(["sh","-c","cat > " + source_toc],
        ("\n".join(line for line in lines if line not in excluded)+"\n").encode())
restore(LAB, source_archive, source_toc)
check("restored pre-cleanup baseline contains no Auth user data",
      scalar(LAB,"SELECT count(*) FROM auth.users;") == "0")
sql(LAB, """
-- Simulate season rollover locally so a real prior-season row can coexist with active season 2.
CREATE OR REPLACE FUNCTION private.active_season_number()
RETURNS smallint LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 2::smallint; $$;
INSERT INTO auth.users(id,email)
SELECT md5('cleanup-fixture-'||g)::uuid, 'cleanup-'||g||'@example.invalid'
FROM generate_series(0,31) g;
UPDATE public.user_progress
SET pvp_data=jsonb_build_object('level',60,'progressEpoch',1,'taskCompletions',
  (SELECT jsonb_object_agg(md5(g::text),jsonb_build_object('complete',g%2=0))
   FROM generate_series(1,1200) g)),
  pve_data=jsonb_build_object('level',45,'progressEpoch',1);
INSERT INTO public.user_game_mode_progress(user_id,game_mode,season_number,progress_data)
SELECT md5('cleanup-fixture-'||g)::uuid, mode,
  CASE WHEN mode='seasonal' THEN private.active_season_number() ELSE 0 END,
  jsonb_build_object('level',CASE mode WHEN 'pvp' THEN 20 WHEN 'pve' THEN 10 ELSE 4 END,
    'progressEpoch',3,'traders',jsonb_build_object('prapor',jsonb_build_object('level',2,'reputation',0.2)),
    'skills',jsonb_build_object('Endurance',3))
FROM generate_series(0,31) g CROSS JOIN (VALUES('pvp'),('pve'),('seasonal')) modes(mode);
INSERT INTO public.user_game_mode_progress(user_id,game_mode,season_number,progress_data)
VALUES(md5('cleanup-fixture-0')::uuid,'seasonal',private.active_season_number()-1,
  '{"level":33,"progressEpoch":7}');
INSERT INTO public.user_prestige_runs(user_id,mode,prestige_from,prestige_to,archived_progress,summary)
VALUES(md5('cleanup-fixture-0')::uuid,'pvp',0,1,'{"level":50,"progressEpoch":1}','{"label":"synthetic archived run"}');
INSERT INTO public.teams(id,name,join_code,max_members,owner_id,game_mode)
VALUES(md5('cleanup-team')::uuid,'Synthetic cleanup team','synthetic-cleanup-team',5,
 md5('cleanup-fixture-0')::uuid,'pvp');
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
VALUES(md5('cleanup-team')::uuid,md5('cleanup-fixture-0')::uuid,'owner','pvp'),
 (md5('cleanup-team')::uuid,md5('cleanup-fixture-1')::uuid,'member','pvp');
INSERT INTO public.user_preferences(user_id,streamer_mode,team_hide,locale_override)
SELECT md5('cleanup-fixture-'||g)::uuid,true,'{"tasks":true}', 'de'
FROM generate_series(0,31) g;
UPDATE private.account_retention SET last_active_at=now()-interval '2 days',
 pending_since=now()-interval '1 day',last_attempt_at=now()-interval '12 hours',
 last_error='synthetic prior retry';
""")
before = fingerprints(LAB)
check("preferences and retention preservation fingerprints contain meaningful rows",
      before["user_preferences"]["rows"] == 32 and before["account_retention"]["rows"] == 32)
legacy_before = fingerprints(LAB, legacy=True)
function_before = scalar(LAB, """SELECT jsonb_object_agg(proname,jsonb_build_object(
 'hash',md5(pg_get_functiondef(oid)),'acl',proacl::text))
 FROM pg_proc WHERE oid IN (
 'public.merge_progress_data(uuid,text,jsonb,jsonb,jsonb)'::regprocedure,
 'public.sync_user_game_mode_progress(text,integer,bigint,jsonb,smallint)'::regprocedure);""")
naive = sql(LAB, "BEGIN; ALTER TABLE public.user_progress DROP COLUMN pvp_data RESTRICT; COMMIT;", expected=None)
check("naive column drop reproduces real dependent-object failure", naive.returncode != 0 and
      "depend" in naive.stderr.decode(), naive.stderr.decode()[-1300:])
sql(LAB, "CREATE VIEW public.cleanup_unknown_dependency AS SELECT pvp_data FROM public.user_progress;")
guarded = guarded_candidate(LAB)
check("unexpected dependency fails closed without CASCADE", guarded.returncode != 0 and
      "cleanup_unknown_dependency" in guarded.stderr.decode())
check("failed cleanup transaction preserves every retained field", fingerprints(LAB) == before)
check("failed cleanup transaction preserves legacy bytes", fingerprints(LAB, legacy=True) == legacy_before)
sql(LAB, "DROP VIEW public.cleanup_unknown_dependency;")
# Real conflicting access-share transaction; the bounded candidate must abort and roll back.
holder = subprocess.Popen(["docker", "exec", "-i", CONTAINER, "psql", "-X", "-q", "-U", "postgres",
                          "-d", LAB], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
holder.stdin.write(b"BEGIN; SELECT count(*) FROM public.user_progress; SELECT pg_sleep(4); COMMIT;\n")
holder.stdin.close()
time.sleep(0.3)
locked = guarded_candidate(LAB)
holder.wait(timeout=10)
check("active account reader causes bounded lock timeout and atomic rollback",
      locked.returncode != 0 and "lock timeout" in locked.stderr.decode())
check("lock timeout preserves account and normalized data", fingerprints(LAB) == before)
fixture_archive, fixture_toc, backup_receipt = dump(LAB, "cleanup-fixture-" + STAMP)
# Rehearse the proposed minimal target-only recovery route with synthetic rows.
# Post-data is omitted, so no FK, trigger, grant or publication executes at the extraction target.
target_archive = "/tmp/cleanup-account-only-" + STAMP + ".dump"
command(["pg_dump","-U","postgres","-d",LAB,"--table=public.user_progress",
         "--format=custom","--no-acl","--no-comments","--no-security-labels",
         "--no-large-objects","--lock-wait-timeout=1s","--file="+target_archive])
target_toc = command(["pg_restore","--list",target_archive]).stdout.decode()
check("target-only archive excludes Auth, payment, secrets and cron schemas",
      "TABLE DATA public user_progress" in target_toc and
      not any(s in target_toc for s in ["TABLE DATA auth ", "TABLE DATA private ", "TABLE DATA cron "]))
TARGET = RECOVERY + "_target"
command(["createdb","-U","supabase_admin","--owner=postgres",TARGET])
command(["pg_restore","-U","supabase_admin","-d",TARGET,"--exit-on-error",
         "--section=pre-data","--section=data","--no-owner","--no-privileges",target_archive])
target_fingerprint = json.loads(scalar(TARGET,
    "SELECT jsonb_build_object('rows',count(*),'md5',md5(COALESCE(string_agg("
    "to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''))) FROM public.user_progress t;"))
check("target-only restore recovers both legacy JSON columns and all metadata exactly",
      target_fingerprint == legacy_before["user_progress"])
check("target-only restore has no scheduled extensions, application triggers or Auth data",
      scalar(TARGET,"SELECT (SELECT count(*) FROM pg_extension WHERE extname IN ('pg_cron','pg_net'))"
      "+(SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal)"
      "+(SELECT count(*) FROM pg_namespace WHERE nspname IN ('auth','cron','vault'));") == "0")
target_archive_bytes = command(["cat",target_archive]).stdout
(OUT/"cleanup-account-only.dump").write_bytes(target_archive_bytes)
target_receipt={"sha256":hashlib.sha256(target_archive_bytes).hexdigest(),
                "bytes":len(target_archive_bytes),"database":TARGET,
                "fingerprint":target_fingerprint,"synthetic_only":True}
before_size = sizes(LAB)
applied = guarded_candidate(LAB)
check("complete dependency-aware candidate applies", applied.returncode == 0,
      applied.stderr.decode()[-1500:])
check("column cleanup preserves full metadata, normalized, historical and archived rows",
      fingerprints(LAB) == before)
check("main RPC definition and grants unchanged", scalar(LAB, """SELECT jsonb_object_agg(proname,jsonb_build_object(
 'hash',md5(pg_get_functiondef(oid)),'acl',proacl::text))
 FROM pg_proc WHERE oid IN (
 'public.merge_progress_data(uuid,text,jsonb,jsonb,jsonb)'::regprocedure,
 'public.sync_user_game_mode_progress(text,integer,bigint,jsonb,smallint)'::regprocedure);""") == function_before)
legacy_read = sql(LAB, "SELECT pvp_data,pve_data FROM public.user_progress;", expected=None)
check("old column reader rejected explicitly", legacy_read.returncode != 0 and
      "does not exist" in legacy_read.stderr.decode())
after_drop_size = sizes(LAB)
sql(LAB, "VACUUM (FULL, ANALYZE) public.user_progress;")
after_rewrite_size = sizes(LAB)
check("measured local rewrite reclaims space while preserving retained fields",
      after_rewrite_size["total"] < before_size["total"] and fingerprints(LAB) == before)
restore(RECOVERY, fixture_archive, fixture_toc)
check("isolated logical restore preserves every target and retained field exactly",
      fingerprints(RECOVERY, legacy=True) == legacy_before)
check("restored source can apply the same forward cleanup", guarded_candidate(RECOVERY).returncode == 0)
check("restored cleanup preserves normalized snapshot exactly", fingerprints(RECOVERY) == before)

active_season = int(scalar(LAB, "SELECT private.active_season_number();"))
user0 = "md5('cleanup-fixture-0')::uuid"
auth = "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub',md5('cleanup-fixture-0')::uuid::text,true);"
check("current startup metadata SELECT works under real authenticated role",
      int(scalar(LAB, auth + " SELECT count(*) FROM (SELECT user_id,current_game_mode,game_edition,tarkov_uid,updated_at FROM public.user_progress) q; ROLLBACK;").splitlines()[-1]) == 1)
check("same-mode teammate visible and other modes excluded",
      int(scalar(LAB, auth + " SELECT count(*) FROM public.user_game_mode_progress WHERE user_id=md5('cleanup-fixture-1')::uuid; ROLLBACK;")) == 1)
check("outsider cannot read normalized progress",
      int(scalar(LAB, auth + " SELECT count(*) FROM public.user_game_mode_progress WHERE user_id=md5('cleanup-fixture-2')::uuid; ROLLBACK;")) == 0)
sql(LAB, auth + """ SELECT public.sync_user_game_mode_progress('pvp',3,1000,
 '{"pvp":{"level":1,"progressEpoch":99,"traders":{"prapor":{"level":1,"reputation":0}},"skills":{"Endurance":0}},
 "seasonal":{"level":99}}', """ + str(active_season - 1) + "::smallint); COMMIT;")
check("reset/decreases persist with removed columns", scalar(LAB,
 "SELECT progress_data->>'level' FROM public.user_game_mode_progress WHERE user_id="+user0+
 " AND game_mode='pvp';") == "1")
check("stale Seasonal caller does not overwrite current or historical season",
      scalar(LAB,"SELECT string_agg(progress_data->>'level',',' ORDER BY season_number) FROM public.user_game_mode_progress WHERE user_id="+user0+" AND game_mode='seasonal';") == "33,4")
for field in ["pvp_data","pve_data","seasonal_data"]:
    old = scalar(LAB,"SELECT ctid::text FROM public.user_progress WHERE user_id="+user0+";")
    sql(LAB, "SET ROLE service_role; SELECT public.merge_progress_data("+user0+",'"+field+"',NULL,NULL,'{}');")
    new = scalar(LAB,"SELECT ctid::text FROM public.user_progress WHERE user_id="+user0+";")
    check(field+" no-op API still advances compatibility account tuple", old != new)
check("persistent account clock covers normalized clock",scalar(LAB,
 "SELECT (a.updated_at >= max(m.progress_updated_at))::text FROM public.user_progress a JOIN public.user_game_mode_progress m USING(user_id) WHERE a.user_id="+user0+" GROUP BY a.updated_at;") == "true")
sql(LAB, auth + """ SELECT public.archive_prestige_run_and_reset_progress(
 'pvp',1,2,'{"level":1,"progressEpoch":99}','{"label":"post-cleanup archive"}',now(),
 'pvp',3,1000,'{"level":1,"prestigeLevel":2,"progressEpoch":100}','{"level":10,"progressEpoch":3}'); COMMIT;""")
check("prestige archive/reset RPC survives column removal",scalar(LAB,
 "SELECT count(*) FROM public.user_prestige_runs WHERE user_id="+user0+";") == "2")
check("Realtime account publication remains with metadata columns only",scalar(LAB,
 "SELECT count(*) FROM pg_publication_tables WHERE schemaname='public' AND tablename='user_progress' AND pubname='supabase_realtime';") == "1")

# Recover only the frozen fields after the cleanup has COMMITTED and newer real writes exist.
# Source values come from the separately restored table-only archive, never from normalized rows.
sql(LAB, "CREATE TABLE private.cleanup_legacy_restore_source(user_id uuid PRIMARY KEY,pvp_data jsonb,pve_data jsonb);")
recovered_fields = sql(TARGET,
    "COPY (SELECT user_id,pvp_data,pve_data FROM public.user_progress) TO STDOUT (FORMAT binary);").stdout
command(["psql","-X","-q","-v","ON_ERROR_STOP=1","-U","postgres","-d",LAB,
         "-c","COPY private.cleanup_legacy_restore_source FROM STDIN (FORMAT binary);"], recovered_fields)
sql(LAB, auth + """ SELECT public.sync_user_game_mode_progress('pve',2,2000,
 '{"pve":{"level":88,"progressEpoch":101}}',""" + str(active_season) + "::smallint); COMMIT;")
sql(LAB, """
UPDATE public.user_preferences SET streamer_mode=false,locale_override='fr',team_hide='{"tasks":false}'
WHERE user_id=md5('cleanup-fixture-0')::uuid;
UPDATE private.account_retention SET pending_since=now()-interval '4 hours',last_error='synthetic newer retry'
WHERE user_id=md5('cleanup-fixture-1')::uuid;
INSERT INTO auth.users(id,email) VALUES(md5('cleanup-fixture-32')::uuid,'cleanup-new@example.invalid');
DELETE FROM auth.users WHERE id=md5('cleanup-fixture-31')::uuid;
""")
newer = fingerprints(LAB)
check("post-commit writes change metadata, normalized progress, preferences and retention",
      all(newer[t] != before[t] for t in ["user_progress","user_game_mode_progress",
                                         "user_preferences","account_retention"]))
trigger_query = """SELECT jsonb_object_agg(tgname,jsonb_build_object('enabled',tgenabled,
 'definition',md5(pg_get_triggerdef(oid)))) FROM pg_trigger
 WHERE tgrelid='public.user_progress'::regclass AND NOT tgisinternal;"""
trigger_before = scalar(LAB,trigger_query)
add_fields = "ALTER TABLE public.user_progress ADD COLUMN pvp_data jsonb, ADD COLUMN pve_data jsonb;"
restore_fields = """UPDATE public.user_progress a SET pvp_data=b.pvp_data,pve_data=b.pve_data
 FROM private.cleanup_legacy_restore_source b WHERE a.user_id=b.user_id;"""
marker_before = scalar(LAB,"SELECT metadata_write_id FROM public.user_progress WHERE user_id="+user0+";")
naive_restore = scalar(LAB,"BEGIN; "+add_fields+restore_fields+
    " SELECT metadata_write_id FROM public.user_progress WHERE user_id="+user0+"; ROLLBACK;")
check("naive field-only restore reproduces unwanted newer metadata marker mutation",
      naive_restore != marker_before)
check("negative-control rollback preserves all newer data",fingerprints(LAB) == newer)

# This is a LOCAL recovery rehearsal, not a production migration or a standing bypass.
# Fail closed on unreviewed trigger states; disable exactly the two account metadata triggers
# inside the same bounded locked transaction, and restore them before committing.
recovery_sql = """BEGIN;
SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='20s';
LOCK TABLE public.user_progress IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF (SELECT array_agg(tgname::text ORDER BY tgname) FROM pg_trigger
     WHERE tgrelid='public.user_progress'::regclass AND NOT tgisinternal)
      IS DISTINCT FROM ARRAY['set_progress_metadata_write_id','set_user_progress_updated_at']::text[]
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_progress'::regclass
              AND NOT tgisinternal AND tgenabled<>'O') THEN
  RAISE EXCEPTION 'Recovery trigger contract changed';
 END IF;
END $$;
""" + add_fields + """
ALTER TABLE public.user_progress DISABLE TRIGGER set_progress_metadata_write_id;
ALTER TABLE public.user_progress DISABLE TRIGGER set_user_progress_updated_at;
""" + restore_fields + """
ALTER TABLE public.user_progress ENABLE TRIGGER set_progress_metadata_write_id;
ALTER TABLE public.user_progress ENABLE TRIGGER set_user_progress_updated_at;
COMMIT;
"""
sql(LAB,"CREATE TRIGGER cleanup_unreviewed_trigger BEFORE UPDATE ON public.user_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();")
unknown_restore = sql(LAB,recovery_sql,expected=None)
check("unreviewed recovery trigger fails closed",unknown_restore.returncode != 0 and
      "Recovery trigger contract changed" in unknown_restore.stderr.decode())
sql(LAB,"DROP TRIGGER cleanup_unreviewed_trigger ON public.user_progress;")
aborted_restore = sql(LAB,recovery_sql.replace(
    "ALTER TABLE public.user_progress ENABLE TRIGGER set_progress_metadata_write_id;",
    "SELECT 1/0; ALTER TABLE public.user_progress ENABLE TRIGGER set_progress_metadata_write_id;"),expected=None)
check("failure after field restoration atomically restores trigger states and newer rows",
      aborted_restore.returncode != 0 and "division by zero" in aborted_restore.stderr.decode()
      and scalar(LAB,trigger_query) == trigger_before and fingerprints(LAB) == newer
      and scalar(LAB,"SELECT count(*) FROM pg_attribute WHERE attrelid='public.user_progress'::regclass AND attname IN ('pvp_data','pve_data') AND NOT attisdropped;") == "0")
sql(LAB,recovery_sql)
check("committed field-only restoration preserves all newer metadata and application rows",
      fingerprints(LAB) == newer)
check("all existing archived accounts recover exactly their two frozen JSON values",
      scalar(LAB,"""SELECT count(*) FROM public.user_progress a
      JOIN private.cleanup_legacy_restore_source b USING(user_id)
      WHERE a.pvp_data IS NOT DISTINCT FROM b.pvp_data AND a.pve_data IS NOT DISTINCT FROM b.pve_data;""") == "31")
check("new account is retained without invented legacy JSON",scalar(LAB,
      "SELECT count(*) FROM public.user_progress WHERE user_id=md5('cleanup-fixture-32')::uuid AND pvp_data IS NULL AND pve_data IS NULL;") == "1")
check("deleted account is never resurrected",scalar(LAB,
      "SELECT (SELECT count(*) FROM auth.users WHERE id=md5('cleanup-fixture-31')::uuid)+(SELECT count(*) FROM public.user_progress WHERE user_id=md5('cleanup-fixture-31')::uuid);") == "0")
check("field-only restore retains exact account trigger definitions and enabled states",
      scalar(LAB,trigger_query) == trigger_before)
check("frozen recovery values never replace newer normalized progress",scalar(LAB,
      "SELECT progress_data->>'level' FROM public.user_game_mode_progress WHERE user_id="+user0+" AND game_mode='pve';") == "88")
sql(LAB,auth+" SELECT public.sync_user_game_mode_progress('pve',3,2000,'{}',"+str(active_season)+"::smallint); COMMIT;")
check("normal RPC metadata tracking resumes after recovery commit",scalar(LAB,
      "SELECT metadata_write_id FROM public.user_progress WHERE user_id="+user0+";") != marker_before)
post_commit_recovery = {"preserved_newer_fingerprints":newer,"matching_archived_accounts":31,
    "new_account_untouched":True,"deleted_account_not_resurrected":True,
    "source":"pre-data/data restore of custom-format table-only synthetic archive",
    "transaction":"1s lock timeout / 20s statement timeout / account table exclusive lock; exactly two metadata triggers temporarily disabled and restored",
    "production_authorized":False}
receipt = {"completed_at":dt.datetime.now(dt.timezone.utc).isoformat(),"container":CONTAINER,
 "postgres_version":version,"databases":{"lab":LAB,"recovery":RECOVERY},
 "candidate_sha256":hashlib.sha256(CANDIDATE.encode()).hexdigest(),
 "synthetic_auth_users":32,"backup":backup_receipt,"baseline_sha256":baseline_hash,
 "target_only_backup":target_receipt,"checks":checks,
 "post_commit_field_only_recovery":post_commit_recovery,
 "sizes":{"before":before_size,"after_drop":after_drop_size,"after_rewrite":after_rewrite_size},
 "fingerprints_before":before,"fingerprints_restored_after_cleanup":fingerprints(RECOVERY),
 "limits":["Synthetic data only. No production dump, restore, write, grants or credentials.",
 "Restore uses the existing local supabase_admin role over a container socket to preserve Supabase-managed ownership; no new role/credential/grant is created. pg_cron platform entries are excluded from a secondary local DB; application schemas, Auth fixtures, migration history, publication and ACLs restored.",
 "Matching-version local logical recovery proof is not a production physical-backup restore proof.",
 "Local active season 2 simulates rollover; production active-season configuration is untouched.",
 "Local timing and reclaimed bytes cannot predict production maintenance duration or savings."]}
(OUT / "receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps({"receipt":str(OUT / "receipt.json"),"checks":len(checks),
                  "all_passed":all(c["passed"] for c in checks),"sizes":receipt["sizes"]},indent=2))
