// Valida o callback local com uma sessão real, sem imprimir credenciais.
const {chromium,expect}=require('@playwright/test');
const fs=require('fs');
const auth=JSON.parse(fs.readFileSync(process.env.ABC_TEST_AUTH_FILE||'/tmp/abc-auth-test.json','utf8'));
const config=fs.readFileSync('src/config.js','utf8');
const base=config.match(/SUPABASE_URL = '([^']+)'/)[1],key=config.match(/SUPABASE_KEY = '([^']+)'/)[1];
(async()=>{
 const proxy=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],proxy:proxy?{server:proxy,bypass:'127.0.0.1,localhost'}:undefined});
 const context=await browser.newContext(),page=await context.newPage();
 try{
  const login=await context.request.post(base+'/auth/v1/token?grant_type=password',{headers:{apikey:key},data:{email:auth.email,password:auth.password}});
  if(login.status()!==200)throw new Error('Login não disponível para validar o callback');
  const session=await login.json();
  await page.route(base+'/**',async route=>{try{await route.fulfill({response:await route.fetch()});}catch{await route.abort().catch(()=>{});}});
  const fragment=new URLSearchParams({access_token:session.access_token,refresh_token:session.refresh_token,token_type:'bearer',expires_in:String(session.expires_in),type:'signup'});
  await page.goto('http://127.0.0.1:8000/auth-callback.html#'+fragment);
  await expect(page.locator('#account')).toBeVisible({timeout:15000});
  if(page.url()!=='http://127.0.0.1:8000/connected.html')throw new Error('Destino inesperado após callback');
  console.log('PASS callback local validou usuário real, removeu tokens da URL e abriu a conta');
  await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.locator('#auth')).toBeVisible();
 }finally{await page.unrouteAll({behavior:'wait'});await browser.close();}
})().catch(()=>{console.error('FAIL callback real; credenciais omitidas. Verifique autenticação e servidor local.');process.exitCode=1;});
