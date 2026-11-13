const {test,expect}=require('@playwright/test');
const host='https://nzgpceglyxwtukrbdkam.supabase.co';
const id='11111111-2222-4333-8444-555555555555';
const event={id,title:'Operação do banco',location:'Campo cadastrado',description:'Descrição cadastrada <script>alert(1)</script>',starts_at:'2030-12-01T09:00:00Z',ends_at:'2030-12-01T13:00:00Z',created_at:'2026-11-01T00:00:00Z',status:'published',price_cents:5000,capacity:100,active_registration_count:1};
async function mock(page,options={}){
 const requests=[];
 await page.route(host+'/**',async route=>{
  const r=route.request(),url=new URL(r.url());requests.push({url,method:r.method()});let data=[];
  if(url.pathname.endsWith('/events')) {
   if(r.method()==='PATCH'){Object.assign(options.event,r.postDataJSON());data=[];}
   else data=options.missing?[]:[{...event,...options.event}];
  } else if(url.pathname.endsWith('/token')) data={access_token:'test-token',refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'test@example.test',user_metadata:{}}};
  else if(url.pathname.endsWith('/profiles')) data=[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}];
  else if(url.pathname.endsWith('/teams')) data=options.teams||[];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });return requests;
}
test('página inicial lê Supabase, sem importar demonstração local (API simulada)',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('abc-demo-v1',JSON.stringify({events:[{title:'FICTÍCIO NÃO IMPORTAR'}]})));
 const calls=await mock(page);await page.goto('/');await expect(page.locator('#events h3')).toHaveText('Operação do banco');await expect(page.getByRole('heading',{name:'Começando em breve.'})).toBeVisible();await expect(page.getByRole('heading',{name:'Recém-chegados.'})).toBeVisible();await expect(page.getByRole('heading',{name:'Times.'})).toBeVisible();
 await expect(page.locator('body')).not.toContainText('FICTÍCIO NÃO IMPORTAR');expect(calls.some(c=>c.url.pathname.endsWith('/events'))).toBe(true);await expect(page.locator('#teams-list')).toContainText('Entre na sua conta');
 await page.locator('#events').getByRole('link',{name:'Ver jogo: Operação do banco'}).click();await expect(page.locator('#game-view h1')).toHaveText('Operação do banco');
});
test('jogo mostra conteúdo real, ingresso, horários, mapa e lacunas sem inventar (API simulada)',async({page})=>{
 await mock(page);await page.goto('/game.html?id='+id);await expect(page.locator('#game-view h1')).toHaveText(event.title);await expect(page.locator('#catalogue-home')).toBeHidden();
 await expect(page.locator('#game-about')).toContainText(event.description);expect(await page.locator('#game-about script').count()).toBe(0);
 await expect(page.locator('#game-tickets')).toContainText('R$ 50,00');await expect(page.locator('#game-tickets')).toContainText('99 vaga(s)');await expect(page.locator('#game-groups')).toContainText('Grupos ainda não informados');await expect(page.locator('#game-rules')).toContainText('Regras ainda não informadas');await expect(page.locator('#game-schedule')).toContainText('Término');
 await expect(page.locator('#game-location a')).toHaveAttribute('href',/query=Campo%20cadastrado/);
 await page.locator('#game-tickets').getByRole('button',{name:'Entre para se inscrever'}).click();await expect(page.locator('#auth-form input[name=email]')).toBeFocused();
});
test('mídia inválida não executa código e campos cadastrados são exibidos (API simulada)',async({page})=>{
 await mock(page,{event:{poster_url:'javascript:alert(1)',cover_url:'data:text/html,test',groups:'Alpha e Bravo',schedule:'Credenciamento às 08h',rules:'Proteção ocular obrigatória'}});await page.goto('/game.html?id='+id);await expect(page.locator('#game-view h1')).toBeVisible();expect(await page.locator('#game-view img').count()).toBe(0);await expect(page.locator('#game-groups')).toContainText('Alpha e Bravo');await expect(page.locator('#game-schedule')).toContainText('Credenciamento às 08h');await expect(page.locator('#game-rules')).toContainText('Proteção ocular obrigatória');
});
test('identificador inexistente não expõe rascunhos nem cria eventos falsos (API simulada)',async({page})=>{
 await mock(page,{missing:true});await page.goto('/game.html?id='+id);await expect(page.locator('#game-view h1')).toHaveText('Jogo não encontrado');await expect(page.locator('#game-tickets')).toHaveCount(0);
});
for(const width of [320,390,1440])test('catálogo e página do jogo cabem na tela '+width,async({page})=>{
 await mock(page);await page.setViewportSize({width,height:844});await page.goto('/');await expect(page.locator('#events h3')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width<650){await expect(page.getByRole('navigation',{name:'Navegação no celular'})).toBeVisible();await page.getByRole('navigation',{name:'Navegação no celular'}).getByRole('link',{name:'Times',exact:true}).click();await expect(page.locator('#teams-heading')).toBeInViewport();}
 else await expect(page.getByRole('navigation',{name:'Navegação no celular'})).toBeHidden();
 await page.goto('/game.html?id='+id);await expect(page.locator('#game-view h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('conta conectada preserva navegação, times e edição da apresentação (API simulada)',async({page})=>{
 const opts={event:{poster_url:null,cover_url:null,groups:null,rules:null,schedule:null},teams:[{id:'team',name:'Time cadastrado',description:'Descrição do time no banco'}]};
 await mock(page,opts);await page.goto('/');await expect(page.locator('.organizer-link')).toHaveAttribute('href','#auth');
 await page.getByLabel('E-mail',{exact:true}).fill('test@example.test');await page.getByLabel('Senha',{exact:true}).fill('Somente-mock-123!');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.locator('#account')).toBeVisible();await expect(page.locator('.organizer-link')).toHaveAttribute('href','#account');await expect(page.locator('[data-account-label]')).toHaveText('Minha conta');await expect(page.locator('#teams-list')).toContainText('Time cadastrado');
 await page.getByText('Editar apresentação do jogo',{exact:true}).click();await page.getByLabel('Grupos',{exact:true}).fill('Alpha e Bravo');await page.getByRole('button',{name:'Salvar apresentação'}).click();await expect(page.locator('#notice')).toHaveText('Apresentação atualizada.');expect(opts.event.groups).toBe('Alpha e Bravo');
});
