"""PostgreSQL 17 real isolado em Docker. Nunca conecta ao Supabase remoto.
Uso: python3 tests/db/combat_groups.py (container abc-groups-db já iniciado).
Cria um banco temporário com três identidades, aplica migrações 001/002/004 e verifica compatibilidade com 003 e
remove somente o banco criado por este teste ao final.
"""
import concurrent.futures
import subprocess
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATABASE = 'abc_groups_' + uuid.uuid4().hex
DOCKER = ['docker', '--host=unix:///var/run/docker.sock', 'exec', '-i', 'abc-groups-db']
A, B, C = ['00000000-0000-4000-8000-' + str(n).zfill(12) for n in (1, 2, 3)]

def command(database=DATABASE):
    return DOCKER + ['psql', '-U', 'postgres', '-d', database, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']

def identity(user):
    return f"set role authenticated; set request.jwt.claim.sub = '{user}';\n" if user else ''

def sql(statement, user=None, error=None):
    result = subprocess.run(command(), input=identity(user) + statement, text=True, capture_output=True, timeout=20)
    if error:
        assert result.returncode and error in result.stderr, result.stderr
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()

def event(capacity=1):
    cap = 'null' if capacity is None else str(capacity)
    return sql(f"insert into public.events(organizer_id,title,location,starts_at,ends_at,status,capacity) values ('{C}','TESTE LOCAL','Banco isolado',now()+interval '30 days',now()+interval '31 days','published',{cap}) returning id;", C)

def register(e):
    return f"insert into public.registrations(event_id,player_id) values ('{e}',auth.uid()) returning id;"

def count(e):
    return sql(f"select active_registration_count || '/' || coalesce(capacity::text,'null') from public.events where id='{e}';")

def overlap(first_sql, first_user, second_sql, second_user, second_error=None, rollback=False):
    first = subprocess.Popen(command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        first.stdin.write(identity(first_user) + 'begin;\n' + first_sql + '\n\\echo LOCK_HELD\n')
        first.stdin.flush()
        while True:
            line = first.stdout.readline()
            assert line, first.stderr.read()
            if line.strip() == 'LOCK_HELD':
                break
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(sql, second_sql, second_user, second_error)
            time.sleep(0.2)
            assert not future.done(), 'A segunda operação deveria estar bloqueada pela primeira'
            first.stdin.write(('rollback;' if rollback else 'commit;') + '\n\\q\n')
            first.stdin.flush()
            first.wait(timeout=10)
            assert first.returncode == 0, first.stderr.read()
            future.result(timeout=10)
    finally:
        if first.poll() is None:
            first.kill()
        first.stdin.close(); first.stdout.close(); first.stderr.close()


def group(e, name='Alpha', capacity=1, user=C, group_id=None, error=None):
    gid = f"'{group_id}'" if group_id else 'null'
    return sql(f"select public.save_combat_group('{e}','{name}',{capacity},{gid});", user, error)

def grouped(e, g, player=None):
    uid = f"'{player}'" if player else 'auth.uid()'
    return f"insert into public.registrations(event_id,player_id,combat_group_id) values ('{e}',{uid},'{g}') returning id;"

def group_count(g):
    return sql(f"select active_registration_count || '/' || capacity from public.event_combat_groups where id='{g}';")

subprocess.run(DOCKER + ['createdb', '-U', 'postgres', DATABASE], check=True, capture_output=True)
try:
    sql("""
    do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; end$$;
    do $$begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end$$;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated, anon;
    """)
    sql(f"insert into auth.users values ('{A}'),('{B}'),('{C}');")
    for migration in ['0001_initial_schema','0002_capacity_cancellations']:
        sql((ROOT / f'supabase/migrations/20261113{migration}.sql').read_text())
    legacy=event(10); legacy_reg=sql(register(legacy),A)
    sql(f"insert into public.payments(registration_id,amount_cents,method) values('{legacy_reg}',0,'manual_pix');",C)
    migration=(ROOT/'supabase/migrations/202611130004_combat_groups.sql').read_text()
    sql(migration)
    # A segunda aplicação falha dentro de BEGIN e não desfaz a primeira.
    sql(migration,error='42P07')
    assert count(legacy)=='1/10'
    assert sql(f"select count(*) from public.payments where registration_id='{legacy_reg}';")=='1'
    assert sql(f"select combat_group_id is null from public.registrations where id='{legacy_reg}';")=='t'
    group(legacy)
    sql(register(legacy),B,'P1001');assert count(legacy)=='1/10'
    sql(f"update public.registrations set status='cancelled' where id='{legacy_reg}';",A)
    assert count(legacy)=='0/10'
    print('PASS migração sem 003 preserva pagamentos/inscrições legadas; grupo obrigatório só nas novas inscrições')
    sql((ROOT/'supabase/migrations/202611130003_event_presentation.sql').read_text())
    print('PASS 003 editorial também pode ser aplicada após 004, sem conflito')

    e=event(10);g=group(e)
    overlap(grouped(e,g),A,grouped(e,g),B,'P1002')
    assert count(e)=='1/10' and group_count(g)=='1/1'
    print('PASS duas inscrições simultâneas para a última vaga do grupo: apenas uma; rollback da vaga total perdedora')
    total=event(1);ga=group(total,'Alpha',2);gb=group(total,'Bravo',2)
    overlap(grouped(total,ga),A,grouped(total,gb),B,'P0001')
    assert count(total)=='1/1' and group_count(ga)=='1/2' and group_count(gb)=='0/2'
    print('PASS grupos diferentes disputando última vaga total sem exceder evento')

    duplicate=event(10);ga=group(duplicate,'Alpha',2);gb=group(duplicate,'Bravo',2)
    overlap(grouped(duplicate,ga),A,grouped(duplicate,gb),A,'23505')
    assert count(duplicate)=='1/10' and group_count(ga)=='1/2' and group_count(gb)=='0/2'
    print('PASS duplicidade simultânea inclusive em grupos diferentes não consome vaga extra')

    reg=sql(f"select id from public.registrations where event_id='{e}';")
    cancel=f"update public.registrations set status='cancelled' where id='{reg}';"
    sql(cancel,B);assert count(e)=='1/10' and group_count(g)=='1/1'
    assert sql(f"select count(*) from public.registrations where id='{reg}';",B)=='0'
    overlap(cancel,A,cancel,C)
    timestamp=sql(f"select cancelled_at from public.registrations where id='{reg}';")
    sql(cancel,A);assert sql(f"select cancelled_at from public.registrations where id='{reg}';")==timestamp
    assert count(e)=='0/10' and group_count(g)=='0/1'
    reg_b=sql(grouped(e,g),B);assert group_count(g)=='1/1'
    sql(f"update public.registrations set status='active' where id='{reg}';",A,'23514')
    sql(f"update public.registrations set status='cancelled' where id='{reg_b}';",C)
    sql(grouped(e,g),A)
    print('PASS jogador/organizador cancelam concorrentemente uma única vez e vaga pode ser reutilizada')

    resize=event(10);g=group(resize,'Alpha',2);sql(grouped(resize,g),A)
    overlap(grouped(resize,g),B,f"select public.save_combat_group('{resize}','Alpha',1,'{g}');",C,'23514')
    assert group_count(g)=='2/2'
    resize2=event(10);g=group(resize2,'Alpha',2);sql(grouped(resize2,g),A)
    overlap(f"select public.save_combat_group('{resize2}','Alpha',1,'{g}');",C,grouped(resize2,g),B,'P1002')
    assert group_count(g)=='1/1' and count(resize2)=='1/10'
    rollback=event(10);g=group(rollback)
    overlap(grouped(rollback,g),A,grouped(rollback,g),B,rollback=True)
    assert group_count(g)=='1/1' and count(rollback)=='1/10'
    print('PASS redução concorrente do limite nas duas ordens e rollback da reserva')
    event_resize=event(2);g=group(event_resize,'Alpha',2);sql(grouped(event_resize,g),A)
    overlap(grouped(event_resize,g),B,f"update public.events set capacity=1 where id='{event_resize}';",C,'23514')
    assert group_count(g)=='2/2' and count(event_resize)=='2/2'
    cancel_race=event(10);g=group(cancel_race);r=sql(grouped(cancel_race,g),A)
    overlap(f"update public.registrations set status='cancelled' where id='{r}';",A,grouped(cancel_race,g),B)
    assert group_count(g)=='1/1' and count(cancel_race)=='1/10'
    print('PASS redução do total com inscrição em grupo e cancelamento concorrente com nova reserva')


    # RPC criação e reserva sem grupo compartilham o mesmo bloqueio do evento.
    adding=event(10)
    overlap(f"select public.save_combat_group('{adding}','Alpha',1);",C,register(adding),A,'P1001')
    assert count(adding)=='0/10'
    adding2=event(10)
    overlap(register(adding2),A,f"select public.save_combat_group('{adding2}','Alpha',1);",C)
    assert count(adding2)=='1/10'
    print('PASS primeiro grupo criado durante inscrição: ordem serial preserva legado ou exige grupo')

    other=event(10);otherg=group(other)
    sql(grouped(e,otherg),B,'23503');sql(grouped(e,g,A),B,'42501')
    group(e,'Intruso',2,user=B,error='42501')
    group(e,'Intruso',2,user=B,group_id=otherg,error='42501')
    sql(f"set role anon; select public.save_combat_group('{e}','Intruso',1);",error='42501')
    sql(f"insert into public.event_combat_groups(event_id,name,capacity) values('{e}','Intruso',1);",B,'42501')
    sql(f"update public.event_combat_groups set active_registration_count=0 where id='{otherg}';",C,'42501')
    sql(f"update public.event_combat_groups set capacity=999 where id='{otherg}';",C,'42501')
    sql(f"delete from public.event_combat_groups where id='{otherg}';",C,'42501')
    sql(f"update public.registrations set combat_group_id='{otherg}' where id='{reg}';",A,'42501')
    # Mesmo papel privilegiado não pode mudar vínculo por engano.
    sql(f"update public.registrations set combat_group_id=null where id='{reg}';",error='23514')
    sql(f"set role anon; select * from public.registrations;",error='42501')
    assert sql(f"select count(*) from public.registrations where event_id='{e}';",B)=='1' # somente sua cancelada
    assert sql(f"select count(*) from public.registrations where event_id='{e}';",C)=='3'
    print('PASS RLS mantém participantes restritos; cliente não altera contador/grupo/limite diretamente nem registra terceiros')

    draft=event(10);dg=group(draft)
    sql(f"update public.events set status='draft' where id='{draft}';",C)
    assert sql(f"set role anon; select count(*) from public.event_combat_groups where id='{dg}';")=='0'
    assert sql(f"select count(*) from public.event_combat_groups where id='{dg}';",B)=='0'
    assert sql(f"select count(*) from public.event_combat_groups where id='{dg}';",C)=='1'
    assert sql(f"set role anon; select count(*) from public.event_combat_groups where id='{otherg}';")=='1'
    group(other,'ALPHA',1,error='23505')
    group(other,'',1,error='23514')
    group(other,'Bravo',0,error='23514')
    print('PASS nomes únicos, capacidade positiva e grupos de rascunho privados')
    verification=sql((ROOT/'supabase/verificar_grupos.sql').read_text())
    assert verification=='t|t|t|0|0|0|1',verification
    print('PASS verificação final: nenhum contador inconsistente ou par ativo duplicado; legado sem grupo preservado')
    print('PASS PostgreSQL 17 real isolado; nenhuma escrita no Supabase remoto')
finally:
    subprocess.run(DOCKER+['dropdb','-U','postgres',DATABASE],check=True,capture_output=True)
