// Apresentação do catálogo. Os objetos recebidos vêm exclusivamente do Supabase.
export const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((value || 0) / 100);
export const dateTime = value => new Date(value).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
const $ = id => document.getElementById(id);
function arrow() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 19 19 5M5 5h14v14'); svg.append(path); return svg;
}
export function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
export function safeImageUrl(value) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
function image(value, title) {
  const url = safeImageUrl(value);
  if (!url) return null;
  const img = document.createElement('img'); img.src = url; img.alt = title;
  img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => img.remove());
  return img;
}
function dayBadge(value, className = 'poster-date') {
  const date = new Date(value);
  const badge = node('span', String(date.getDate()).padStart(2, '0'), className);
  badge.append(node('small', date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')));
  return badge;
}
export function available(event) {
  return event.capacity == null ? 'Capacidade ainda não definida.'
    : `${Math.max(0, event.capacity - event.active_registration_count)} vaga(s) disponível(is) de ${event.capacity}.`;
}
export function posterCard(event) {
  const card = node('article', undefined, 'card poster-card');
  const link = node('a', undefined, 'poster-link'); link.href = 'game.html?id=' + encodeURIComponent(event.id);
  link.setAttribute('aria-label', `Ver jogo: ${event.title}`);
  const art = node('div', undefined, 'poster-art'); art.setAttribute('aria-hidden', 'true');
  const poster = image(event.poster_url || event.cover_url, ''); if (poster) art.append(poster);
  art.append(node('div', undefined, 'poster-shade'), dayBadge(event.starts_at));
  const type = node('div', undefined, 'poster-type'); type.append(node('small', 'AIRSOFT BRASIL CONTROL'), document.createTextNode(event.title)); art.append(type);
  const body = node('div', undefined, 'poster-body');
  body.append(node('h3', event.title));
  const location = node('p', undefined, 'poster-meta'); location.append(node('span', '⌖'), document.createTextNode(event.location));
  const caption = new Date(event.starts_at).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + event.location;
  body.append(location, node('p', caption, 'poster-date-text'), node('p', available(event), 'poster-availability'), node('p', money(event.price_cents), 'poster-price'));
  link.append(art, body); card.append(link);
  return card;
}
export function renderRecents(events) {
  const container = $('recent-events'); container.replaceChildren();
  const recent = [...events].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)).slice(0, 6);
  $('show-more-recent').hidden = recent.length < 2;
  for (const event of recent) {
    const card = posterCard(event); card.classList.add('recent-poster'); container.append(card);
  }
  if (!recent.length) container.append(node('p', 'Nenhum jogo encontrado. Novos jogos aparecerão aqui quando forem publicados.', 'empty-panel'));
}
export function renderTeams(teams, session, failed = false) {
  const container = $('teams-list'); container.replaceChildren();
  if (!session) {
    const panel = node('div', undefined, 'empty-panel'); panel.append(node('p', 'Entre na sua conta para conhecer os times cadastrados.'));
    const link = node('a', 'Entrar na minha conta '); link.append(arrow()); link.href = 'login.html'; panel.append(link); container.append(panel); return;
  }
  if (failed) { container.append(node('p', 'Não foi possível carregar os times. Atualize a página para tentar novamente.', 'empty-panel')); return; }
  for (const team of teams) {
    const card = node('article', undefined, 'card team-card');
    const initials = team.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('pt-BR');
    const text = node('div'); text.append(node('h3', team.name), node('p', team.description || 'Time de Airsoft.'));
    card.append(node('span', initials, 'team-monogram'), text); container.append(card);
  }
  if (!teams.length) container.append(node('p', 'Ainda não há times cadastrados.', 'empty-panel'));
}
export function renderGame(event, { session, joined, onRegister, onError }) {
  const view = $('game-view'); view.replaceChildren(); view.hidden = false;
  const back = node('a', '← Voltar aos jogos', 'game-breadcrumb'); back.href = 'jogos.html'; view.append(back);
  if (!event) {
    view.append(node('h1', 'Jogo não encontrado'), node('p', 'Este jogo não está disponível para sua conta ou não existe.'));
    return;
  }
  document.title = event.title + ' · Airsoft Brasil Control';
  const cover = node('div', undefined, 'game-cover'); const img = image(event.cover_url || event.poster_url, event.title);
  if (img) { img.loading = 'eager'; cover.append(img); }
  const heading = node('div');
  const longDate = new Date(event.starts_at).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const place = node('p', undefined, 'game-cover-location'); place.append(document.createTextNode(event.location));
  if (Number.isInteger(event.active_registration_count)) place.append(node('span', ` · ${event.active_registration_count} inscrito(s)`, 'confirmed-count'));
  heading.append(node('p', longDate, 'game-date'), node('h1', event.title), place); cover.append(heading);
  const share = node('button', 'Compartilhar', 'share-game'); share.type = 'button'; share.setAttribute('aria-label', 'Compartilhar jogo');
  share.addEventListener('click', async () => {
    const url = new URL('game.html', window.location.href); url.searchParams.set('id', event.id);
    try {
      if (navigator.share) await navigator.share({ title: event.title, url: url.href });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url.href); share.textContent = 'Link copiado'; }
      else { share.textContent = 'Copie o endereço da página'; }
    } catch (error) { if (error.name !== 'AbortError') share.textContent = 'Compartilhamento indisponível'; }
  }); cover.append(share);
  const tabs = node('nav', undefined, 'game-tabs'); tabs.setAttribute('aria-label', 'Seções do jogo');
  for (const [id, title] of [['about','Sobre'],['tickets','Ingressos'],['groups','Grupos'],['schedule','Horários'],['location','Localização'],['rules','Regras']]) {
    const link = node('a', title); link.href = '#game-' + id; tabs.append(link);
  }
  const layout = node('div', undefined, 'game-layout'), copy = node('div', undefined, 'game-copy');
  function section(id, title, text) {
    const element = node('section'); element.id = 'game-' + id;
    element.append(node('h2', title), node('p', text)); copy.append(element); return element;
  }
  section('about', 'Sobre o jogo', event.description || 'Descrição ainda não informada pelo organizador.');
  section('groups', 'Grupos de combate', event.groups || 'Grupos ainda não informados pelo organizador.');
  const schedule = section('schedule', 'Horários', event.schedule || 'Horários de início e término informados pelo organizador.');
  const times = node('div', undefined, 'game-time');
  for (const [label, value] of [['Horário de início',event.starts_at],['Horário de término',event.ends_at]]) {
    const time = node('div');
    time.append(node('strong', label), node('p', value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Não informado'));
    times.append(time);
  } schedule.append(times);
  const location = section('location', 'Localização', event.location);
  const map = node('a', 'Abrir localização no Maps ', 'game-location-link'); map.append(arrow());
  map.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(event.location); map.target = '_blank'; map.rel = 'noopener noreferrer'; location.append(map);
  const locationRow = node('div', undefined, 'location-data'); locationRow.append(node('span', 'Nome do local'), node('strong', event.location)); location.append(locationRow);
  section('rules', 'Regras', event.rules || 'Regras ainda não informadas. Consulte o organizador antes de participar.');
  let pending = false;
  const actions = [];
  function registrationAction() {
    if (joined) return node('p', 'Inscrição confirmada.', 'registration-state');
    if (event.status !== 'published' || new Date(event.starts_at) <= new Date()) return node('p', 'Inscrições indisponíveis para este jogo.', 'registration-state');
    if (event.capacity != null && event.active_registration_count >= event.capacity) return node('p', 'Lotado.', 'registration-state');
    const label = session ? 'Inscrever-me' : 'Entre para se inscrever';
    const button = node('button', label, 'game-register-action'); button.setAttribute('aria-label', label); actions.push(button);
    button.addEventListener('click', async () => {
      if (pending) return; pending = true; actions.forEach(action => { action.disabled = true; });
      try { await onRegister(event); } catch (error) { onError(error); }
      finally { pending = false; actions.forEach(action => { action.disabled = false; }); }
    }); return button;
  }
  const availability = node('div', undefined, 'game-availability'); availability.append(registrationAction());
  const ticket = node('aside', undefined, 'card ticket-card'); ticket.id = 'game-tickets';
  ticket.append(node('p', 'GARANTA SUA PARTICIPAÇÃO', 'eyebrow'), node('h2', 'Ingressos'));
  const option = node('div', undefined, 'ticket-option');
  const symbol = arrow(); symbol.querySelector('path').setAttribute('d', 'M3 7h18v4a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Zm6 0v3m0 2v2m0 2v2'); symbol.classList.add('ticket-symbol');
  const rowArrow = arrow(); rowArrow.classList.add('ticket-arrow');
  option.append(symbol, node('p', 'Inscrição individual', 'ticket-name'), node('p', money(event.price_cents), 'ticket-price'), rowArrow);
  const ticketAction = registrationAction();
  if (ticketAction.tagName === 'BUTTON') option.append(ticketAction);
  ticket.append(option, node('p', available(event), 'ticket-availability'));
  if (ticketAction.tagName !== 'BUTTON') ticket.append(ticketAction);
  ticket.append(node('small', 'Uma inscrição por jogador. Pagamento combinado diretamente com o organizador; não há cobrança automática.'));
  layout.append(copy, availability, ticket); view.append(cover, tabs, layout);
}
export function metadataEditor(event, onSave, onError) {
  if (!Object.hasOwn(event, 'poster_url')) return null;
  const details = node('details', undefined, 'metadata-form'); details.append(node('summary', 'Editar apresentação do jogo'));
  const form = node('form');
  for (const [name, label, type] of [['poster_url','URL do cartaz','url'],['cover_url','URL da capa','url'],['groups','Grupos','textarea'],['schedule','Programação','textarea'],['rules','Regras','textarea']]) {
    const field = node('label', label); const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') { input.type = type; input.placeholder = 'https://'; input.pattern = 'https://.*'; }
    input.name = name; input.value = event[name] || ''; input.maxLength = type === 'textarea' ? 20000 : 2048;
    field.append(input); form.append(field);
  }
  const submit = node('button', 'Salvar apresentação'); submit.type = 'submit'; form.append(submit);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (submit.disabled) return; submit.disabled = true;
    const data = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim() || null]));
    try { await onSave(data); } catch (error) { onError(error); } finally { submit.disabled = false; }
  }); details.append(form); return details;
}
