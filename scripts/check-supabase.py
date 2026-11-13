"""Checks reais e sem escrita usando somente a chave pública."""
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

config = (Path(__file__).resolve().parents[1] / 'src/config.js').read_text()
base = re.search(r"SUPABASE_URL = '([^']+)'", config)[1]
key = re.search(r"SUPABASE_KEY = '([^']+)'", config)[1]

def request(path, method='GET', body=None):
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    req = urllib.request.Request(base + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

status, settings = request('/auth/v1/settings')
assert status == 200
assert settings['external']['email'] and not settings['disable_signup']
print('PASS: autenticação por e-mail e cadastro habilitados')
print('Confirmação por e-mail:', not settings['mailer_autoconfirm'])

for table in ['profiles', 'teams', 'team_members', 'events', 'registrations', 'payments']:
    status, data = request('/rest/v1/' + table + '?select=*&limit=0')
    expected = 200 if table == 'events' else 401
    assert status == expected, (table, status, data)
    if table != 'events':
        assert data['code'] == '42501', (table, data)
    print(f'PASS: {table} existe; SELECT anônimo HTTP {status}')

# Valores inválidos impedem gravação mesmo se os privilégios estiverem incorretos.
# A resposta esperada é falta de privilégio, antes da checagem de NOT NULL.
for table in ['profiles', 'teams', 'team_members', 'events', 'registrations', 'payments']:
    status, data = request('/rest/v1/' + table, 'POST', {})
    assert status == 401 and data['code'] == '42501', (table, status, data)
    print(f'PASS: INSERT anônimo bloqueado em {table}')

status, data = request('/rest/v1/events?select=id,status&status=neq.published&limit=1')
assert status == 200 and data == [], (status, data)
print('PASS: consulta anônima não retorna rascunhos ou eventos cancelados')
print('Para validar isolamento autenticado, execute npm run test:isolation (duas contas confirmadas).')
