const {test,expect}=require('@playwright/test');
const host='https://nzgpceglyxwtukrbdkam.supabase.co';
async function setup(page, admin=true, fail=false) {
 const user={id:'76788b2d-a0a7-4423-8ef3-63f0b1975a7d',email:'admin@example.test',aud:'authenticated',role:'authenticated',user_metadata:{}};
 const events=[{id:'11111111-1111-4111-8111-111111111111',organizer_id:'other',title:'Evento isolado',status:'draft'}, {id:'22222222-2222-4222-8222-222222222222',organizer_id:'other',title:'Operação Carandiru',status:'archived'}];
 const calls=[];
 await page.route(host+'/**',async route=>{
  const req=route.request(),u=new URL(req.url());let data=[],status=200;
  if(u.pathname.endsWith('/token')) data={access_token:'test-token',refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user};
  else if(u.pathname.endsWith('/profiles'))data=[{id:user.id}];
  else if(u.pathname.endsWith('/is_site_admin'))data=admin;
  else if(u.pathname.includes('/rpc/admin_')) {
   const params=req.postDataJSON();calls.push({name:u.pathname.split('/').pop(),params});
   if(fail){status=400;data={message:'Exclusão bloqueada: existem inscrições ou pagamentos vinculados'};}
   else { const event=events.find(e=>e.id===params.p_event_id);
    if(u.pathname.endsWith('admin_archive_event')){event.archived_from_status=event.status;event.status='archived';}
    else if(u.pathname.endsWith('admin_restore_event'))event.status=event.archived_from_status;
    else events.splice(events.indexOf(event),1);
    data=null;
   }
  } else if(u.pathname.endsWith('/events'))data=u.searchParams.has('organizer_id')||u.searchParams.has('status')?[]:events;
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/login.html');await page.getByLabel('E-mail',{exact:true}).fill(user.email);await page.getByLabel('Senha',{exact:true}).fill('Test-password!');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.locator('#account')).toBeVisible();
 return {calls,events};
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
