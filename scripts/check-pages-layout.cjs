// Testa os arquivos locais com origem/caminho de produção e Auth real.
// Não acessa nem publica o site remoto; intercepta somente os arquivos locais.
const {chromium,expect}=require('@playwright/test');
const fs=require('fs');const path=require('path');
const auth=JSON.parse(fs.readFileSync(process.env.ABC_TEST_AUTH_FILE||'/tmp/abc-auth-test.json','utf8'));
const config=fs.readFileSync('src/config.js','utf8');
const base=config.match(/SUPABASE_URL = '([^']+)'/)[1],key=config.match(/SUPABASE_KEY = '([^']+)'/)[1];
const site='https://arthursouuza.github.io/Airsoftbrasilcontrol/';
(async()=>{
 const proxy=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],proxy:proxy?{server:proxy}:undefined});
 const context=await browser.newContext();const page=await context.newPage();let failures=[];
 page.on('pageerror',()=>failures.push('Erro JavaScript'));
 await page.route(site+'**',async route=>{
  const url=new URL(route.request().url());const name=decodeURIComponent(url.pathname.slice('/Airsoftbrasilcontrol/'.length))||'index.html';
  if(!['index.html','styles.css','app.js','connected.html','connected.css','connected.js','auth-callback.html','auth-callback.js','favicon.ico'].includes(name))return route.fulfill({status:404,body:'Not found'});
  if(name==='favicon.ico')return route.fulfill({status:204});
  const types={'.html':'text/html','.css':'text/css','.js':'application/javascript'};
  await route.fulfill({status:200,contentType:types[path.extname(name)],body:fs.readFileSync(name)});
 });
 await page.route(base+'/**',async route=>{try{await route.fulfill({response:await route.fetch()});}catch{failures.push('Falha API');await route.abort().catch(()=>{});}});
 try{
  await page.goto(site);await page.getByRole('link',{name:'Minha conta / Eventos reais'}).click();await expect(page.locator('#auth')).toBeVisible();
  if(page.url()!==site+'connected.html')throw new Error('Caminho da área conectada inválido');
  console.log('PASS página inicial preservada abre área conectada no subdiretório');
  const login=await context.request.post(base+'/auth/v1/token?grant_type=password',{headers:{apikey:key},data:{email:auth.email,password:auth.password}});
  if(login.status()!==200)throw new Error('Login real indisponível');const s=await login.json();
  const hash=new URLSearchParams({access_token:s.access_token,refresh_token:s.refresh_token,token_type:'bearer',expires_in:String(s.expires_in),type:'signup'});
  await page.goto(site+'auth-callback.html#'+hash);await expect(page.locator('#account')).toBeVisible({timeout:15000});
  if(page.url()!==site+'connected.html')throw new Error('Retorno inválido para o GitHub Pages');
  await expect(page.locator('#my-events')).not.toBeEmpty();
  if(failures.length)throw new Error('Falhas no navegador');
  console.log('PASS arquivos locais no endereço de produção: callback real remove tokens e abre conta autenticada');
  await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.locator('#auth')).toBeVisible();
 }finally{await page.unrouteAll({behavior:'wait'});await browser.close();}
})().catch(()=>{console.error('FAIL validação do layout Pages; credenciais omitidas');process.exitCode=1;});
