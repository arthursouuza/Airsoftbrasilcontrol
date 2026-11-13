// Teste real: requer credenciais temporárias fora do repositório.
// Cria um evento identificado como teste e o cancela ao terminar.
const { chromium, expect } = require('@playwright/test');
const fs = require('fs');
const assert = require('node:assert/strict');
const auth = JSON.parse(fs.readFileSync(process.env.ABC_TEST_AUTH_FILE || '/tmp/abc-auth-test.json','utf8'));
const config = fs.readFileSync('src/config.js','utf8');
const base = config.match(/SUPABASE_URL = '([^']+)'/)[1];
const key = config.match(/SUPABASE_KEY = '([^']+)'/)[1];
(async()=>{
 const proxy=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],proxy:proxy?{server:proxy,bypass:'127.0.0.1,localhost'}:undefined});
 const context=await browser.newContext();const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(process.env.ABC_TEST_SITE_URL?.startsWith('https://arthursouuza.github.io/')) {
  await page.route('https://arthursouuza.github.io/**',async route=>{try {await route.fulfill({response:await route.fetch()});}catch{if(!page.isClosed())await route.abort().catch(()=>{});}});
 }
 await page.route(base+'/**',async route=>{try {const response=await route.fetch();await route.fulfill({response});} catch {if(!page.isClosed()) await route.abort().catch(()=>{});}});
 async function api(path, options={}, anonymous=false){
  const response=await context.request.fetch(base+path,{...options,headers:{apikey:key,...(!anonymous?{Authorization:'Bearer '+auth.access_token}:{}),'Content-Type':'application/json',Prefer:'return=representation'}});
  const raw=await response.text();return {status:response.status(),data:raw?JSON.parse(raw):null};
 }
 let eventId;
 const title='TESTE DE INTEGRAÇÃO · '+new Date().toISOString();
 try {
  const login=await context.request.post(base+'/auth/v1/token?grant_type=password',{headers:{apikey:key},data:{email:auth.email,password:auth.password}});
  assert.equal(login.status(),200,'Login real indisponível');
  const fresh=await login.json();auth.access_token=fresh.access_token;auth.user_id=fresh.user.id;
  await page.goto(process.env.ABC_TEST_SITE_URL || 'http://127.0.0.1:8000/connected.html');
  await page.getByLabel('E-mail',{exact:true}).fill(auth.email);await page.getByLabel('Senha',{exact:true}).fill(auth.password);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.locator('#account')).toBeVisible();
  console.log('PASS login real no navegador');
  await expect(page.locator('#profile-warning')).toBeEmpty();
  await expect.poll(async()=>{const profile=await api('/rest/v1/profiles?select=id&id=eq.'+auth.user_id);return profile.status===200?profile.data.length:-1;}).toBe(1);console.log('PASS perfil criado após login');
  await page.getByText('Criar evento',{exact:true}).click();
  await page.getByLabel('Título',{exact:true}).fill(title);await page.getByLabel('Local',{exact:true}).fill('Ambiente de teste — não comparecer');
  await page.getByLabel('Descrição',{exact:true}).fill('Evento de validação técnica. Será cancelado automaticamente.');
  await page.getByLabel('Início',{exact:true}).fill('2030-12-01T09:00');await page.getByLabel('Fim',{exact:true}).fill('2030-12-01T12:00');
  await page.getByRole('button',{name:'Salvar evento',exact:true}).click();
  await expect(page.locator('#my-events h3').filter({hasText:title})).toBeVisible();
  const mine=await api('/rest/v1/events?select=id,status&title=eq.'+encodeURIComponent(title));assert.equal(mine.status,200);assert.equal(mine.data.length,1);eventId=mine.data[0].id;assert.equal(mine.data[0].status,'draft');
  const hidden=await api('/rest/v1/events?select=id&id=eq.'+eventId,{},true);assert.equal(hidden.status,200);assert.deepEqual(hidden.data,[]);console.log('PASS rascunho criado e oculto para visitantes');
  await page.locator('#my-events article').filter({hasText:title}).getByRole('button',{name:'Publicar no catálogo'}).click();
  const publicCard=page.locator('#events article').filter({hasText:title});await expect(publicCard).toBeVisible();
  const published=await api('/rest/v1/events?select=id&id=eq.'+eventId,{},true);assert.equal(published.data.length,1);console.log('PASS evento publicado no catálogo e visível sem login');
  await publicCard.getByRole('button',{name:'Inscrever-me'}).click();await expect(publicCard.getByText('Inscrição confirmada.')).toBeVisible();await expect(page.locator('#my-registrations')).toContainText(title);console.log('PASS inscrição real pela interface');
  const duplicate=await api('/rest/v1/registrations',{method:'POST',data:{event_id:eventId,player_id:auth.user_id}});assert.equal(duplicate.status,409);assert.equal(duplicate.data.code,'23505');console.log('PASS inscrição duplicada bloqueada');
  const foreign='00000000-0000-4000-8000-000000000001';
  for(const [table,body] of [
   ['profiles',{id:foreign,display_name:'TESTE NEGATIVO'}],
   ['events',{organizer_id:foreign,title:'TESTE NEGATIVO',location:'Teste',starts_at:'2030-12-01T09:00:00Z',ends_at:'2030-12-01T12:00:00Z'}],
   ['registrations',{event_id:eventId,player_id:foreign}]
  ]) {const result=await api('/rest/v1/'+table,{method:'POST',data:body});assert.equal(result.status,403);assert.equal(result.data.code,'42501');console.log('PASS RLS impede identidade alheia em '+table);}
  const transfer=await api('/rest/v1/events?id=eq.'+eventId,{method:'PATCH',data:{organizer_id:foreign}});assert.equal(transfer.status,403);assert.equal(transfer.data.code,'42501');console.log('PASS troca de organizador bloqueada');
  await page.reload();await expect(page.locator('#account')).toBeVisible();await expect(page.locator('#my-registrations')).toContainText(title);console.log('PASS sessão e inscrição persistem após recarregar');
  await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.locator('#auth')).toBeVisible();await expect(page.locator('#account')).toBeHidden();console.log('PASS logout real');
  assert.deepEqual(errors,[]);
 } finally {
  if(eventId){const result=await api('/rest/v1/events?id=eq.'+eventId,{method:'PATCH',data:{status:'cancelled'}});assert.equal(result.status,200);console.log('CLEANUP evento de teste cancelado:',eventId);}
  await page.unrouteAll({behavior: 'wait'});await browser.close();
 }
})().catch(e=>{console.error(e.name, String(e.message).split('Call log:')[0]);process.exitCode=1;});
