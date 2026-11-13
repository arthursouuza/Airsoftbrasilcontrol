"""Restauração exclusivamente em banco temporário num container PostgreSQL local.
Uso: python3 scripts/verify-restore.py work/backups/arquivo.dump
Nunca aceita URI de destino remoto. Não altera o Supabase de produção.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

TABLES = ['events','registrations','payments','profiles','teams','team_members','event_combat_groups']
DOCKER = ['docker','--host=unix:///var/run/docker.sock','exec','-i','abc-admin-db']

def fingerprint_sql(tables=None):
    tables=tables or [['public',table] for table in TABLES]
    pieces=[]
    for schema,table in tables:
        if schema not in ('public','auth','storage') or not isinstance(table,str):
            raise ValueError('Tabela inválida')
        identifier='"'+schema.replace('"','""')+'"."'+table.replace('"','""')+'"'
        label=(schema+'.'+table).replace("'","''")
        pieces.append(f"select '{label}' as table_name,count(*) as rows, encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''),'UTF8')),'hex') as sha256 from {identifier} t")
    return "set timezone='UTC';select jsonb_agg(x) from ("+' union all '.join(pieces)+') x;'

def run(args, **kwargs):
    return subprocess.run(args,capture_output=True,check=True,**kwargs)

def main():
    os.umask(0o077)
    path=Path(sys.argv[1]).resolve()
    manifest_path=path.with_suffix('.manifest.json')
    manifest=json.loads(manifest_path.read_text())
    with path.open('rb') as stream: actual=hashlib.file_digest(stream,'sha256').hexdigest()
    if actual!=manifest['sha256']:sys.exit('Hash do arquivo não confere; restauração cancelada.')
    database='restore_'+uuid.uuid4().hex
    created=False
    try:
        run(DOCKER+['createdb','-U','postgres',database]);created=True
        # ACLs não são restauradas, mas políticas fazem referência a estes papéis.
        roles="""do $$declare r text;begin foreach r in array array['anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_storage_admin'] loop if not exists(select 1 from pg_roles where rolname=r) then execute format('create role %I nologin',r); end if; end loop;end$$;"""
        run(DOCKER+['psql','-U','postgres','-d',database,'-XqAt','-v','ON_ERROR_STOP=1'],input=roles.encode())
        with path.open('rb') as stream:
            run(DOCKER+['pg_restore','-U','postgres','-d',database,'--exit-on-error','--no-owner','--no-acl'],stdin=stream)
        result=run(DOCKER+['psql','-U','postgres','-d',database,'-XqAt','-v','ON_ERROR_STOP=1'],input=fingerprint_sql(manifest.get('tables')).encode())
        restored=json.loads(result.stdout)
        if not manifest.get('source_fingerprints'):
            sys.exit('Arquivo restaurado, mas falta baseline do snapshot de origem. Não marcar como validado.')
        if restored!=manifest['source_fingerprints']:
            sys.exit('Conteúdo restaurado diverge da origem. Não aplicar a migração.')
        manifest.update(restore_verified=True,restored_fingerprints=restored,
                        verification_scope='PostgreSQL local; não inclui binários do Storage/configuração externa')
        manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
        print('PASS: restauração isolada e hashes de todos os registros das tabelas do manifesto conferem.')
    except subprocess.CalledProcessError:
        sys.exit('Restauração isolada falhou. Confira privadamente compatibilidade de extensões/papéis e dump; produção intacta.')
    finally:
        if created:run(DOCKER+['dropdb','-U','postgres',database])

if __name__=='__main__':main()
