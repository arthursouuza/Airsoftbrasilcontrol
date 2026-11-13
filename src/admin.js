import { renderConsole } from './admin-console.js';
// A autorização efetiva é sempre conferida pelo banco em cada RPC.
export async function renderAdmin(db, container, isCurrent, reload, notice) {
  container.hidden = true;
  container.replaceChildren();
  const permission = await db.rpc('is_site_admin');
  if (!isCurrent()) return;
  if (permission.error) {
    // Migração ausente ou acesso indisponível: falha fechada.
    container.hidden = false;
    container.textContent = 'Administração indisponível. Verifique a migração 005 e sua conexão.';
    return;
  }
  if (permission.data !== true) return;
  container.hidden = false;
  const heading = document.createElement('h2'); heading.textContent = 'Modo Deus · Administração';
  container.append(heading);
  const info = document.createElement('p');
  info.textContent = 'Arquivar oculta o evento do catálogo e mantém inscrições e pagamentos. A restauração de eventos passados retorna a rascunho. A exclusão exige arquivamento prévio e sua aprovação pelo título; eventos com inscrições ou pagamentos são preservados.';
  container.append(info);
  const rows = [];
  for (let start = 0; ; start += 100) {
    const result = await db.from('events').select('*').order('id').range(start, start + 99);
    if (!isCurrent()) return;
    if (result.error) throw result.error;
    rows.push(...result.data);
    if (result.data.length < 100) break;
  }
  const protectedIds = new Set(['b581d679-53ba-4479-8e92-9b44b7ab49b6']);
  const protection = await db.from('protected_events').select('event_id');
  if (!isCurrent()) return;
  if (protection.error) throw protection.error;
  for (const row of protection.data || []) protectedIds.add(row.event_id);
  const filter = document.createElement('select'); filter.setAttribute('aria-label', 'Filtrar eventos administrativos');
  for (const [value, label] of [['all','Todos'],['archived','Arquivados'],['published','Publicados'],['draft','Rascunhos'],['cancelled','Cancelados']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; filter.append(option);
  }
  const selected = new Set();
  const bulk = document.createElement('button');bulk.textContent = 'Arquivar selecionados (0)';bulk.disabled = true;
  bulk.addEventListener('click',async () => {
    if(bulk.disabled || !isCurrent())return;
    const events=rows.filter(e=>selected.has(e.id));
    if(!window.confirm(`Arquivar ${events.length} evento(s)? Inscrições e pagamentos serão preservados.\n\n${events.map(e=>e.title).join('\n')}`))return;
    bulk.disabled=true;
    try {
      const result=await db.rpc('admin_archive_events',{p_event_ids:events.map(e=>e.id)});
      if(!isCurrent())return;if(result.error)throw result.error;
      notice('Eventos arquivados. Inscrições e pagamentos preservados.');await reload();
    } catch(error){if(isCurrent())notice(error.message,true);}
    finally {bulk.disabled=selected.size===0;}
  });
  container.append(bulk);
  const list = document.createElement('div'); list.className = 'cards'; container.append(filter, list);
  function draw() {
    list.replaceChildren();
    for (const event of rows.filter(e => filter.value === 'all' || e.status === filter.value)) {
      const card = document.createElement('article'); card.className = 'card';
      card.dataset.adminEvent = event.id;
      const protectedEvent = protectedIds.has(event.id) || /carandiru/i.test(event.title);
      const title = document.createElement('h3'); title.textContent = event.title;
      const status = document.createElement('p'); status.textContent = `Estado: ${event.status} · ID: ${event.id}`;
      card.append(title, status);
      if(!protectedEvent && event.status !== 'archived') {
        const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(event.id);
        checkbox.addEventListener('change',()=>{if(checkbox.checked)selected.add(event.id);else selected.delete(event.id);bulk.textContent=`Arquivar selecionados (${selected.size})`;bulk.disabled=selected.size===0;});
        label.append(checkbox,document.createTextNode(' Selecionar para arquivamento'));card.append(label);
      }
      function control(label, rpc, approve) {
        const button = document.createElement('button'); button.textContent = label;
        button.addEventListener('click', async () => {
          if (button.disabled || !isCurrent()) return;
          const params = approve(); if (!params) return;
          card.querySelectorAll('button').forEach(b => { b.disabled = true; });
          try {
            const result = await db.rpc(rpc, params);
            if (!isCurrent()) return;
            if (result.error) throw result.error;
            notice('Operação administrativa concluída.'); await reload();
          } catch (error) {
            if (isCurrent()) notice(error.message || 'Falha na operação administrativa.', true);
          } finally { card.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
        });
        card.append(button);
      }
      if (protectedEvent) { const p = document.createElement('p'); p.textContent = 'Operação protegida: permanece publicada.'; card.append(p); }
      else control(event.status === 'archived' ? 'Restaurar evento' : 'Arquivar evento',
        event.status === 'archived' ? 'admin_restore_event' : 'admin_archive_event',
        () => window.confirm(`${event.status === 'archived' ? 'Restaurar' : 'Arquivar'} “${event.title}”? Inscrições e pagamentos serão mantidos.`) ? { p_event_id: event.id } : null);
      if (event.status === 'archived' && !protectedEvent) {
        control('Solicitar exclusão definitiva', 'admin_delete_event', () => {
          const confirmation = window.prompt(`Aprova excluir definitivamente “${event.title}” e seus grupos? Esta ação é irreversível. Confira o backup antes de aprovar. Eventos com inscrições ou pagamentos serão bloqueados. Digite o título exato para aprovar:`);
          if (confirmation !== event.title) {
            if (confirmation !== null) notice('Exclusão não autorizada: o título não confere.', true);
            return null;
          }
          return { p_event_id: event.id, p_confirm_title: confirmation };
        });
      }
      list.append(card);
    }
    if (!list.children.length) list.textContent = 'Nenhum evento neste filtro.';
  }
  const refreshEditors = () => renderConsole(db, container, isCurrent, reload, notice, rows);
  filter.addEventListener('change', () => { container.querySelector('.admin-console')?.remove(); draw(); refreshEditors().catch(error => notice(error.message, true)); }); draw();
  await refreshEditors();
}
