"""Teste exclusivo no container abc-admin-db; nunca acessa produção."""
import subprocess
import json
import os
import shlex
import tempfile
import uuid
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
NAME = 'admin_' + uuid.uuid4().hex
DOCKER = ['docker','--host=unix:///var/run/docker.sock','exec','-i','abc-admin-db']
ADMIN = '76788b2d-a0a7-4423-8ef3-63f0b1975a7d'
PLAYER = '00000000-0000-4000-8000-000000000002'
def sql(query, user=None, error=None):
    if user:
        query = f"set role authenticated; set request.jwt.claim.sub='{user}';\n" + query
    result = subprocess.run(DOCKER+['psql','-U','postgres','-d',NAME,'-XqAt','-v','ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
    if error:
        assert result.returncode and error in result.stderr, result.stderr
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()
def event(title='TESTE LOCAL', status='published', past=False):
    days = '-30' if past else '30'
    return sql(f"insert into events(organizer_id,title,location,starts_at,ends_at,status) values ('{PLAYER}','{title}','Local',now()+interval '{days} days',now()+interval '{days} days 1 hour','{status}') returning id;",PLAYER)
subprocess.run(DOCKER+['createdb','-U','postgres',NAME],check=True)
try:
    sql("""do $$begin create role anon; exception when duplicate_object then null; end$$;
    do $$begin create role authenticated; exception when duplicate_object then null; end$$;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon, authenticated;""")
    sql(f"insert into auth.users values ('{ADMIN}','arthur.pg040@gmail.com'),('{PLAYER}','test@example.test');")
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if '005' in path.name:
            protected = event('Operação Carandiru')
        sql(path.read_text())
    assert sql('select is_site_admin();',ADMIN) == 't'
    assert sql('select is_site_admin();',PLAYER) == 'f'
    e = event()
    baseline = sql('select count(*) from events;')
    sql(f"select admin_archive_event('{e}');",PLAYER,'Acesso administrativo negado')
    sql(f"update events set status='archived' where id='{e}';",PLAYER,'Use as funcoes')
    event_insert = f"insert into events(organizer_id,title,location,starts_at,ends_at,status) values ('{PLAYER}','Teste','Local',now(),now()+interval '1 hour','archived');"
    sql(event_insert,PLAYER,'Use as funcoes')
    sql(event_insert,error='events_archived_from_status_check')
    sql(f"select admin_archive_event('{e}');",ADMIN)
    assert sql(f"select status||'/'||archived_from_status from events where id='{e}';") == 'archived/published'
    assert sql(f"select count(*) from events where id='{e}';",PLAYER)=='1'
    sql(f"select admin_restore_event('{e}');",ADMIN)
    assert sql(f"select status from events where id='{e}';")=='published'
    old=event(past=True)
    sql(f"select admin_archive_event('{old}'); select admin_restore_event('{old}');",ADMIN)
    assert sql(f"select status from events where id='{old}';")=='draft'
    r=sql(f"insert into registrations(event_id,player_id) values ('{e}','{ADMIN}') returning id;",ADMIN)
    sql(f"insert into payments(registration_id,amount_cents,method,status) values ('{r}',100,'manual_pix','pending');",PLAYER)
    before=sql("select row_to_json(p)::text from payments p;")
    sql(f"select admin_archive_event('{e}');",ADMIN)
    sql(f"select admin_delete_event('{e}','TESTE LOCAL');",ADMIN,'existem inscricoes')
    sql(f"update registrations set status='cancelled' where id='{r}';",ADMIN)
    sql(f"select admin_delete_event('{e}','TESTE LOCAL');",ADMIN,'existem inscricoes')
    sql(f"select admin_restore_event('{e}');",ADMIN)
    assert before==sql('select row_to_json(p)::text from payments p;')
    sql(f"select admin_archive_event('{protected}');",ADMIN,'deve permanecer publicada')
    sql(f"select admin_delete_event('{protected}','Operação Carandiru');",ADMIN,'Carandiru protegida')
    sql(f"update events set title='Renomeado' where id='{protected}';")
    sql(f"select admin_delete_event('{protected}','Renomeado');",ADMIN,'Carandiru protegida')
    empty=event('Descartável')
    sql(f"select admin_delete_event('{empty}','Descartável');",ADMIN,'Arquive o evento')
    sql(f"select admin_archive_event('{empty}');",ADMIN)
    sql(f"select admin_delete_event('{empty}',null);",ADMIN,'Confirmacao incorreta')
    sql(f"select admin_delete_event('{empty}','Errado');",ADMIN,'Confirmacao incorreta')
    sql(f"select admin_delete_event('{empty}','Descartável');",ADMIN)
    assert sql(f"select count(*) from events where id='{empty}';")=='0'
    assert sql("select count(*) from admin_event_audit where action='delete';",ADMIN)=='1'
    assert sql('select count(*) from admin_event_audit;',PLAYER)=='0'
    sql('select * from site_admins;',PLAYER,'permission denied')
    sql(f"update events set status='cancelled' where id='{e}';",ADMIN)
    assert sql(f"select status from events where id='{e}';")=='published' # RLS: admin não vira organizador.
    def save(resource,data,row=None,error=None):
        rid = "null" if row is None else "'"+row['id']+"'"
        expected = 'null' if row is None else "'"+json.dumps(row).replace("'","''")+"'::jsonb"
        payload = "'"+json.dumps(data).replace("'","''")+"'::jsonb"
        return sql(f"select admin_save('{resource}',{payload},{rid},{expected});",ADMIN,error)
    def row(table,rid): return json.loads(sql(f"select to_jsonb(t) from {table} t where id='{rid}';"))
    # Todas as categorias, mutações auditadas e conflitos transacionais.
    fresh=save('events',{'title':'Admin criou','location':'Campo','starts_at':'2030-12-01T09:00:00Z','ends_at':'2030-12-01T12:00:00Z','status':'published','capacity':3})
    original=row('events',fresh)
    save('events',{'title':'Admin editou'},original)
    save('events',{'title':'Conflito'},original,'Registro mudou')
    assert row('events',fresh)['title']=='Admin editou'
    save('events',{'organizer_id':PLAYER},row('events',fresh),'campo nao permitido')
    sql(f"select admin_save('events','{{}}');",PLAYER,'Acesso administrativo negado')
    sql(f"select admin_save('site_admins','{{}}');",ADMIN,'Informe os campos')
    sql(f"select admin_save('events','{{}}');",error='Acesso administrativo negado')
    sql(f"insert into profiles(id,display_name) values ('{PLAYER}','Jogador'),('{ADMIN}','Arthur');")
    save('profiles',{'display_name':'Jogador editado'},row('profiles',PLAYER))
    assert row('profiles',PLAYER)['display_name']=='Jogador editado'
    team=save('teams',{'name':'Equipe teste'})
    save('teams',{'description':'Equipe editada'},row('teams',team))
    group=save('event_combat_groups',{'event_id':fresh,'name':'Alpha','capacity':2})
    reg=save('registrations',{'event_id':fresh,'player_id':PLAYER,'combat_group_id':group})
    assert row('events',fresh)['active_registration_count']==1
    save('event_combat_groups',{'capacity':0},row('event_combat_groups',group),'violates check constraint')
    payment=save('payments',{'registration_id':reg,'amount_cents':2500,'method':'manual_pix'})
    save('payments',{'status':'paid'},row('payments',payment))
    assert row('payments',payment)['status']=='paid'
    save('payments',{'registration_id':r},row('payments',payment),'imutavel')
    save('registrations',{'status':'cancelled'},row('registrations',reg))
    assert row('event_combat_groups',group)['active_registration_count']==0
    assert row('payments',payment)['status']=='paid'
    content=json.loads(sql("select to_jsonb(t) from site_content t where key='footer_tagline';"))
    save('site_content',{'value':'Texto alterado'},content)
    sql(f"select admin_set_team_member('{team}','{PLAYER}',true);",ADMIN)
    member=sql(f"select to_jsonb(m) from team_members m where team_id='{team}' and user_id='{PLAYER}';")
    sql(f"select admin_set_team_member('{team}','{PLAYER}',false,'{member}'::jsonb);",ADMIN)
    assert sql(f"select active from team_members where team_id='{team}';")=='f'
    assert sql(f"select count(*) from team_members where team_id='{team}';")=='1'
    assert int(sql('select count(*) from admin_audit;',ADMIN))>=12
    assert sql('select count(*) from admin_audit;',PLAYER)=='0'
    # Carandiru não pode ser despublicada por UPDATE comum nem por RPC.
    sql(f"update events set status='cancelled' where id='{protected}';",PLAYER,'deve permanecer publicada')
    save('events',{'status':'draft'},row('events',protected),'deve permanecer publicada')
    sql(f"update auth.users set email='changed@example.test' where id='{ADMIN}';")
    assert sql('select is_site_admin();',ADMIN)=='f'
    sql(f"update auth.users set email='arthur.pg040@gmail.com' where id='{ADMIN}';")
    batch=event('Lote local')
    sql(f"select admin_archive_events(array['{batch}'::uuid,'{protected}'::uuid]);",ADMIN,'deve permanecer publicada')
    assert row('events',batch)['status']=='published'
    sql(f"select admin_archive_events(array['{batch}'::uuid]);",PLAYER,'Acesso administrativo negado')
    sql(f"select admin_archive_events(array['{batch}'::uuid]);",ADMIN)
    assert row('events',batch)['status']=='archived'
    # Dump e restauração do fixture local, com comparação integral de conteúdo.
    with tempfile.TemporaryDirectory(dir=ROOT/'work') as temporary:
        bindir=Path(temporary)
        for tool in ['psql','pg_dump','pg_restore']:
            wrapper=bindir/tool
            args=DOCKER+[tool,'-U','postgres']
            if tool!='pg_restore': args+=['-d',NAME]
            wrapper.write_text('#!/bin/sh\n'+('if [ "$1" = "--list" ]; then exec '+shlex.join(args)+' --list < "$2"; fi\n' if tool=='pg_restore' else '')+'exec '+shlex.join(args)+' "$@"\n')
            wrapper.chmod(0o700)
        env=dict(os.environ,PATH=str(bindir)+os.pathsep+os.environ['PATH'],SUPABASE_DB_URL='postgresql://isolated-fixture/local')
        backup_dir=bindir/'backup'
        subprocess.run(['python3',str(ROOT/'scripts/backup-supabase.py'),str(backup_dir)],env=env,check=True)
        dump=next(backup_dir.glob('*.dump'))
        subprocess.run(['python3',str(ROOT/'scripts/verify-restore.py'),str(dump)],check=True)
        assert json.loads(dump.with_suffix('.manifest.json').read_text())['restore_verified'] is True
    print('PASS: 001–005, RLS, INSERT arquivado, NULL, autorização, auditoria, restauração passada, Carandiru renomeada, pagamentos preservados e exclusão apenas local.')
finally:
    subprocess.run(DOCKER+['dropdb','-U','postgres',NAME],check=True)
