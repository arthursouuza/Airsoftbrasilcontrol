const {test,expect}=require('@playwright/test');
const fs=require('fs');const {transformSync}=require('esbuild');
const mod={exports:{}};new Function('module','exports',transformSync(fs.readFileSync('src/config.js','utf8'),{format:'cjs'}).code)(mod,mod.exports);const config=mod.exports;
test('retorno mantém o caminho do GitHub Pages e isola o endereço local',()=>{
 expect(config.emailRedirectUrl('https://arthursouuza.github.io/Airsoftbrasilcontrol/')).toBe('https://arthursouuza.github.io/Airsoftbrasilcontrol/auth-callback.html');
 expect(config.emailRedirectUrl('https://preview.example/test/')).toBe('https://arthursouuza.github.io/Airsoftbrasilcontrol/auth-callback.html');
 expect(config.emailRedirectUrl('http://localhost:8000/index.html')).toBe('http://localhost:8000/auth-callback.html');
});
test('link expirado tem mensagem legível e remove erro da URL',async({page})=>{
 await page.goto('/auth-callback.html#error=access_denied&error_code=otp_expired');
 await expect(page.getByRole('status')).toContainText('Este link expirou');expect(page.url()).not.toContain('#');
 await expect(page.getByRole('link',{name:'Voltar ao site'})).toHaveAttribute('href','connected.html');
});
test('callback sem credenciais não informa confirmação inexistente',async({page})=>{
 await page.goto('/auth-callback.html');await expect(page.getByRole('status')).toContainText('não contém um link de confirmação');
});
test('cadastro e reenvio enviam retorno explícito ao Supabase (API simulada)',async({page})=>{
 const requests=[];
 await page.route('https://nzgpceglyxwtukrbdkam.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.endsWith('/signup')||url.pathname.endsWith('/resend'))requests.push({path:url.pathname,redirect:url.searchParams.get('redirect_to'),body:req.postDataJSON()});
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('/events')?[]:{user:{id:'test'},session:null})});
 });
 await page.goto('/cadastro.html');await page.getByLabel('Nome de jogador').fill('Teste');await page.getByLabel('E-mail',{exact:true}).fill('test@example.test');await page.getByLabel('Senha',{exact:true}).fill('Temporary-test-password!');
 await page.getByRole('button',{name:'Criar conta',exact:true}).click();await expect(page.locator('#notice')).toContainText('Confira seu e-mail');
 expect(requests[0].redirect).toBe('http://127.0.0.1:8000/auth-callback.html');
 await page.getByRole('button',{name:'Reenviar confirmação'}).click();await expect(page.locator('#notice')).toContainText('cadastro pendente');
 expect(requests[1].redirect).toBe('http://127.0.0.1:8000/auth-callback.html');expect(requests[1].body.type).toBe('signup');
});
