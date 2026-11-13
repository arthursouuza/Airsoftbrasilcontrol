"""Teste exclusivo no container abc-admin-db; nunca acessa produção."""
import subprocess
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
    sql(f"select admin_archive_event('{protected}');",ADMIN)
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
    print('PASS: 001–005, RLS, INSERT arquivado, NULL, autorização, auditoria, restauração passada, Carandiru renomeada, pagamentos preservados e exclusão apenas local.')
finally:
    subprocess.run(DOCKER+['dropdb','-U','postgres',NAME],check=True)
