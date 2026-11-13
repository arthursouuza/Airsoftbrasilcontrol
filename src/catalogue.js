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
  body.append(location, node('p', dateTime(event.starts_at)), node('p', available(event)), node('p', money(event.price_cents), 'poster-price'));
  link.append(art, body); card.append(link);
  return card;
}
export function renderRecents(events) {
  const container = $('recent-events'); container.replaceChildren();
  const recent = [...events].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)).slice(0, 6);
  for (const event of recent) {
    const link = node('a', undefined, 'recent-card'); link.href = 'game.html?id=' + encodeURIComponent(event.id);
    const text = node('div'); text.append(node('strong', event.title), node('p', event.location));
    const icon = arrow(); icon.classList.add('recent-arrow');
    link.append(dayBadge(event.starts_at, 'recent-date'), text, icon); container.append(link);
  }
  if (!recent.length) container.append(node('p', 'Nenhum jogo encontrado. Novos jogos aparecerão aqui quando forem publicados.', 'empty-panel'));
}
export function renderTeams(teams, session, failed = false) {
  const container = $('teams-list'); container.replaceChildren();
  if (!session) {
    const panel = node('div', undefined, 'empty-panel'); panel.append(node('p', 'Entre na sua conta para conhecer os times cadastrados.'));
    const link = node('a', 'Entrar na minha conta '); link.append(arrow()); link.href = '#auth'; panel.append(link); container.append(panel); return;
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
  $('catalogue-home').hidden = true;
  const back = node('a', '← Voltar aos jogos', 'game-breadcrumb'); back.href = 'index.html#catalogue'; view.append(back);
  if (!event) {
    view.append(node('h1', 'Jogo não encontrado'), node('p', 'Este jogo não está disponível para sua conta ou não existe.'));
    return;
  }
  document.title = event.title + ' · Airsoft Brasil Control';
  const cover = node('div', undefined, 'game-cover'); const img = image(event.cover_url || event.poster_url, event.title);
  if (img) { img.loading = 'eager'; cover.append(img); }
  const heading = node('div'); heading.append(node('p', 'AIRSOFT BRASIL CONTROL', 'eyebrow'), node('h1', event.title), node('p', event.location)); cover.append(heading);
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
  section('groups', 'Grupos', event.groups || 'Grupos ainda não informados pelo organizador.');
  const schedule = section('schedule', 'Horários', event.schedule || 'Horários de início e término informados pelo organizador.');
  const times = node('div', undefined, 'game-time');
  for (const [label, value] of [['Início',event.starts_at],['Término',event.ends_at]]) {
    const time = node('div'); time.append(node('strong', label), node('p', value ? dateTime(value) : 'Não informado')); times.append(time);
  }
  schedule.append(times);
  const location = section('location', 'Localização', event.location);
  const map = node('a', 'Ver localização no mapa ', 'game-location-link'); map.append(arrow());
  map.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(event.location); map.target = '_blank'; map.rel = 'noopener noreferrer'; location.append(map);
  section('rules', 'Regras', event.rules || 'Regras ainda não informadas. Consulte o organizador antes de participar.');
  const ticket = node('aside', undefined, 'card ticket-card'); ticket.id = 'game-tickets';
  ticket.append(node('p', 'GARANTA SUA PARTICIPAÇÃO', 'eyebrow'), node('h2', 'Ingressos'), node('p', 'Inscrição individual'), node('p', money(event.price_cents), 'ticket-price'), node('p', available(event)));
  if (joined) ticket.append(node('p', 'Inscrição confirmada.'));
  else if (event.status !== 'published' || new Date(event.starts_at) <= new Date()) ticket.append(node('p', 'Inscrições indisponíveis para este jogo.'));
  else if (event.capacity != null && event.active_registration_count >= event.capacity) ticket.append(node('p', 'Lotado.'));
  else {
    const button = node('button', session ? 'Inscrever-me' : 'Entre para se inscrever');
    button.addEventListener('click', async () => {
      if (button.disabled) return; button.disabled = true;
      try { await onRegister(event); } catch (error) { onError(error); } finally { button.disabled = false; }
    }); ticket.append(button);
  }
  ticket.append(node('small', 'Uma inscrição por jogador. Pagamento combinado diretamente com o organizador; não há cobrança automática.'));
  layout.append(copy, ticket); view.append(cover, tabs, layout);
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
