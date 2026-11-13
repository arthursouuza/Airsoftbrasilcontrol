const {test,expect}=require('./offline-fixture.cjs');
const host='https://nzgpceglyxwtukrbdkam.supabase.co';
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',email:'teste@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',user_metadata:{}};
function token(){return [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})).toString('base64url'),'test-signature'].join('.');}
async function recovery(page,options={}){
 const calls=[];
 await page.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url());calls.push({path:url.pathname,method:req.method(),body:req.postData()?req.postDataJSON():null,url});
  let status=200,body=user;
  if(url.pathname.endsWith('/user')&&req.method()==='PUT'&&options.updateError){status=422;body={error_code:options.updateError,msg:'Rejected'};}
  else if(url.pathname.endsWith('/user')&&options.invalidSession){status=401;body={message:'Invalid token'};}
  else if(url.pathname.endsWith('/logout'))body={};
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 const hash=new URLSearchParams({access_token:token(),refresh_token:'test-refresh',token_type:'bearer',expires_in:'3600',type:'recovery'});
 await page.goto('/auth-callback.html#'+hash);
 return calls;
}
test('solicitação usa e-mail e callback permitido sem precisar da senha (API simulada)',async({page})=>{
 const calls=[];await page.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.pathname.endsWith('/recover'))calls.push({url,body:req.postDataJSON()});
  await route.fulfill({status:200,contentType:'application/json',body:url.pathname.endsWith('/events')?'[]':'{}'});
 });
 await page.goto('/login.html#forgot-password');await expect(page.locator('#recovery-form')).toBeVisible();
 await page.getByLabel('E-mail para recuperar a senha').fill(user.email);await page.getByRole('button',{name:'Enviar link de recuperação'}).click();
 await expect(page.locator('#notice')).toContainText('Se houver uma conta');expect(calls).toHaveLength(1);expect(calls[0].body.email).toBe(user.email);expect(calls[0].body.password).toBeUndefined();expect(calls[0].url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:8000/auth-callback.html');
});
test('recuperação valida sessão, compara campos, atualiza e encerra sessões (API simulada)',async({page})=>{
 const calls=await recovery(page);await expect(page.locator('#new-password-form')).toBeVisible();expect(page.url()).not.toContain('#');
 await page.getByLabel('Nova senha',{exact:true}).fill('Somente-no-mock-123!');await page.getByLabel('Confirmar nova senha').fill('Diferente-no-mock-123!');await page.getByRole('button',{name:'Salvar nova senha'}).click();
 await expect(page.getByRole('status')).toContainText('não coincidem');expect(calls.filter(c=>c.method==='PUT')).toHaveLength(0);
 await page.getByLabel('Confirmar nova senha').fill('Somente-no-mock-123!');await page.getByRole('button',{name:'Salvar nova senha'}).click();await expect(page.getByRole('status')).toContainText('Senha alterada com sucesso');await expect(page.locator('#new-password-form')).toBeHidden();
 expect(calls.filter(c=>c.method==='PUT')).toHaveLength(1);expect(calls.find(c=>c.path.endsWith('/logout')).url.searchParams.get('scope')).toBe('global');
 expect(await page.locator('input[name=password]').inputValue()).toBe('');
});
test('senha rejeitada pelo serviço mantém possibilidade de tentar novamente (API simulada)',async({page})=>{
 await recovery(page,{updateError:'same_password'});await expect(page.locator('#new-password-form')).toBeVisible();await page.getByLabel('Nova senha',{exact:true}).fill('Somente-no-mock-123!');await page.getByLabel('Confirmar nova senha').fill('Somente-no-mock-123!');await page.getByRole('button',{name:'Salvar nova senha'}).click();await expect(page.getByRole('status')).toContainText('diferente da atual');await expect(page.locator('#new-password-form')).toBeVisible();
});
test('limite de e-mails informa bloqueio sem afirmar envio (API simulada)',async({page})=>{
 await page.route(host+'/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/recover'))await route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error_code:'over_email_send_rate_limit',msg:'email rate limit exceeded'})});
  else await route.fulfill({status:200,contentType:'application/json',body:'[]'});
 });
 await page.goto('/login.html#forgot-password');await page.getByLabel('E-mail para recuperar a senha').fill(user.email);await page.getByRole('button',{name:'Enviar link de recuperação'}).click();await expect(page.locator('#notice')).toContainText('limite de envio de e-mails');await expect(page.locator('#notice')).not.toContainText('você receberá');
});
test('sessão inválida e link sem credenciais não oferecem alteração de senha',async({page})=>{
 const calls=await recovery(page,{invalidSession:true});await expect(page.getByRole('status')).toContainText('Este link expirou');await expect(page.locator('#new-password-form')).toBeHidden();expect(calls.filter(c=>c.method==='PUT')).toHaveLength(0);
 await page.goto('/auth-callback.html');await expect(page.locator('#new-password-form')).toBeHidden();
});
