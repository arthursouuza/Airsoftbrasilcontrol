"""Homologação remota APÓS aplicar 202611130002_capacity_cancellations.sql.
Usa exclusivamente duas contas confirmadas e eventos NOVOS marcados TESTE.
Não gera senhas, não altera inscrições existentes e não envia e-mails.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import re
import threading
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
    request = urllib.request.Request(base + path, headers=headers, method=method,
                                     data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

# Interrompe ANTES de qualquer escrita se o banco ainda não recebeu a migração.
status, data = call('/rest/v1/events?select=capacity,active_registration_count&limit=0')
if status != 200:
    raise SystemExit('PENDENTE: aplique a migração de capacidade antes da homologação remota. Nenhum dado alterado.')

def login(filename):
    credentials = json.loads(Path(filename).read_text())
    status, data = call('/auth/v1/token?grant_type=password', 'POST',
                        {name: credentials[name] for name in ['email', 'password']})
    if status != 200:
        raise SystemExit('Conta de teste indisponível. Não envie senhas no chat; configure credenciais somente no ambiente privado.')
    assert data['user'].get('email_confirmed_at')
    return {'id': data['user']['id'], 'token': data['access_token']}

a = login(os.environ.get('ABC_TEST_AUTH_FILE', '/tmp/abc-auth-test.json'))
b = login(os.environ.get('ABC_SECOND_AUTH_FILE', '/tmp/abc-auth-test-second.json'))
assert a['id'] != b['id']
events, registration_ids = [], set()

def api(user, table, query='', method='GET', body=None):
    return call('/rest/v1/' + table + query, method, body, user['token'])

def insert(user, table, body):
    status, data = api(user, table, method='POST', body=body)
    assert status == 201, (table, status, data.get('code') if isinstance(data, dict) else '')
    return data[0]

def event(capacity):
    now = datetime.now(timezone.utc)
    result = insert(a, 'events', {'organizer_id': a['id'], 'title': 'TESTE VAGAS ' + now.isoformat(),
                                 'location': 'Teste técnico — não comparecer', 'status': 'published',
                                 'starts_at': (now + timedelta(days=90)).isoformat(),
                                 'ends_at': (now + timedelta(days=90, hours=3)).isoformat(), 'capacity': capacity})
    events.append(result['id'])
    return result['id']

def registration(user, event_id):
    result = api(user, 'registrations', method='POST', body={'event_id': event_id, 'player_id': user['id']})
    if result[0] == 201:
        registration_ids.add(result[1][0]['id'])
    return result

def concurrent(*functions):
    barrier = threading.Barrier(len(functions))
    def run(function):
        barrier.wait(timeout=10)
        return function()
    with ThreadPoolExecutor(max_workers=len(functions)) as pool:
        return list(pool.map(run, functions))

def count(event_id):
    status, data = api(a, 'events', '?id=eq.' + event_id)
    assert status == 200
    return data[0]['active_registration_count'], data[0]['capacity']

def cancel(user, registration_id):
    return api(user, 'registrations', '?id=eq.' + registration_id + '&status=eq.active',
               'PATCH', {'status': 'cancelled'})

try:
    e = event(1)
    results = concurrent(lambda: registration(a, e), lambda: registration(b, e))
    assert sorted(status for status, _ in results) == [201, 400], results
    assert [body.get('code') for status, body in results if status == 400] == ['P0001']
    assert count(e) == (1, 1)
    winner = a if results[0][0] == 201 else b
    row = next(body[0] for status, body in results if status == 201)
    print('PASS disputa remota da última vaga: apenas uma inscrição ativa')
    repeated = concurrent(lambda: cancel(winner, row['id']), lambda: cancel(winner, row['id']))
    assert all(status == 200 for status, _ in repeated)
    assert sorted(len(body) for _, body in repeated) == [0, 1]
    assert count(e) == (0, 1)
    cancel(winner, row['id'])
    assert count(e) == (0, 1)
    new = registration(winner, e)
    assert new[0] == 201 and new[1][0]['id'] != row['id']
    assert count(e) == (1, 1)
    print('PASS cancelamento repetido/simultâneo libera uma vaga; reinscrição cria novo histórico')

    duplicate = event(2)
    results = concurrent(lambda: registration(b, duplicate), lambda: registration(b, duplicate))
    assert sorted(status for status, _ in results) == [201, 409]
    assert count(duplicate) == (1, 2)
    print('PASS duplicidade ativa concorrente bloqueada')

    resize = event(2)
    first = registration(a, resize)
    assert first[0] == 201
    results = concurrent(lambda: registration(b, resize),
                         lambda: api(a, 'events', '?id=eq.' + resize, 'PATCH', {'capacity': 1}))
    active, capacity = count(resize)
    assert active <= capacity
    assert (results[0][0] == 201 and results[1][0] == 400) or (results[0][0] == 400 and results[1][0] == 200), results
    status, body = api(a, 'events', '?id=eq.' + resize, 'PATCH', {'capacity': active - 1})
    assert status == 400 and body['code'] == '23514'
    status, body = api(b, 'events', '?id=eq.' + resize, 'PATCH', {'capacity': 100})
    assert status == 200 and body == []
    status, body = api(b, 'registrations', '?id=eq.' + first[1][0]['id'], 'PATCH', {'status': 'cancelled'})
    assert status == 200 and body == []
    status, body = api(a, 'events', '?id=eq.' + resize, 'PATCH', {'active_registration_count': 0})
    assert status == 403 and body['code'] == '42501'
    print('PASS redução de capacidade, permissões e contador protegido no banco remoto')
finally:
    # Só IDs retornados por INSERTs deste teste. Nunca cancela registros desconhecidos.
    failures = []
    for registration_id in registration_ids:
        status, _ = cancel(a, registration_id)  # A organiza todos os eventos criados aqui.
        if status != 200:
            failures.append(registration_id)
    for event_id in events:
        status, _ = api(a, 'events', '?id=eq.' + event_id, 'PATCH', {'status': 'cancelled'})
        if status != 200:
            failures.append(event_id)
    report = Path('/tmp/abc-capacity-remote-fixtures.json')
    report.write_text(json.dumps({'events': events, 'registrations': list(registration_ids), 'cleanup_failures': failures}))
    report.chmod(0o600)
    assert not failures, 'Limpeza incompleta; consultar relatório privado de fixtures'
    print('Eventos e inscrições criados neste teste foram cancelados. Inscrições anteriores não foram alteradas.')
