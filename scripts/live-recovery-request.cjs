// Envia um único pedido real ao e-mail da conta de teste, sem ler/alterar sua senha.
const {chromium,expect}=require('@playwright/test');
const fs=require('fs');
const auth=JSON.parse(fs.readFileSync(process.env.ABC_TEST_AUTH_FILE||'/tmp/abc-auth-test.json','utf8'));
const site=process.env.ABC_TEST_SITE_BASE||'https://arthursouuza.github.io/Airsoftbrasilcontrol/';
const api='https://nzgpceglyxwtukrbdkam.supabase.co';
(async()=>{
 const proxy=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],proxy:proxy?{server:proxy}:undefined});
 const page=await browser.newPage();
 for(const pattern of ['https://arthursouuza.github.io/**',api+'/**'])await page.route(pattern,async route=>{try{await route.fulfill({response:await route.fetch()});}catch{await route.abort().catch(()=>{});}});
 try{
  await page.goto(site+'connected.html#forgot-password');await expect(page.locator('#recovery-form')).toBeVisible();
  await page.getByLabel('E-mail para recuperar a senha').fill(auth.email);
  const responsePromise=page.waitForResponse(r=>r.url().startsWith(api+'/auth/v1/recover'));
  await page.getByRole('button',{name:'Enviar link de recuperação'}).click();
  const response=await responsePromise;
  if(response.status()!==200){const failure=await response.json().catch(()=>({}));throw new Error('Supabase HTTP '+response.status()+' / '+(failure.error_code||failure.code||'request_failed'));}
  if(new URL(response.url()).searchParams.get('redirect_to')!==site+'auth-callback.html')throw new Error('Retorno incorreto');
  await expect(page.locator('#notice')).toContainText('Se houver uma conta');
  console.log('PASS site publicado solicitou e-mail real de recuperação: HTTP 200, callback correto, nenhuma senha alterada');
 }finally{await page.unrouteAll({behavior:'wait'});await browser.close();}
})().catch(error=>{console.error('FAIL recuperação:',String(error.message).split('Call log:')[0]);process.exitCode=1;});
