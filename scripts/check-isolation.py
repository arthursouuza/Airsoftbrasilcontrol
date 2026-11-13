"""Testes reais de RLS com duas contas confirmadas. Mantém eventos de teste cancelados.
Credenciais somente em arquivos privados fora do repositório. Não imprime tokens.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

config = Path('src/config.js').read_text()
base = re.search(r"SUPABASE_URL = '([^']+)'", config)[1]
key = re.search(r"SUPABASE_KEY = '([^']+)'", config)[1]

def call(path, method='GET', data=None, token=None):
    headers = {'apikey': key, 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base + path, method=method, headers=headers,
                                 data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)

def login(filename, label):
    credentials = json.loads(Path(filename).read_text())
    status, result = call('/auth/v1/token?grant_type=password', 'POST',
                          {k: credentials[k] for k in ['email', 'password']})
    if status != 200:
        print(label, 'login pendente ou indisponível:', status, result.get('error_code', 'erro'))
        sys.exit(2)
    assert result['user'].get('email_confirmed_at'), label + ': e-mail não confirmado'
    print('PASS login confirmado da conta', label)
    return {'id': result['user']['id'], 'token': result['access_token']}

a = login(os.environ.get('ABC_TEST_AUTH_FILE', '/tmp/abc-auth-test.json'), 'A')
b = login(os.environ.get('ABC_SECOND_AUTH_FILE', '/tmp/abc-auth-test-second.json'), 'B')
assert a['id'] != b['id'], 'São necessárias duas identidades diferentes'

def api(user, table, query='', method='GET', data=None):
    return call('/rest/v1/' + table + query, method, data, user['token'])

def ok(status, data, expected=200):
    assert status == expected, (status, data.get('code') if isinstance(data, dict) else 'resposta inesperada')
    return data

def rows(user, table, query=''):
    return ok(*api(user, table, query))

def insert(user, table, body):
    return ok(*api(user, table, method='POST', data=body), expected=201)[0]

def denied(user, table, body, query='', method='POST'):
    status, data = api(user, table, query, method, body)
    assert status == 403 and data.get('code') == '42501', (table, status)

def unchanged(user, table, row_id, body):
    data = ok(*api(user, table, '?id=eq.' + row_id, 'PATCH', body))
    assert data == [], table + ': usuário alterou registro alheio'

fixture = {'events': [], 'registrations': [], 'payments': [], 'teams': []}
fixture_path = Path('/tmp/abc-isolation-fixtures.json')
def record(table, row):
    fixture[table].append(row['id'])
    fixture_path.write_text(json.dumps(fixture)); fixture_path.chmod(0o600)
    return row

try:
    for me, other in [(a, b), (b, a)]:
        own = rows(me, 'profiles', '?id=eq.' + me['id'])
        if not own:
            insert(me, 'profiles', {'id': me['id'], 'display_name': 'Conta de teste'})
        assert rows(me, 'profiles', '?id=eq.' + other['id']) == []
        unchanged(me, 'profiles', other['id'], {'display_name': 'TESTE NEGATIVO'})
        denied(me, 'profiles', {'id': other['id'], 'display_name': 'TESTE NEGATIVO'})
    print('PASS perfis isolados nas duas direções')

    now = datetime.now(timezone.utc)
    event_body = {'title': 'TESTE ISOLAMENTO ' + now.isoformat(),
                  'location': 'Teste técnico — não comparecer',
                  'starts_at': (now + timedelta(days=30)).isoformat(),
                  'ends_at': (now + timedelta(days=30, hours=3)).isoformat(), 'status': 'draft'}
    event_a = record('events', insert(a, 'events', {**event_body, 'organizer_id': a['id']}))
    event_b = record('events', insert(b, 'events', {**event_body, 'organizer_id': b['id']}))
    for owner, other, event in [(a, b, event_a), (b, a, event_b)]:
        query = '?id=eq.' + event['id']
        assert rows(other, 'events', query) == []
        unchanged(other, 'events', event['id'], {'title': 'TESTE NEGATIVO'})
        denied(other, 'events', {**event_body, 'organizer_id': owner['id']})
        ok(*api(owner, 'events', query, 'PATCH', {'status': 'published'}))
        assert len(rows(other, 'events', query)) == 1
        unchanged(other, 'events', event['id'], {'status': 'cancelled'})
        assert rows(owner, 'events', query)[0]['status'] == 'published'
    print('PASS eventos: rascunho privado, leitura pública e edição só pelo dono')

    reg_a = record('registrations', insert(a, 'registrations', {'event_id': event_a['id'], 'player_id': a['id']}))
    reg_b = record('registrations', insert(b, 'registrations', {'event_id': event_a['id'], 'player_id': b['id']}))
    reg_other = record('registrations', insert(a, 'registrations', {'event_id': event_b['id'], 'player_id': a['id']}))
    assert rows(b, 'registrations', '?id=eq.' + reg_a['id']) == []
    assert len(rows(a, 'registrations', '?id=eq.' + reg_b['id'])) == 1
    assert len(rows(b, 'registrations', '?id=eq.' + reg_other['id'])) == 1
    denied(b, 'registrations', {'event_id': event_a['id'], 'player_id': a['id']})
    status, data = api(b, 'registrations', method='POST', data={'event_id': event_a['id'], 'player_id': b['id']})
    assert status == 409 and data['code'] == '23505'
    print('PASS inscrições: jogador vê a própria, organizador vê participantes; duplicidade e identidade alheia bloqueadas')

    pay_a = record('payments', insert(a, 'payments', {'registration_id': reg_a['id'], 'amount_cents': 0, 'method': 'manual_pix'}))
    pay_b = record('payments', insert(a, 'payments', {'registration_id': reg_b['id'], 'amount_cents': 0, 'method': 'manual_pix'}))
    assert rows(b, 'payments', '?id=eq.' + pay_a['id']) == []
    assert len(rows(b, 'payments', '?id=eq.' + pay_b['id'])) == 1
    unchanged(b, 'payments', pay_a['id'], {'status': 'paid'})
    unchanged(b, 'payments', pay_b['id'], {'status': 'paid'})
    denied(a, 'payments', {'registration_id': reg_other['id'], 'amount_cents': 0, 'method': 'manual_pix'})
    assert rows(a, 'payments', '?id=eq.' + pay_b['id'])[0]['status'] == 'pending'
    print('PASS pagamentos: jogador lê somente os próprios e não confirma pagamento; apenas organizador grava')

    team = record('teams', insert(a, 'teams', {'owner_id': a['id'], 'name': 'TESTE ISOLAMENTO — sem uso'}))
    unchanged(b, 'teams', team['id'], {'name': 'TESTE NEGATIVO'})
    denied(b, 'team_members', {'team_id': team['id'], 'user_id': b['id']})
    insert(a, 'team_members', {'team_id': team['id'], 'user_id': a['id']})
    insert(a, 'team_members', {'team_id': team['id'], 'user_id': b['id']})
    assert len(rows(a, 'team_members', '?team_id=eq.' + team['id'])) == 2
    visible = rows(b, 'team_members', '?team_id=eq.' + team['id'])
    assert len(visible) == 1 and visible[0]['user_id'] == b['id']
    ok(*api(a, 'team_members', '?team_id=eq.' + team['id'], 'DELETE'))
    print('PASS equipes: somente dono administra; membro não lê vínculos alheios')
    print('PASS isolamento real concluído nas seis tabelas')
finally:
    for owner, ids in [(a, fixture['events'][:1]), (b, fixture['events'][1:])]:
        for event_id in ids:
            status, data = api(owner, 'events', '?id=eq.' + event_id, 'PATCH', {'status': 'cancelled'})
            assert status == 200, 'Falha ao cancelar evento de teste'
    print('Eventos de teste cancelados. Inscrições/pagamentos e equipe de teste mantidos para auditoria.')
