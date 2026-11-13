"""Backup consistente somente leitura via SUPABASE_DB_URL, mantida em segredo.
Exporta snapshot para dump e fingerprints compartilharem exatamente os mesmos dados.
"""
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import urlsplit,parse_qsl,urlunsplit,urlencode

module_spec=importlib.util.spec_from_file_location('restore',Path(__file__).with_name('verify-restore.py'))
restore=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(restore)

if not os.environ.get('SUPABASE_DB_URL'):
    sys.exit('Configure SUPABASE_DB_URL nos segredos do ambiente; não envie credenciais no chat.')
if not all(shutil.which(tool) for tool in ('pg_dump','pg_restore','psql')):
    sys.exit('Instale psql, pg_dump e pg_restore compatíveis com o servidor.')
os.umask(0o077)
folder=Path(sys.argv[1] if len(sys.argv)>1 else 'work/backups');folder.mkdir(parents=True,exist_ok=True)
path=folder/('supabase-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.dump')
# Credencial não entra nos argumentos nem nos arquivos de manifesto.
uri=urlsplit(os.environ['SUPABASE_DB_URL'])
query=dict(parse_qsl(uri.query));query['sslmode']='verify-full'
secure_uri=urlunsplit((uri.scheme,uri.netloc,uri.path,urlencode(query),uri.fragment))
env=dict(os.environ,PGDATABASE=secure_uri,PGSSLMODE='verify-full',PGCONNECT_TIMEOUT='20')
connection=None
try:
    connection=subprocess.Popen(['psql','-XqAt','-v','ON_ERROR_STOP=1'],env=env,
        stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    connection.stdin.write("begin isolation level repeatable read read only;\nselect pg_export_snapshot();\n");connection.stdin.flush()
    snapshot=connection.stdout.readline().strip()
    if not snapshot or not all(c in '0123456789ABCDEFabcdef-' for c in snapshot):raise RuntimeError('Snapshot indisponível')
    with path.open('xb') as target:
        subprocess.run(['pg_dump','--format=custom','--no-owner','--no-acl','--snapshot='+snapshot],env=env,stdout=target,stderr=subprocess.PIPE,check=True,timeout=1800)
    connection.stdin.write("select jsonb_agg(jsonb_build_array(schemaname,tablename) order by schemaname,tablename) from pg_catalog.pg_tables where schemaname in ('public','auth','storage');\n");connection.stdin.flush()
    tables=json.loads(connection.stdout.readline())
    connection.stdin.write(restore.fingerprint_sql(tables)+'\n');connection.stdin.flush()
    fingerprints=json.loads(connection.stdout.readline())
    connection.stdin.write('commit;\n\\q\n');connection.stdin.flush();connection.wait(timeout=20)
    if connection.returncode:raise RuntimeError('Falha na leitura')
    toc=subprocess.run(['pg_restore','--list',str(path)],capture_output=True,check=True)
    for table in (b'events',b'registrations',b'payments',b'users'):
        if table not in toc.stdout:raise RuntimeError('Tabela ausente')
    with path.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
    manifest={'file':path.name,'bytes':path.stat().st_size,'sha256':digest,
      'tables':tables,'source_fingerprints':fingerprints,'archive_readable':True,'restore_verified':False,
      'scope':'PostgreSQL; não inclui binários do Storage nem configuração externa de Auth'}
    path.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Backup privado criado com hashes do snapshot. Falta validar restauração:',path)
except Exception as error:
    print('Etapa falhou:',type(error).__name__,file=sys.stderr)
    sys.exit('Backup falhou/incompleto. Não aplicar migrações. Confira privadamente conexão, TLS e permissões.')
finally:
    if connection and connection.poll() is None:connection.kill();connection.wait()
