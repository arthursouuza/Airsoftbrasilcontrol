import { createClient } from '@supabase/supabase-js';
import { validateConfig } from './config.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText = date => new Date(date).toLocaleString('pt-BR', { dateStyle:'medium', timeStyle:'short' });
let client, user = null, profile = null, events = [], registrations = [], busy = false, generation = 0, rosterGeneration = 0;
function notify(message) { $('#message').textContent = message; }
function errorText(error) {
  if (error.code === '23505') return 'Você já está inscrito neste evento.';
  if (error.message?.includes('EVENT_UNAVAILABLE')) return 'Evento lotado, encerrado ou passado. Atualize a lista.';
  if (error.code === '23514') return 'Dados inválidos ou capacidade menor que as inscrições existentes.';
  if (error.code === '42501') return 'Acesso negado. Confira a sessão e a propriedade do recurso.';
  if (error.code === '23503') return 'Salve seu perfil antes de se inscrever; o evento também pode estar indisponível.';
  if (error.code === 'invalid_credentials') return 'E-mail ou senha inválidos.';
  if (error.code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.';
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) return 'Limite de tentativas atingido. Aguarde antes de tentar novamente.';
  if (error.code === 'weak_password') return 'Escolha uma senha mais forte, conforme as regras do projeto.';
  return 'Não foi possível concluir a operação. Verifique a conexão, sua sessão e a configuração do projeto. Nenhum sucesso foi confirmado.';
}
function checked(result) { if (result.error) throw result.error; return result.data; }
function controls() {
  for (const f of document.querySelectorAll('#auth-panels fieldset')) f.disabled = !client || busy;
  $('#refresh').disabled = !client || busy;
  $('#new-event').disabled = !user || busy;
  $('#manage-event').disabled = !user || busy;
  for (const button of document.querySelectorAll('#account-panel button, #event-form button, #password-form button, [data-register], [data-cancel], [data-edit]')) button.disabled = busy;
}
async function action(task) {
  if (busy) return;
  busy = true; controls();
  try { await task(); } catch(error) { notify(errorText(error)); }
  finally { busy = false; controls(); }
}
function resetPrivate() {
  generation++; rosterGeneration++; profile = null; registrations = [];
  $('#profile-form').reset(); $('#event-form').reset();
  $('#event-dialog').close(); $('#password-form').hidden = true;
  $('#registration-list').textContent = ''; $('#manage-details').textContent = '';
}
function render() {
  $('#auth-panels').hidden = Boolean(user);
  $('#account-panel').hidden = !user;
  $('#session-info').textContent = user ? `Sessão autenticada: ${user.email}` : 'Sem sessão autenticada.';
  const query = $('#busca').value.trim().toLocaleLowerCase('pt-BR');
  const list = events.filter(e => `${e.title} ${e.location}`.toLocaleLowerCase('pt-BR').includes(query) && ($('#disponibilidade').value !== 'abertos' || available(e)));
  $('#event-list').innerHTML = list.map(e => {
    const mine = registrations.some(r => r.event_id === e.id);
    return `<article class="event-card"><div class="event-art"><span class="tag">${esc(e.mode)}</span></div><div class="event-body"><span class="eyebrow">${esc(dateText(e.starts_at))}</span><h3>${esc(e.title)}</h3><p>${esc(e.location)}</p><p class="description">${esc(e.description)}</p><div class="event-meta"><span>${e.closed ? 'Inscrições encerradas' : new Date(e.starts_at) <= new Date() ? 'Evento passado' : `${e.capacity-e.occupied} vagas disponíveis`}</span><span>${e.occupied}/${e.capacity}</span></div><progress value="${e.occupied}" max="${e.capacity}" aria-label="Vagas ocupadas"></progress>${mine ? '<p>Você está inscrito.</p>' : available(e) ? `<button data-register="${esc(e.id)}">${user ? 'Inscrever-me' : 'Entrar para se inscrever'}</button>` : '<p>Inscrições indisponíveis.</p>'}</div></article>`;
  }).join('') || '<p>Nenhum evento encontrado no projeto conectado.</p>';
  $('#my-registrations').innerHTML = !user ? '<p>Entre para consultar suas inscrições.</p>' : registrations.map(r => {
    const e = events.find(e => e.id === r.event_id);
    return `<div class="registration"><div><strong>${esc(e?.title || 'Evento')}</strong><p>${e ? esc(dateText(e.starts_at)) : ''} · Sem pagamento</p></div><button class="secondary" data-cancel="${esc(r.id)}">Cancelar minha inscrição</button></div>`;
  }).join('') || '<p>Você não possui inscrições ativas.</p>';
  const own = user ? events.filter(e => e.organizer_id === user.id) : [];
  const current = $('#manage-event').value;
  $('#manage-event').innerHTML = own.map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('');
  if (own.some(e => e.id === current)) $('#manage-event').value = current;
  $('#stats').innerHTML = user ? [['Meus eventos', own.length], ['Inscritos nos meus eventos', own.reduce((n,e) => n+e.occupied,0)], ['Minhas inscrições', registrations.length]].map(([label,n])=>`<div class="stat"><b>${n}</b>${label}</div>`).join('') : '<p>Entre para gerenciar seus eventos.</p>';
  controls();
}
const available = e => !e.closed && new Date(e.starts_at) > new Date() && e.occupied < e.capacity;
async function allRows(table, query) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const data = checked(await query(client.from(table).select('*')).order('id').range(offset, offset+499));
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
async function refresh() {
  const ticket = ++generation, identity = user;
  const [eventRows, profileRow, ownRegistrations] = await Promise.all([
    allRows('events', q => q),
    identity ? client.from('profiles').select('*').eq('id',identity.id).maybeSingle().then(checked) : null,
    identity ? allRows('registrations', q => q.eq('player_id',identity.id)) : []
  ]);
  if (ticket !== generation) return;
  events = eventRows.sort((a,b) => a.starts_at.localeCompare(b.starts_at)); profile = profileRow; registrations = ownRegistrations;
  if (profile) { $('#profile-form').elements.display_name.value = profile.display_name; $('#profile-form').elements.team.value = profile.team; }
  render(); await renderManager();
}
async function renderManager() {
  const ticket = ++rosterGeneration;
  const e = events.find(e => e.id === $('#manage-event').value && e.organizer_id === user?.id);
  $('#registration-list').textContent = '';
  $('#manage-details').innerHTML = e ? `<div class="manage-heading"><div><h3>${esc(e.title)}</h3><p>${e.occupied} inscritos · ${e.capacity-e.occupied} vagas livres · ${e.closed?'Encerrado':'Aberto'}</p></div><button class="secondary" data-edit="${esc(e.id)}">Editar evento</button></div>` : '';
  controls();
  if (!e) return;
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const data = checked(await client.rpc('event_roster', { target_event:e.id }).range(offset,offset+499));
    rows.push(...data); if (data.length < 500) break;
  }
  if (ticket !== rosterGeneration) return;
  $('#registration-list').innerHTML = rows.map(r => `<div class="registration"><div><strong>${esc(r.display_name)}</strong><p>${esc(r.team || 'Sem equipe')} · ${esc(dateText(r.registered_at))}</p></div></div>`).join('') || '<p>Nenhum inscrito neste evento.</p>';
}
$('#busca').addEventListener('input',render);
$('#disponibilidade').addEventListener('change',render);
$('#manage-event').addEventListener('change',()=>action(renderManager));
$('#refresh').addEventListener('click',()=>action(refresh));
$('#login-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{
  const f=event.target;
  checked(await client.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value}));
  f.reset(); notify('Login realizado. Carregando dados do projeto.');
});});
$('#register-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{
  const f=event.target;
  const data=checked(await client.auth.signUp({email:f.elements.email.value.trim(),password:f.elements.password.value,options:{emailRedirectTo:new URL('connected.html',location.href).href}}));
  f.reset(); notify(data.session ? 'Conta autenticada. Salve seu perfil de jogador.' : 'Se o cadastro puder ser concluído, você receberá um e-mail. Confirme no mesmo navegador e depois entre.');
});});
$('#forgot-password').addEventListener('click',()=>action(async()=>{
  const email=$('#login-form').elements.email;
  if(!email.value || !email.reportValidity()) return notify('Informe seu e-mail no formulário de login.');
  checked(await client.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:new URL('connected.html',location.href).href}));
  notify('Se houver uma conta para esse e-mail, você receberá as instruções de recuperação. Abra no mesmo navegador.');
}));
$('#password-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{
  checked(await client.auth.updateUser({password:event.target.elements.password.value}));
  event.target.reset(); event.target.hidden=true; notify('Senha atualizada.');
});});
$('#logout').addEventListener('click',()=>action(async()=>{
  checked(await client.auth.signOut({scope:'local'})); user=null; resetPrivate(); render(); notify('Sessão encerrada neste dispositivo.');
}));
$('#profile-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{
  if(!user) throw Error('AUTH_REQUIRED');
  const f=event.target, values={display_name:f.elements.display_name.value.trim(),team:f.elements.team.value.trim()};
  const request=profile ? client.from('profiles').update(values).eq('id',user.id) : client.from('profiles').insert({id:user.id,...values});
  checked(await request.select('id').single()); await refresh(); notify('Perfil salvo no banco compartilhado.');
});});
function editEvent(id) {
  if(!user) return;
  const e=events.find(e=>e.id===id && e.organizer_id===user.id);
  if(id && !e) return notify('Você não pode editar este evento.');
  const f=$('#event-form'); f.reset(); $('#event-title').textContent=e?'Editar meu evento':'Criar meu evento';
  for(const key of ['id','title','location','mode','capacity','description']) f.elements[key].value=e?e[key]:({mode:'Milsim',capacity:30}[key]??'');
  if(e){const d=new Date(e.starts_at); f.elements.date.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
  f.elements.closed.checked=e?.closed||false; $('#event-dialog').showModal();
}
$('#new-event').addEventListener('click',()=>editEvent());
$('#event-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{
  if(!user) throw Error('AUTH_REQUIRED');
  const f=event.target, id=f.elements.id.value;
  const values={title:f.elements.title.value.trim(),location:f.elements.location.value.trim(),mode:f.elements.mode.value,description:f.elements.description.value.trim(),capacity:Number(f.elements.capacity.value),starts_at:new Date(f.elements.date.value).toISOString(),closed:f.elements.closed.checked};
  const request=id?client.from('events').update(values).eq('id',id).eq('organizer_id',user.id):client.from('events').insert({...values,organizer_id:user.id});
  const saved=checked(await request.select('id').single()); $('#event-dialog').close(); await refresh(); $('#manage-event').value=saved.id; await renderManager(); notify('Evento salvo no banco compartilhado.');
});});
document.addEventListener('click',event=>{
  const button=event.target.closest('button'); if(!button)return;
  if(button.dataset.close) $('#'+button.dataset.close).close();
  if(button.dataset.edit) editEvent(button.dataset.edit);
  if(button.dataset.register) action(async()=>{
    if(!user){$('#conta').scrollIntoView();$('#login-form input').focus();return notify('Entre para se inscrever.');}
    if(!profile){$('#profile-form input').focus();return notify('Salve seu perfil de jogador antes de se inscrever.');}
    if(!confirm('Confirmar sua inscrição neste evento? Não há pagamento nesta etapa.')) return;
    checked(await client.from('registrations').insert({event_id:button.dataset.register,player_id:user.id}).select('id').single());
    await refresh(); notify('Inscrição confirmada pelo banco. Nenhuma cobrança foi gerada.');
  });
  if(button.dataset.cancel) action(async()=>{
    if(!user || !confirm('Cancelar sua inscrição e liberar a vaga?')) return;
    const rows=checked(await client.from('registrations').delete().eq('id',button.dataset.cancel).eq('player_id',user.id).select('id'));
    await refresh(); notify(rows.length?'Inscrição cancelada. Vaga liberada.':'Inscrição já cancelada ou indisponível.');
  });
});
async function start() {
  try {
    const response=await fetch(new URL('supabase-config.json',location.href),{cache:'no-store'});
    if(!response.ok) throw Error('CONFIG_MISSING');
    const config=validateConfig(await response.json());
    client=createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true,storageKey:`abc-auth-${new URL(config.url).hostname}`}});
    $('#connection-title').textContent='INTEGRAÇÃO EM VALIDAÇÃO';
    $('#connection-info').textContent='Projeto configurado. A configuração não comprova homologação. Dados desta página usam Supabase; pagamentos não disponíveis.';
    client.auth.onAuthStateChange((event,session)=>{
      if(user?.id!==session?.user?.id){resetPrivate();user=session?.user??null;render();}
      if(event==='PASSWORD_RECOVERY') $('#password-form').hidden=false;
      // Do not await Supabase requests inside its auth lock callback.
      if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event)) setTimeout(()=>{refresh().catch(error=>notify(errorText(error)));},0);
    });
    render(); await refresh();
  } catch(error) {
    if(!client){$('#connection-title').textContent='INTEGRAÇÃO NÃO CONECTADA';$('#connection-info').textContent='Configure a URL e a chave pública do projeto conforme docs/SUPABASE.md. Nenhuma operação remota disponível. A demonstração local continua separada.';}
    else notify(errorText(error));
    controls();
  }
}
start();
