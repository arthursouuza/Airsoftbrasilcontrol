"""Leituras autenticadas para inventário; não altera tabelas nem executa migrações.
Usa ABC_ADMIN_EMAIL/PASSWORD ou arquivo privado apontado por ABC_TEST_AUTH_FILE.
A exportação REST é parcial sob RLS, não substitui backup PostgreSQL consistente.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request

os.umask(0o077)
root=Path(__file__).resolve().parents[1]
config=(root/'src/config.js').read_text()
base=re.search("SUPABASE_URL = '([^']+)'",config)[1]
key=re.search("SUPABASE_KEY = '([^']+)'",config)[1]
email=os.environ.get('ABC_ADMIN_EMAIL');password=os.environ.get('ABC_ADMIN_PASSWORD')
if not email or not password:
    path=os.environ.get('ABC_TEST_AUTH_FILE')
    if not path:sys.exit('Credencial administrativa de teste não configurada.')
    auth=json.loads(Path(path).read_text());email,password=auth['email'],auth['password']
if email.lower()!='arthur.pg040@gmail.com':sys.exit('Conta de teste não corresponde à conta autorizada.')
headers={'apikey':key,'Content-Type':'application/json'}
def request(path,data=None,extra=None):
    req=urllib.request.Request(base+path,headers=dict(headers,**(extra or {})),data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(req,timeout=30) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as error:
        try:body=json.load(error)
        except Exception:body={}
        return error.code,{'code':body.get('code') or body.get('error_code')}
try:
    status,session=request('/auth/v1/token?grant_type=password',{'email':email,'password':password})
    if status!=200:sys.exit('Login real não disponível. HTTP '+str(status))
    if session['user']['id']!='76788b2d-a0a7-4423-8ef3-63f0b1975a7d':sys.exit('UID diverge da conta autorizada.')
    headers['Authorization']='Bearer '+session['access_token']
    # Sem dados pessoais no terminal, sem tokens em disco.
    print('PASS login real: UID e e-mail correspondem à conta administrativa autorizada.')
    status,permission=request('/rest/v1/rpc/is_site_admin',{})
    print('RPC administrativa atual:',status,permission if isinstance(permission,bool) else permission.get('code'))
    exports={}; inventory=[]
    for table in ['events','registrations','payments','profiles','teams','team_members','event_combat_groups']:
        rows=[]
        for start in range(0,1000000,100):
            order='team_id.asc,user_id.asc' if table=='team_members' else 'id.asc'
            status,batch=request('/rest/v1/'+table+'?select=*&order='+order,extra={'Range':f'{start}-{start+99}'})
            if status not in (200,206):raise RuntimeError('Leitura incompleta')
            rows+=batch
            if len(batch)<100:break
        exports[table]=rows
    carandiru=[e for e in exports['events'] if e['id']=='b581d679-53ba-4479-8e92-9b44b7ab49b6']
    if len(carandiru)!=1 or carandiru[0]['status']!='published':raise RuntimeError('Carandiru não está publicada')
    for event in exports['events']:
        registrations=[r for r in exports['registrations'] if r['event_id']==event['id']]
        rids={r['id'] for r in registrations}
        inventory.append({'id':event['id'],'title':event['title'],'status':event['status'],
          'owned_by_admin':event['organizer_id']==session['user']['id'],
          'visible_registrations':len(registrations),'visible_payments':sum(p['registration_id'] in rids for p in exports['payments'])})
    folder=root/'work/private';folder.mkdir(parents=True,exist_ok=True)
    raw=json.dumps(exports,ensure_ascii=False,sort_keys=True).encode();(folder/'rls-export.json').write_bytes(raw)
    (folder/'inventory.json').write_text(json.dumps({'scope':'REST sob RLS, não é backup completo nem snapshot consistente',
      'sha256':hashlib.sha256(raw).hexdigest(),'events':inventory},indent=2,ensure_ascii=False))
    print('Inventário privado salvo. Eventos visíveis:',len(inventory))
    print('Registros visíveis por tabela:',{table:len(rows) for table,rows in exports.items()})
    print('PASS Carandiru publicada. Exportação RLS parcial; backup PostgreSQL ainda necessário.')
except Exception:
    sys.exit('Pré-validação falhou. Detalhes sensíveis omitidos; não executar migração.')
