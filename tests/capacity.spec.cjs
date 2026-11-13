const {test,expect}=require('@playwright/test');
const host='https://nzgpceglyxwtukrbdkam.supabase.co';
const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.test',aud:'authenticated',role:'authenticated',user_metadata:{display_name:'Teste'}};
async function setup(page,full=false){
 const event={id:'22222222-2222-4222-8222-222222222222',organizer_id:user.id,title:'Teste vagas',location:'Campo isolado',description:'Teste',price_cents:0,starts_at:'2030-12-01T09:00:00Z',status:'published',capacity:1,active_registration_count:full?1:0};
 const registrations=[];const patches=[];
 await page.route(host+'/**',async route=>{
  const r=route.request(),u=new URL(r.url()),method=r.method();let data=[],status=200;
  if(u.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user};
  else if(u.pathname.endsWith('/profiles'))data=[{id:user.id}];
  else if(u.pathname.endsWith('/events')){
   if(method==='POST'){Object.assign(event,r.postDataJSON(),{active_registration_count:0});status=201;data=null;}
   else if(method==='PATCH'){
    const body=r.postDataJSON();patches.push(body);
    if(body.capacity!==null&&body.capacity<event.active_registration_count){status=400;data={code:'23514',message:'constraint'};}
    else{Object.assign(event,body);data=null;}
   }else data=[event];
  }else if(u.pathname.endsWith('/registrations')){
   if(method==='POST'){
    const row={id:'registration-'+registrations.length,event_id:event.id,player_id:user.id,status:'active',created_at:new Date().toISOString(),events:{title:event.title,starts_at:event.starts_at}};
    registrations.push(row);event.active_registration_count++;status=201;data=null;
   }else if(method==='PATCH'){
    const id=u.searchParams.get('id').slice(3),row=registrations.find(r=>r.id===id);patches.push({query:u.search,body:r.postDataJSON()});
    if(row?.status==='active'){row.status='cancelled';event.active_registration_count--;data=[row];}else data=[];
   }else data=registrations.filter(r=>u.searchParams.get('status')!=='eq.active'||r.status==='active');
  }
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });return {event,registrations,patches};
}
async function login(page){await page.goto('/login.html');await page.getByLabel('E-mail',{exact:true}).fill(user.email);await page.getByLabel('Senha',{exact:true}).fill('Somente-mock-123!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.locator('#account')).toBeVisible();}
test('inscrição, cancelamento e reinscrição preservam histórico e liberam vaga (API simulada)',async({page})=>{
 const state=await setup(page);page.on('dialog',d=>d.accept());await page.goto('/connected.html');await login(page);await page.goto('/index.html');
 await page.locator('#events .poster-link').click();await page.locator('#game-tickets').getByRole('button',{name:'Inscrever-me',exact:true}).click();await expect(page.locator('#game-tickets')).toContainText('Inscrição confirmada');
 await page.goto('/connected.html');await page.locator('#my-registrations').getByRole('button',{name:'Cancelar minha inscrição'}).click();await expect(page.locator('#my-registrations')).toContainText('Inscrição cancelada');await page.goto('/index.html');await expect(page.locator('#events')).toContainText('1 vaga(s)');expect(state.event.active_registration_count).toBe(0);expect(state.patches[0].query).toContain('status=eq.active');
 await page.locator('#events .poster-link').click();await page.locator('#game-tickets').getByRole('button',{name:'Inscrever-me',exact:true}).click();await page.goto('/connected.html');await expect(page.locator('#my-registrations')).toContainText('Inscrição ativa');expect(state.registrations).toHaveLength(2);expect(state.registrations[0].status).toBe('cancelled');expect(state.event.active_registration_count).toBe(1);
 await page.locator('#my-events').getByRole('button',{name:'Ver inscrições ativas'}).click();await page.locator('#my-events').getByRole('button',{name:/Cancelar inscrição registra/}).click();await page.goto('/index.html');await expect(page.locator('#events')).toContainText('1 vaga(s)');
});
test('lotação e erro de redução de capacidade são exibidos (API simulada)',async({page})=>{
 const state=await setup(page,true);await page.goto('/index.html');await expect(page.locator('#events')).toContainText('Lotado.');await expect(page.locator('#events').getByRole('button',{name:'Inscrever-me',exact:true})).toHaveCount(0);
 await login(page);const input=page.locator('#my-events').getByLabel('Capacidade de vagas');await expect(input).toHaveAttribute('min','1');
 await page.locator('#my-events .event-capacity-form').evaluate(f=>f.noValidate=true);await input.fill('0');await page.getByRole('button',{name:'Atualizar capacidade'}).click();await expect(page.locator('#notice')).toContainText('capacidade do evento ou grupo não pode ser menor');expect(state.event.capacity).toBe(1);
 await input.fill('2');await page.getByRole('button',{name:'Atualizar capacidade'}).click();await expect(page.locator('#notice')).toHaveText('Capacidade atualizada.');await page.goto('/index.html');await expect(page.locator('#events')).toContainText('1 vaga(s) disponível(is) de 2');
});

test('roteiro de revisão com login manual não precisa ler senha ou token (API simulada)',async({page})=>{
 const {runSignedInReview}=require('../scripts/manual-review.cjs');
 const state=await setup(page);await page.goto('/connected.html');await login(page);
 await runSignedInReview(page);
 expect(state.event.status).toBe('cancelled');expect(state.event.active_registration_count).toBe(0);expect(state.registrations.every(r=>r.status==='cancelled')).toBe(true);
});
