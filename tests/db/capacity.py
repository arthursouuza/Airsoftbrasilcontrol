"""PostgreSQL 17 real isolado em Docker. Nunca conecta ao Supabase remoto.
Uso: python3 tests/db/capacity.py (container abc-capacity-db já iniciado).
Cria um banco temporário com três identidades, aplica ambas as migrações e
remove somente o banco criado por este teste ao final.
"""
import concurrent.futures
import subprocess
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATABASE = 'abc_capacity_' + uuid.uuid4().hex
DOCKER = ['docker', '--host=unix:///var/run/docker.sock', 'exec', '-i', 'abc-capacity-db']
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

subprocess.run(DOCKER + ['createdb', '-U', 'postgres', DATABASE], check=True, capture_output=True)
try:
    sql("""
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated, anon;
    """.replace('create role anon;', "do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; end$$;").replace('create role authenticated;', "do $$begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end$$;"))
    sql(f"insert into auth.users values ('{A}'),('{B}'),('{C}');")
    sql((ROOT / 'supabase/migrations/202611130001_initial_schema.sql').read_text())
    legacy = sql(f"insert into public.events(organizer_id,title,location,starts_at,ends_at,status) values('{C}','LEGADO','Isolado',now()+interval '1 day',now()+interval '2 days','published') returning id;", C)
    legacy_reg = sql(register(legacy), A)
    sql(f"insert into public.payments(registration_id,amount_cents,method) values('{legacy_reg}',0,'manual_pix');", C)
    sql((ROOT / 'supabase/migrations/202611130002_capacity_cancellations.sql').read_text())
    verify_presentation = (ROOT / 'supabase/verificar_apresentacao.sql').read_text()
    assert sql(verify_presentation) == '0|0|t|f|3'
    sql((ROOT / 'supabase/migrations/202611130003_event_presentation.sql').read_text())
    assert sql(verify_presentation) == '5|5|t|t|3'
    sql(f"update public.events set poster_url='https://example.test/poster.jpg', groups='Grupo de teste' where id='{legacy}';", C)
    sql(f"update public.events set groups='ALTERACAO ALHEIA' where id='{legacy}';", B)
    assert sql(f"select groups from public.events where id='{legacy}';") == 'Grupo de teste'
    sql(f"update public.events set poster_url='javascript:alert(1)' where id='{legacy}';", C, '23514')
    print('PASS apresentação opcional: HTTPS e edição restrita ao organizador, sem alterar RLS')
    assert count(legacy) == '1/null'
    assert sql(f"select count(*) from public.payments where registration_id='{legacy_reg}';") == '1'
    print('PASS migração preserva registros e pagamentos legados e calcula ocupação')

    e = event(1)
    overlap(register(e), A, register(e), B, 'P0001')
    assert count(e) == '1/1'
    print('PASS duas inscrições concorrentes na última vaga: somente uma reserva')

    duplicate = event(2)
    overlap(register(duplicate), A, register(duplicate), A, '23505')
    assert count(duplicate) == '1/2'
    print('PASS duplicidade concorrente bloqueada sem consumir vaga')

    reg = sql(f"select id from public.registrations where event_id='{e}';")
    sql(f"update public.registrations set status='cancelled' where id='{reg}';", B)
    assert count(e) == '1/1'
    assert sql(f"select count(*) from public.registrations where id='{reg}';", B) == '0'
    cancel = f"update public.registrations set status='cancelled' where id='{reg}';"
    overlap(cancel, A, cancel, A)
    assert count(e) == '0/1'
    timestamp = sql(f"select cancelled_at from public.registrations where id='{reg}';")
    sql(cancel, A)
    assert sql(f"select cancelled_at from public.registrations where id='{reg}';") == timestamp
    new_reg = sql(register(e), B)
    assert count(e) == '1/1'
    sql(f"update public.registrations set status='active' where id='{reg}';", A, '23514')
    sql(f"update public.registrations set status='cancelled' where id='{new_reg}';", C)
    assert count(e) == '0/1'
    sql(register(e), A)
    assert count(e) == '1/1'
    print('PASS cancelamento simultâneo/repetido libera uma vez; jogador pode se reinscrever; organizador pode cancelar')

    resize = event(2)
    sql(register(resize), A)
    overlap(register(resize), B, f"update public.events set capacity=1 where id='{resize}';", C, '23514')
    assert count(resize) == '2/2'
    other_order = event(2)
    sql(register(other_order), A)
    overlap(f"update public.events set capacity=1 where id='{other_order}';", C, register(other_order), B, 'P0001')
    assert count(other_order) == '1/1'
    print('PASS redução de capacidade e inscrição concorrentes nas duas ordens preservam lotação')

    rollback_event = event(1)
    overlap(register(rollback_event), A, register(rollback_event), B, rollback=True)
    assert count(rollback_event) == '1/1'
    print('PASS rollback devolve reserva antes da segunda transação')

    sql(f"update public.events set active_registration_count=0 where id='{e}';", C, '42501')
    sql(f"delete from public.registrations where event_id='{e}';", A, '42501')
    sql(f"update public.events set capacity=10 where id='{e}';", B)
    assert count(e) == '1/1'
    sql(f"insert into public.registrations(event_id,player_id,status) values('{e}','{A}','cancelled');", A, '42501')
    sql(f"update public.registrations set player_id='{B}' where id='{reg}';", A, '42501')
    assert sql('select count(*) from public.registrations;', B) != sql('select count(*) from public.registrations;')
    print('PASS cliente não altera contador, identidade, capacidade alheia ou exclui inscrições')
    print('PASS todos os cenários em PostgreSQL real isolado; nenhuma inscrição remota afetada')
finally:
    subprocess.run(DOCKER + ['dropdb', '-U', 'postgres', DATABASE], check=True, capture_output=True)
