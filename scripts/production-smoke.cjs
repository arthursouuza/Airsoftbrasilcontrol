// Somente leitura: usa o site público atual, sem substituir os arquivos do Pages.
const {chromium}=require('@playwright/test');
const fs=require('node:fs');
const site='https://arthursouuza.github.io/Airsoftbrasilcontrol/';
const host='https://nzgpceglyxwtukrbdkam.supabase.co';
(async()=>{
 const proxy=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],proxy:proxy?{server:proxy}:undefined});
 const context=await browser.newContext();const page=await context.newPage();const errors=[];
 page.on('pageerror',()=>errors.push('Erro JavaScript no site público'));
 // Browser usa a CA do ambiente pelo cliente HTTP Playwright. TLS continua validado.
 await page.route(site+'**',async route=>{
   if(!['GET','OPTIONS'].includes(route.request().method()))return route.abort();
   await route.fulfill({response:await route.fetch()});
 });
 await page.route(host+'/**',async route=>{
   if(!['GET','OPTIONS'].includes(route.request().method()))return route.abort();
   await route.fulfill({response:await route.fetch()});
 });
 try{
   const response=await page.goto(site,{waitUntil:'networkidle'});
   if(!response.ok())throw new Error('Pages retornou HTTP '+response.status());
   const accountLink=page.locator('a[href="connected.html"]').first();
   console.log('Pages HTTP',response.status());
   console.log('Título público:',await page.title());
   console.log('Links para a conta:',await accountLink.count());
   await page.goto(site+'connected.html',{waitUntil:'networkidle'});
   const panelExists=await page.locator('#admin-panel').count();
   console.log('Painel administrativo presente no HTML publicado:',!!panelExists);
   await page.goto(site+'login.html',{waitUntil:'networkidle'});
   console.log('Formulário de login publicado:',await page.locator('#auth-form').count()===1);
   const config=fs.readFileSync('src/config.js','utf8');const key=config.match(/SUPABASE_KEY = '([^']+)'/)[1];
   const events=await context.request.get(host+'/rest/v1/events?select=id,title,status&title=ilike.*carandiru*',{headers:{apikey:key}});
   if(!events.ok())throw new Error('Consulta pública ao Supabase falhou');
   const rows=await events.json();
   if(!rows.some(e=>e.id==='b581d679-53ba-4479-8e92-9b44b7ab49b6'&&e.status==='published'))throw new Error('Carandiru não encontrada publicada');
   console.log('PASS Carandiru permanece publicada. Nenhuma escrita foi executada.');
   if(errors.length)throw new Error(errors.join('; '));
   fs.mkdirSync('work',{recursive:true});await page.screenshot({path:'work/production-login.png',fullPage:true});
   console.log('Esta verificação não homologa o novo painel nem login administrativo.');
 }finally{await browser.close();}
})().catch(error=>{console.error('FAIL verificação pública:',error.message);process.exitCode=1;});
