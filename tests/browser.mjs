// UI tests with mocked HTTP endpoints. These DO NOT validate a connected Supabase project.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),headless:true,args:['--no-sandbox']});
const base = process.env.TEST_SITE_URL || 'http://127.0.0.1:4173/';
const url = path => new URL(path,base).href;
const page = await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(url('connected.html'));
  await page.waitForFunction(()=>document.querySelector('#connection-info').textContent.includes('Configure a URL'));
  assert.equal(await page.locator('#login-form [name=email]').isDisabled(),true);
  assert.equal(await page.locator('.event-card').count(),0);
  // A previous local demonstration is never used as a remote seed.
  await page.evaluate(()=>localStorage.setItem('abc-demo-v1',JSON.stringify({players:[{name:'NÃO IMPORTAR'}],events:[{title:'NÃO IMPORTAR'}]})));
  const user={id:'11111111-1111-4111-8111-111111111111',email:'jogador@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
  const event={id:'22222222-2222-4222-8222-222222222222',organizer_id:user.id,title:'Evento remoto de teste',location:'Campo remoto',description:'Somente mock HTTP',mode:'Milsim',starts_at:'2030-01-01T10:00:00Z',capacity:1,occupied:0,closed:false};
  let profile=null, registrations=[], full=false, signupCalls=0, inserts=0;
  const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})}.mock`;
  await page.route('**/supabase-config.json',route=>route.fulfill({json:{url:'https://abc-test.supabase.co',publishableKey:'sb_publishable_test_only'}}));
  await page.route('https://abc-test.supabase.co/**',async route=>{
    const request=route.request(), u=new URL(request.url()), method=request.method();
    const body=request.postDataJSON();
    let json=[],status=200;
    if(u.pathname.endsWith('/signup')) {signupCalls++;json={user,session:null};}
    else if(u.pathname.endsWith('/token')) json={access_token:token,refresh_token:'mock',token_type:'bearer',expires_in:3600,user};
    else if(u.pathname.endsWith('/user')) json=user;
    else if(u.pathname.endsWith('/logout')) json={};
    else if(u.pathname.endsWith('/events')) {
      if(method==='PATCH') {Object.assign(event,body);json={id:event.id};}
      else json=[event];
    } else if(u.pathname.endsWith('/profiles')) {
      if(method==='POST'||method==='PATCH'){profile={...body,id:user.id};json={id:user.id};}
      else json=profile;
    } else if(u.pathname.endsWith('/registrations')) {
      if(method==='POST') {inserts++;if(full){status=400;json={code:'P0001',message:'EVENT_UNAVAILABLE'};}else {registrations=[{id:'33333333-3333-4333-8333-333333333333',event_id:event.id,player_id:user.id}];event.occupied=1;json={id:registrations[0].id};}}
      else if(method==='DELETE'){json=registrations.map(r=>({id:r.id}));registrations=[];event.occupied=0;}
      else json=registrations;
    } else if(u.pathname.endsWith('/rpc/event_roster')) json=registrations.map(r=>({...r,registration_id:r.id,display_name:profile.display_name,team:profile.team,registered_at:new Date().toISOString()}));
    else throw Error('Unmocked URL: '+u.pathname);
    await route.fulfill({status,json});
  });
  await page.reload();await page.waitForSelector('.event-card');
  assert.equal(await page.getByText('NÃO IMPORTAR',{exact:true}).count(),0);
  await page.locator('#register-form [name=email]').fill(user.email);await page.locator('#register-form [name=password]').fill('test-only-password-123');await page.locator('#register-form button').click();
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('receberá um e-mail'));assert.equal(signupCalls,1);
  await page.locator('#login-form [name=email]').fill(user.email);await page.locator('#login-form [name=password]').fill('test-only-password-123');await page.locator('#login-form button:not([type])').click();
  await page.waitForFunction(()=>!document.querySelector('#account-panel').hidden);
  await page.locator('#profile-form [name=display_name]').fill('<b>Jogador</b>');await page.locator('#profile-form [name=team]').fill('Equipe remota');await page.locator('#profile-form button').click();
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Perfil salvo'));
  page.on('dialog',dialog=>dialog.accept());
  // Server refusal must not create any local registration or show success.
  full=true;await page.locator('[data-register]').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('lotado'));assert.equal(registrations.length,0);
  full=false;await page.locator('[data-register]').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Inscrição confirmada'));assert.equal(inserts,2);
  assert.equal(await page.locator('[data-cancel]').count(),1);assert.equal(await page.locator('#registration-list b').count(),0);
  await page.locator('[data-cancel]').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Vaga liberada'));
  await page.locator('[data-edit]').click();await page.locator('#event-form [name=capacity]').fill('5');await page.locator('#event-form > button').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Evento salvo'));assert.equal(event.capacity,5);
  for(const width of [360,768,1440]) {await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);}
  await page.locator('#logout').click();await page.waitForFunction(()=>document.querySelector('#account-panel').hidden);
  assert.equal(await page.locator('[data-edit]').count(),0);assert.equal(await page.locator('[data-cancel]').count(),0);
  assert.equal(await page.locator('#profile-form [name=display_name]').inputValue(),'');
  assert.deepEqual(errors,[]);
  console.log('PASS UI (mock HTTP): disconnected mode, signup/confirmation notice, login, profile, event editing, register/reject/cancel, logout privacy, no demo import, HTML escaping, responsive layout. Not a real Auth/integration test.');
} finally {await browser.close();}
