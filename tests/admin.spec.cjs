const {test,expect}=require('@playwright/test');
const host='https://nzgpceglyxwtukrbdkam.supabase.co';
async function setup(page, admin=true, fail=false) {
 const user={id:'76788b2d-a0a7-4423-8ef3-63f0b1975a7d',email:'admin@example.test',aud:'authenticated',role:'authenticated',user_metadata:{}};
 const events=[{id:'11111111-1111-4111-8111-111111111111',organizer_id:'other',title:'Evento isolado',status:'draft'}, {id:'22222222-2222-4222-8222-222222222222',organizer_id:'other',title:'Operação Carandiru',status:'archived'}];
 const tables={
  profiles:[{id:user.id,display_name:'Arthur'}],teams:[{id:'33333333-3333-4333-8333-333333333333',name:'Equipe teste',owner_id:user.id,description:''}],
  registrations:[{id:'44444444-4444-4444-8444-444444444444',event_id:events[0].id,player_id:user.id,status:'active'}],
  event_combat_groups:[],payments:[],site_content:[{id:'55555555-5555-4555-8555-555555555555',key:'footer_tagline',value:'Seu jogo. Seu comando.'}],team_members:[],protected_events:[],admin_audit:[],admin_event_audit:[]
 };
 Object.assign(events[0],{location:'Campo',starts_at:'2030-12-01T09:00:00Z',ends_at:'2030-12-01T12:00:00Z',price_cents:0,capacity:20});
 const calls=[];
 await page.route(host+'/**',async route=>{
  const req=route.request(),u=new URL(req.url());let data=[],status=200;
  if(u.pathname.endsWith('/token')) data={access_token:'test-token',refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user};
  else if(u.pathname.endsWith('/profiles'))data=tables.profiles;
  else if(u.pathname.endsWith('/is_site_admin'))data=admin;
  else if(u.pathname.includes('/rpc/admin_')) {
   const params=req.postDataJSON();calls.push({name:u.pathname.split('/').pop(),params});
   if(fail){status=400;data={message:'Exclusão bloqueada: existem inscrições ou pagamentos vinculados'};}
   else if(u.pathname.endsWith('/admin_archive_events')){for(const event of events.filter(e=>params.p_event_ids.includes(e.id))){event.archived_from_status=event.status;event.status='archived';}data=null;
   }else if(u.pathname.endsWith('/admin_save')){
    const table=params.p_resource==='events'?events:tables[params.p_resource];
    if(params.p_id)Object.assign(table.find(row=>row.id===params.p_id),params.p_data);
    else table.push({id:'66666666-6666-4666-8666-666666666666',...params.p_data});
    data=params.p_id||'66666666-6666-4666-8666-666666666666';
   }else if(u.pathname.endsWith('/admin_set_team_member')){
    const old=tables.team_members.find(r=>r.team_id===params.p_team_id&&r.user_id===params.p_user_id);
    if(old)old.active=params.p_active;else tables.team_members.push({team_id:params.p_team_id,user_id:params.p_user_id,active:params.p_active});data=null;
   }else { const event=events.find(e=>e.id===params.p_event_id);
    if(u.pathname.endsWith('admin_archive_event')){event.archived_from_status=event.status;event.status='archived';}
    else if(u.pathname.endsWith('admin_restore_event'))event.status=event.archived_from_status;
    else events.splice(events.indexOf(event),1);
    data=null;
   }
  } else if(u.pathname.endsWith('/events'))data=u.searchParams.has('organizer_id')||u.searchParams.has('status')?[]:events;
  else if(tables[u.pathname.split('/').pop()])data=tables[u.pathname.split('/').pop()];
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/login.html');await page.getByLabel('E-mail',{exact:true}).fill(user.email);await page.getByLabel('Senha',{exact:true}).fill('Test-password!');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.locator('#account')).toBeVisible();
 return {calls,events,tables};
}
test('admin arquiva/restaura; exclusão exige aprovação exata; Carandiru preservada',async({page})=>{
 const state=await setup(page);const panel=page.locator('#admin-panel');await expect(panel).toContainText('Modo Deus');
 const event=()=>panel.locator('article').filter({has:page.getByRole('heading',{name:'Evento isolado',exact:true})});
 await expect(panel.locator('article').filter({hasText:'Carandiru'}).getByRole('button',{name:'Solicitar exclusão definitiva'})).toHaveCount(0);
 page.once('dialog',d=>d.accept());await event().getByRole('button',{name:'Arquivar evento',exact:true}).click();await expect(event()).toContainText('archived');
 page.once('dialog',d=>d.accept());await event().getByRole('button',{name:'Restaurar evento'}).click();await expect(event()).toContainText('draft');
 page.once('dialog',d=>d.accept());await event().getByRole('button',{name:'Arquivar evento',exact:true}).click();await expect(event()).toContainText('archived');
 for(const answer of [null,'errado']){
  page.once('dialog',d=>answer===null?d.dismiss():d.accept(answer));await event().getByRole('button',{name:'Solicitar exclusão definitiva'}).click();
 }
 expect(state.calls.filter(c=>c.name==='admin_delete_event')).toHaveLength(0);
 page.once('dialog',d=>d.accept('Evento isolado'));await event().getByRole('button',{name:'Solicitar exclusão definitiva'}).click();await expect(event()).toHaveCount(0);
 expect(state.calls.filter(c=>c.name==='admin_delete_event')).toHaveLength(1);
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(panel).toBeHidden();await expect(panel).toBeEmpty();
});
test('conta comum não recebe painel',async({page})=>{
 await setup(page,false);await expect(page.locator('#admin-panel')).toBeHidden();
});
test('falha da RPC não remove evento ou informa sucesso',async({page})=>{
 const state=await setup(page,true,true);
 const card=page.locator('#admin-panel article').filter({hasText:'Evento isolado'});
 page.once('dialog',d=>d.accept());await card.getByRole('button',{name:'Arquivar evento',exact:true}).click();
 await expect(page.locator('#notice')).toContainText('Exclusão bloqueada');await expect(card).toContainText('draft');expect(state.events).toHaveLength(2);
});

async function section(page,name){
 const console=page.locator('.admin-console');await expect(console).toBeVisible();
 if(!await console.getAttribute('open'))await console.locator(':scope > summary').click();
 await console.getByRole('button',{name,exact:true}).click();return console;
}
test('edita evento de outro organizador por RPC auditada com snapshot',async({page})=>{
 const state=await setup(page);const card=page.locator('#admin-panel [data-admin-event]').filter({has:page.getByRole('heading',{name:'Evento isolado',exact:true})});
 await card.getByText('Editar evento',{exact:true}).click();await card.getByLabel('Título',{exact:true}).fill('Evento editado');await card.getByRole('button',{name:'Salvar alterações'}).click();
 await expect(page.locator('#notice')).toContainText('Registro administrativo salvo');expect(state.events[0].title).toBe('Evento editado');
 const call=state.calls.find(c=>c.name==='admin_save');expect(call.params.p_expected.title).toBe('Evento isolado');expect(call.params.p_resource).toBe('events');
});
test('gerencia jogadores, equipes, grupos, inscrições, pagamentos e texto público',async({page})=>{
 const state=await setup(page);
 let area=await section(page,'Jogadores');let card=area.locator('article').filter({has:page.getByRole('heading',{name:'Arthur',exact:true})});
 await card.getByText('Editar registro').click();await card.getByLabel('Nome de jogador').fill('Arthur administrador');await card.getByRole('button',{name:'Salvar alterações'}).click();await expect(page.locator('#notice')).toContainText('Registro administrativo salvo');
 area=await section(page,'Equipes');card=area.locator('article').filter({has:page.getByRole('heading',{name:'Equipe teste',exact:true})});await card.getByText('Editar registro').click();await card.getByLabel('Nome da equipe').fill('Equipe atualizada');await card.getByRole('button',{name:'Salvar alterações'}).click();await expect(page.locator('.admin-console')).toBeVisible();
 area=await section(page,'Grupos de combate');await area.getByText('Novo registro · Grupos de combate',{exact:true}).click();const groupForm=area.locator('form').first();await groupForm.getByLabel('Evento',{exact:true}).selectOption(state.events[0].id);await groupForm.getByLabel('Nome do grupo').fill('Alpha');await groupForm.getByLabel('Capacidade do grupo').fill('5');await groupForm.getByRole('button',{name:'Criar registro'}).click();await expect(page.locator('#notice')).toContainText('Registro administrativo salvo');
 area=await section(page,'Inscrições');page.once('dialog',d=>d.accept());await area.getByRole('button',{name:'Cancelar inscrição',exact:true}).click();await expect.poll(()=>state.tables.registrations[0].status).toBe('cancelled');
 area=await section(page,'Pagamentos');await area.getByText('Novo registro · Pagamentos',{exact:true}).click();const paymentForm=area.locator('form').first();await paymentForm.getByLabel('Inscrição',{exact:true}).selectOption(state.tables.registrations[0].id);await paymentForm.getByLabel('Valor (R$)',{exact:true}).fill('25.50');await paymentForm.getByLabel('Forma de pagamento').selectOption('manual_pix');page.once('dialog',d=>d.accept());await paymentForm.getByRole('button',{name:'Criar registro'}).click();await expect.poll(()=>state.tables.payments.length).toBe(1);expect(state.tables.payments[0].amount_cents).toBe(2550);
 area=await section(page,'Conteúdo do site');card=area.locator('article');await card.getByText('Editar registro').click();await card.getByLabel('Texto publicado').fill('<img src=x onerror=alert(1)>');await card.getByRole('button',{name:'Salvar alterações'}).click();await expect(page.locator('#notice')).toContainText('Registro administrativo salvo');
 await page.goto('/index.html');await expect(page.locator('[data-site-content="footer_tagline"]')).toHaveText('<img src=x onerror=alert(1)>');await expect(page.locator('[data-site-content="footer_tagline"] img')).toHaveCount(0);
});
test('vínculo de equipe pode ser adicionado e desativado sem apagar registro',async({page})=>{
 const state=await setup(page);let area=await section(page,'Membros das equipes');await area.getByRole('button',{name:'Adicionar jogador à equipe'}).click();await expect.poll(()=>state.tables.team_members.length).toBe(1);
 area=await section(page,'Membros das equipes');await area.getByRole('button',{name:'Desativar vínculo'}).click();await expect.poll(()=>state.tables.team_members[0].active).toBe(false);expect(state.tables.team_members).toHaveLength(1);
});

test('lote exige seleção e confirmação e não oferece Carandiru',async({page})=>{
 const state=await setup(page);const panel=page.locator('#admin-panel');
 await expect(panel.getByRole('button',{name:'Arquivar selecionados (0)',exact:true})).toBeDisabled();
 await expect(panel.locator('[data-admin-event]').filter({hasText:'Carandiru'}).getByRole('checkbox')).toHaveCount(0);
 await panel.getByRole('checkbox',{name:'Selecionar para arquivamento'}).check();
 page.once('dialog',d=>d.dismiss());await panel.getByRole('button',{name:'Arquivar selecionados (1)',exact:true}).click();expect(state.calls.filter(c=>c.name==='admin_archive_events')).toHaveLength(0);
 page.once('dialog',d=>d.accept());await panel.getByRole('button',{name:'Arquivar selecionados (1)',exact:true}).click();await expect.poll(()=>state.events[0].status).toBe('archived');expect(state.events[1].status).toBe('archived');
 expect(state.calls.find(c=>c.name==='admin_archive_events').params.p_event_ids).toEqual([state.events[0].id]);
});
