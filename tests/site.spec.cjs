const {test,expect}=require('./offline-fixture.cjs');
const host='https://nzgpceglyxwtukrbdkam.supabase.co';
const user={id:'11111111-1111-4111-8111-111111111111',email:'player@example.test',aud:'authenticated',role:'authenticated',user_metadata:{display_name:'Jogador teste'}};
const token=()=>({access_token:'test-access-token',token_type:'bearer',expires_in:3600,refresh_token:'test-refresh-token',user});
async function setup(page){
 const events=[],registrations=[]; const calls=[];
 await page.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method(); calls.push({path,method});
  let data=[];let status=200;
  if(path.endsWith('/signup')) data={user,session:null};
  else if(path.endsWith('/token')) data=token();
  else if(path.endsWith('/logout')) data={};
  else if(path.endsWith('/user')) data=user;
  else if(path.endsWith('/profiles'))data=[{id:user.id}];
  else if(path.endsWith('/events')){
   if(method==='POST'){events.push({id:'22222222-2222-4222-8222-222222222222',...req.postDataJSON()});status=201;data=null;}
   else if(method==='PATCH'){Object.assign(events[0],req.postDataJSON());data=null;}
   else data=events.filter(e=>url.searchParams.get('status')!=='eq.published'||e.status==='published');
  }else if(path.endsWith('/registrations')){
   if(method==='POST'){registrations.push({id:'registration',...req.postDataJSON(),events:{title:events[0].title,starts_at:events[0].starts_at}});status=201;data=null;}
   else data=registrations;
  }
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });return {events,registrations,calls};
}
test('cadastro com confirmação, login, evento, inscrição, sessão persistente e logout (API simulada)',async({page})=>{
 const state=await setup(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/index.html');await expect(page.getByText('Ainda não há próximos eventos publicados.')).toBeVisible();await page.goto('/cadastro.html');
 await page.getByLabel('Nome de jogador').fill('Jogador teste');await page.getByLabel('E-mail',{exact:true}).fill(user.email);await page.getByLabel('Senha',{exact:true}).fill('Temporary-test-password!');
 await page.getByRole('button',{name:'Criar conta',exact:true}).click();await expect(page.getByRole('status').first()).toContainText('Confira seu e-mail');
 await page.getByRole('link',{name:'Já tenho conta. Entrar'}).click();await page.getByLabel('E-mail',{exact:true}).fill(user.email);await page.getByLabel('Senha',{exact:true}).fill('Temporary-test-password!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.locator('#account')).toBeVisible();
 await page.getByText('Criar evento',{exact:true}).click();await page.getByLabel('Título',{exact:true}).fill('Operação teste');await page.getByLabel('Descrição',{exact:true}).fill('<img src=x onerror=alert(1)>');await page.getByLabel('Local',{exact:true}).fill('Campo teste');
 await page.getByLabel('Início',{exact:true}).fill('2030-12-01T09:00');await page.getByLabel('Fim',{exact:true}).fill('2030-12-01T12:00');await page.getByLabel('Visibilidade').selectOption('published');
 await page.getByLabel('Capacidade de vagas',{exact:true}).fill('20');
 await page.getByRole('button',{name:'Salvar evento',exact:true}).click();await expect(page.locator('#my-events h3')).toHaveText('Operação teste');await page.goto('/index.html');await expect(page.locator('#events h3')).toHaveText('Operação teste');expect(state.events).toHaveLength(1);expect(await page.locator('#events img').count()).toBe(0);
 await page.locator('#events .poster-link').click();await page.locator('#game-tickets').getByRole('button',{name:'Inscrever-me',exact:true}).click();await expect(page.locator('#game-tickets')).toContainText('Inscrição confirmada.');expect(state.registrations).toHaveLength(1);await page.goto('/connected.html');await expect(page.locator('#my-registrations')).toContainText('Operação teste');
 await page.reload();await expect(page.locator('#account')).toBeVisible();await expect(page.locator('#my-registrations')).toContainText('Inscrição ativa');
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.locator('#account-guest')).toBeVisible();await expect(page.locator('#account')).toBeHidden();expect(errors).toEqual([]);
});
test('credenciais inválidas mantêm o usuário fora da conta (API simulada)',async({page})=>{
 await setup(page);await page.route(host+'/auth/v1/token**',r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error_code:'invalid_credentials',msg:'Invalid login credentials'})}));
 await page.goto('/login.html');await page.getByLabel('E-mail',{exact:true}).fill(user.email);await page.getByLabel('Senha',{exact:true}).fill('Wrong-password!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.locator('#notice')).toHaveText('E-mail ou senha incorretos.');await expect(page.locator('#account')).toBeHidden();
});
test('layout móvel permite cadastro sem rolagem horizontal',async({page})=>{
 await setup(page);await page.setViewportSize({width:375,height:812});await page.goto('/cadastro.html');await expect(page.getByRole('button',{name:'Criar conta',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
