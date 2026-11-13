const {test,expect}=require('@playwright/test');
const host='https://nzgpceglyxwtukrbdkam.supabase.co';
const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'test@example.test',user_metadata:{display_name:'Teste local'}};
const id='11111111-2222-4333-8444-555555555555';
const ga='22222222-2222-4222-8222-222222222222',gb='33333333-3333-4333-8333-333333333333';
async function setup(page,options={}){
 const event={id,organizer_id:user.id,title:'TESTE LOCAL — grupos de combate',description:'Prévia funcional com API simulada. Nenhum evento real foi alterado.',location:'Campo de teste local',status:'published',starts_at:'2030-12-01T09:00:00Z',ends_at:'2030-12-01T13:00:00Z',capacity:10,active_registration_count:1,price_cents:0};
 const groups=[{id:ga,event_id:id,name:'Alpha',capacity:2,active_registration_count:0},{id:gb,event_id:id,name:'Bravo',capacity:1,active_registration_count:1}];
 const registrations=[],calls=[];
 await page.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),method=req.method(),body=req.postData()?req.postDataJSON():null;
  calls.push({url,method,body});let data=[],status=200;
  if(url.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user};
  else if(url.pathname.endsWith('/user'))data=user;
  else if(url.pathname.endsWith('/profiles'))data=[{id:user.id}];
  else if(url.pathname.endsWith('/event_combat_groups')){
   if(options.missing||options.groupError){status=options.missing?404:403;data={code:options.missing?'PGRST205':'PGRST000',message:'Indisponível'};}
   else data=groups;
  }else if(url.pathname.endsWith('/save_combat_group')){
   if(options.saveError){status=400;data={code:'23514',message:'capacity'};}
   else if(body.p_group_id){Object.assign(groups.find(g=>g.id===body.p_group_id),{name:body.p_name,capacity:body.p_capacity});data=body.p_group_id;}
   else {groups.push({id:'44444444-4444-4444-8444-444444444444',event_id:id,name:body.p_name,capacity:body.p_capacity,active_registration_count:0});data=groups.at(-1).id;}
  }else if(url.pathname.endsWith('/events'))data=[event];
  else if(url.pathname.endsWith('/registrations')){
   if(method==='POST'){
    if(options.race){status=400;data={code:'P1002',message:'Grupo lotado'};}
    else {registrations.push({id:'registration',...body,status:'active',created_at:'2030-11-01T12:00:00Z',events:{title:event.title,starts_at:event.starts_at}});if(body.combat_group_id)groups.find(g=>g.id===body.combat_group_id).active_registration_count++;event.active_registration_count++;data=null;status=201;}
   }else if(method==='PATCH'){
    const row=registrations[0];if(row.status==='active'){row.status='cancelled';event.active_registration_count--;if(row.combat_group_id)groups.find(g=>g.id===row.combat_group_id).active_registration_count--;}data=null;
   }else data=registrations.filter(r=>url.searchParams.get('status')!=='eq.active'||r.status==='active');
  }
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });return {event,groups,registrations,calls};
}
async function login(page){await page.getByLabel('E-mail',{exact:true}).fill(user.email);await page.getByLabel('Senha',{exact:true}).fill('Somente-mock-123!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(url=>!url.pathname.endsWith('/login.html'));}

test('seleção retorna após login, registra grupo e cancelamento libera vaga (API simulada)',async({page})=>{
 const state=await setup(page);await page.setViewportSize({width:390,height:844});page.on('dialog',d=>d.accept());
 await page.goto('/game.html?id='+id);await expect(page.getByRole('radio',{name:/Bravo/})).toBeDisabled();
 await page.locator('#game-tickets').getByRole('button',{name:'Entre para se inscrever'}).click();await expect(page.locator('#notice')).toContainText('Escolha um grupo');expect(state.registrations).toHaveLength(0);
 await page.getByRole('radio',{name:/Alpha/}).check();await page.locator('#game-tickets').getByRole('button',{name:'Entre para se inscrever'}).click();await expect(page).toHaveURL(/login.html\?next=/);await login(page);
 await expect(page.getByRole('radio',{name:/Alpha/})).toBeChecked();expect(state.registrations).toHaveLength(0);
 await page.locator('#game-tickets').getByRole('button',{name:'Inscrever-me',exact:true}).click();await expect(page.locator('#game-tickets')).toContainText('Grupo: Alpha');expect(state.registrations[0].combat_group_id).toBe(ga);expect(state.groups[0].active_registration_count).toBe(1);
 await page.goto('/connected.html');await expect(page.locator('#my-registrations')).toContainText('Grupo: Alpha');await page.locator('#my-registrations').getByRole('button',{name:'Cancelar minha inscrição'}).click();await expect(page.locator('#my-registrations')).toContainText('Inscrição cancelada.');expect(state.groups[0].active_registration_count).toBe(0);
 await page.goto('/game.html?id='+id);await expect(page.getByRole('radio',{name:/Alpha/})).toBeEnabled();await expect(page.getByRole('radio',{name:/Alpha/})).toHaveAccessibleName(/2 de 2/);
});

test('organizador cria/edita grupo e participantes seguem área restrita (API simulada)',async({page})=>{
 const state=await setup(page);await page.goto('/login.html');await login(page);await expect(page.locator('#account')).toBeVisible();
 await page.getByText('Gerenciar grupos de combate',{exact:true}).click();const manager=page.locator('.combat-group-manager');const newForm=manager.locator('form').last();
 await newForm.getByLabel('Nome do novo grupo').fill('Charlie');await newForm.getByLabel('Limite de vagas do grupo').fill('3');await newForm.getByRole('button',{name:'Adicionar grupo'}).click();await expect(page.locator('#notice')).toContainText('Grupo salvo');expect(state.groups.at(-1).name).toBe('Charlie');
 await page.getByText('Gerenciar grupos de combate',{exact:true}).click();const edit=page.locator('.combat-group-edit').filter({hasText:'Alpha'});await edit.getByLabel('Nome do grupo',{exact:true}).fill('Alpha Verde');await edit.getByLabel('Limite de vagas do grupo').fill('4');await edit.getByRole('button',{name:'Salvar grupo'}).click();await expect(page.locator('.combat-group-edit')).toContainText(['Alpha Verde','Bravo','Charlie']);
 const rpc=state.calls.filter(c=>c.url.pathname.endsWith('/save_combat_group'));expect(rpc[0].body).toEqual({p_event_id:id,p_name:'Charlie',p_capacity:3,p_group_id:null});expect(rpc[1].body.p_group_id).toBe(ga);
 expect(state.calls.some(c=>c.url.pathname.endsWith('/event_combat_groups')&&c.method!=='GET')).toBe(false);
 await page.goto('/game.html?id='+id);await page.getByRole('radio',{name:/Alpha Verde/}).check();await page.locator('#game-tickets').getByRole('button',{name:'Inscrever-me',exact:true}).click();
 await page.goto('/connected.html');await page.getByRole('button',{name:'Ver inscrições ativas'}).click();await expect(page.locator('#my-events')).toContainText('Alpha Verde');await expect(page.locator('#my-events')).toContainText('Inscrição registra');
});

test('erro do banco de grupo lotado é exibido sem confirmar inscrição (API simulada)',async({page})=>{
 const state=await setup(page,{race:true});await page.goto('/login.html');await login(page);await page.goto('/game.html?id='+id);await page.getByRole('radio',{name:/Alpha/}).check();await page.locator('#game-tickets').getByRole('button',{name:'Inscrever-me',exact:true}).click();await expect(page.locator('#notice')).toContainText('grupo está lotado');await expect(page.locator('#game-tickets')).not.toContainText('Inscrição confirmada');expect(state.registrations).toHaveLength(0);
});

test('schema antigo mantém inscrição sem grupo e informa migração ao organizador (API simulada)',async({page})=>{
 const state=await setup(page,{missing:true});await page.goto('/login.html');await login(page);await expect(page.locator('#my-events')).toContainText('migração 004');await expect(page.locator('.combat-group-manager')).toHaveCount(0);await page.goto('/game.html?id='+id);await expect(page.getByRole('radio')).toHaveCount(0);await page.locator('#game-tickets').getByRole('button',{name:'Inscrever-me',exact:true}).click();await expect(page.locator('#game-tickets')).toContainText('Inscrição confirmada.');expect(state.registrations[0]).not.toHaveProperty('combat_group_id');
});

test('falha de consulta de grupos bloqueia inscrição e lista pública não mostra participantes (API simulada)',async({page})=>{
 const state=await setup(page,{groupError:true});await page.goto('/game.html?id='+id);await expect(page.locator('#game-tickets')).toContainText('Inscrição indisponível até carregar os grupos');expect(state.calls.some(c=>c.url.pathname.endsWith('/registrations'))).toBe(false);await expect(page.locator('#my-events,#my-registrations')).toHaveCount(0);
});

test('limite inferior aos inscritos recusado pelo banco na gestão (API simulada)',async({page})=>{
 await setup(page,{saveError:true});await page.goto('/login.html');await login(page);await page.getByText('Gerenciar grupos de combate',{exact:true}).click();const form=page.locator('.combat-group-edit').filter({hasText:'Bravo'}).locator('form');await expect(form.getByLabel('Limite de vagas do grupo')).toHaveAttribute('min','1');await form.getByRole('button',{name:'Salvar grupo'}).click();await expect(page.locator('#notice')).toContainText('capacidade do evento ou grupo não pode ser menor');
});


test('catálogo encaminha à escolha e não permite inscrição quando todos os grupos lotam (API simulada)',async({page})=>{
 const state=await setup(page);await page.goto('/index.html');await page.locator('#events .poster-link').click();await expect(page).toHaveURL(/game.html\?id=/);await expect(page.getByRole('radio',{name:/Alpha/})).toBeVisible();expect(state.registrations).toHaveLength(0);state.groups[0].active_registration_count=state.groups[0].capacity;await page.reload();await expect(page.locator('#game-tickets')).toContainText('Todos os grupos estão lotados.');await expect(page.locator('#game-tickets button')).toHaveCount(0);
});

for(const width of [320,390,1440])test('prévia de grupos cabe em '+width+' (API simulada)',async({page},testInfo)=>{
 await setup(page);await page.setViewportSize({width,height:844});await page.goto('/game.html?id='+id);await page.getByRole('radio',{name:/Alpha/}).check();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('grupos-jogo-'+width+'.png'),fullPage:true});
 await page.goto('/login.html');await login(page);await page.getByText('Gerenciar grupos de combate',{exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('grupos-organizador-'+width+'.png'),fullPage:true,style:'body{position:relative!important}.mobile-nav{position:absolute!important;bottom:0!important}'});
});
