"""Non-mutating catalog snapshot for comparing disposable replay paths; excludes row data."""
import hashlib, json, pathlib, subprocess, sys
C='supabase_db_tt-b-http-disposable'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']))
assert labels['com.supabase.cli.project']=='tt-b-http-disposable'
assert labels['com.supabase.cli.workdir']=='/tmp/tt-b-http'
queries={
'functions':"""SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS object,
pg_get_functiondef(p.oid) AS definition,COALESCE(p.proacl::text,'DEFAULT') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','private') AND p.prokind='f'
AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')""",
'columns':"""SELECT n.nspname||'.'||c.relname||'.'||a.attname AS object,format_type(a.atttypid,a.atttypmod) AS type,
a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default_expression,a.attacl::text AS acl
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped""",
'constraints':"""SELECT n.nspname||'.'||c.relname||'.'||k.conname AS object,pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','private')""",
 'triggers':"""SELECT n.nspname||'.'||c.relname||'.'||t.tgname AS object,pg_get_triggerdef(t.oid) AS definition,t.tgenabled
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND (n.nspname IN ('public','private') OR (n.nspname='auth' AND c.relname='identities'))""",
 'tables':"""SELECT n.nspname||'.'||c.relname AS object,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p')""",
 'indexes':"""SELECT n.nspname||'.'||c.relname AS object,pg_get_indexdef(c.oid) AS definition,i.indisvalid,i.indisready
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_index i ON i.indexrelid=c.oid
WHERE n.nspname IN ('public','private')""",
 'policies':"""SELECT schemaname||'.'||tablename||'.'||policyname AS object,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname IN ('public','private')"""
}
result={}
for name,q in queries.items():
 sql="BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY object),'[]') FROM ("+q+") x; ROLLBACK;"
 result[name]=json.loads(subprocess.check_output(['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True))
encoded=(json.dumps(result,sort_keys=True,indent=2)+'\n').encode()
path=pathlib.Path(sys.argv[1]);path.write_bytes(encoded)
unlink=next(x['definition'] for x in result['functions'] if x['object']=='public.delete_discord_account_link()')
print(json.dumps({'catalog_sha256':hashlib.sha256(encoded).hexdigest(),'unlink_sha256':hashlib.sha256(unlink.encode()).hexdigest(),'objects':sum(map(len,result.values()))}))
