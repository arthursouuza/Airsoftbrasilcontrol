"""Backup PostgreSQL somente leitura. Credencial somente via SUPABASE_DB_URL.
Não executa restauração nem altera o banco remoto. Use cliente pg_dump compatível.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

if not os.environ.get('SUPABASE_DB_URL'):
    sys.exit('Configure SUPABASE_DB_URL nos segredos do ambiente; não envie credenciais no chat.')
if not all(shutil.which(tool) for tool in ('pg_dump', 'pg_restore')):
    sys.exit('Instale pg_dump e pg_restore da mesma versão major do servidor ou superior.')
os.umask(0o077)
folder = Path(sys.argv[1] if len(sys.argv) > 1 else 'work/backups')
folder.mkdir(parents=True, exist_ok=True)
path = folder / ('supabase-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.dump')
env = dict(os.environ, PGDATABASE=os.environ['SUPABASE_DB_URL'], PGSSLMODE='verify-full')
try:
    # Snapshot consistente inclui public, auth e metadados do Storage.
    with path.open('xb') as target:
        subprocess.run(['pg_dump', '--format=custom', '--no-owner', '--no-acl'], env=env,
                       stdout=target, stderr=subprocess.PIPE, check=True)
    toc = subprocess.run(['pg_restore', '--list', str(path)], capture_output=True, check=True)
    for table in (b'events', b'registrations', b'payments', b'users'):
        if table not in toc.stdout:
            raise RuntimeError('Backup sem tabela obrigatória')
    manifest = {'file': path.name, 'bytes': path.stat().st_size,
                'sha256': hashlib.file_digest(path.open('rb'), 'sha256').hexdigest(),
                'archive_readable': True, 'restore_verified': False,
                'scope': 'PostgreSQL; não inclui arquivos binários de Storage nem configuração externa de Auth'}
    path.with_suffix('.manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Backup privado criado e catálogo validado. Falta testar restauração isolada:', path)
except Exception:
    # Mensagens do cliente podem conter URI/senha; não imprimi-las.
    sys.exit('Backup incompleto ou falhou. Não aplicar migrações. Confira conexão/TLS e permissões privadamente.')
