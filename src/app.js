import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, emailRedirectUrl } from './config.js';
import { dateTime, posterCard, renderRecents, renderTeams, renderGame, metadataEditor } from './catalogue.js';
import { renderAdmin } from './admin.js';
import { groupManager } from './combat-groups.js';
import { coverUploader } from './event-media.js';
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);
let session = null;
let generation = 0;
let combatGroups = [];
let groupsReady = false;
let groupsFailure = null;
const page = document.body.dataset.page;
const gamePage = page === 'game';
const cataloguePage = ['home', 'catalogue'].includes(page);
const authPage = ['login', 'signup'].includes(page);
function loginUrl(combatGroupId = null) {
  const url = new URL('login.html', location.href);
  if (gamePage) url.searchParams.set('next', 'game.html?id=' + gameId + (combatGroupId ? '&group=' + encodeURIComponent(combatGroupId) : ''));
  return url.pathname + url.search;
}
function signedInDestination() {
  const base = new URL('./', location.href);
  let next;
  try { next = new URL(new URLSearchParams(location.search).get('next') || 'connected.html', base); }
  catch { return new URL('connected.html', base).href; }
  return next.origin === base.origin && ['connected.html','game.html','index.html','jogos.html'].some(name => next.pathname === base.pathname + name) ? next.href : new URL('connected.html', base).href;
}
const gameId = new URLSearchParams(window.location.search).get('id');
const validGameId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId || '');
if (gamePage) {
  $('game-view').hidden = false;
  $('game-view').textContent = 'Carregando jogo…';
}
let filters = { title: '', location: '', date: '', search: '' };
if ($('filters-panel')) $('filters-panel').open = false;
const literalPattern = text => '%' + text.replace(/[\\%_]/g, '\\$&') + '%';
function publicEventsQuery() {
  let query = db.from('events').select('*').eq('status', 'published').gt('starts_at', new Date().toISOString()).order('starts_at');
  if (filters.search) {
    // PostgREST quoted values prevent commas/quotes becoming filter syntax.
    const quoted = '"' + literalPattern(filters.search).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    query = query.or(`title.ilike.${quoted},location.ilike.${quoted}`);
  }
  if (filters.title) query = query.ilike('title', literalPattern(filters.title));
  if (filters.location) query = query.ilike('location', literalPattern(filters.location));
  if (filters.date) {
    const start = new Date(filters.date + 'T00:00:00');
    const end = new Date(start); end.setDate(end.getDate() + 1);
    query = query.gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString());
  }
  return query;
}
function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}
function check(result) { if (result.error) throw result.error; return result.data; }
function errorMessage(error) {
  if (error.code === 'P1001') return 'Escolha um grupo de combate antes de se inscrever.';
  if (error.code === 'P1002') return 'O grupo está lotado ou indisponível. Atualize e escolha outro grupo.';
  if (error.code === 'P0001') return 'O evento está indisponível ou não há mais vagas. Atualize o catálogo.';
  if (error.code === '23514') return 'A operação não atende às regras do evento. A capacidade do evento ou grupo não pode ser menor que o número de inscrições ativas.';
  if (error.code === 'over_email_send_rate_limit') return 'O limite de envio de e-mails do Supabase foi atingido. Aguarde a liberação do serviço e tente novamente.';
  if (error.code === '23505') return 'Você já está inscrito neste evento.';
  if (error.code === '42501') return 'Sua conta não tem permissão para esta ação. Confira se entrou corretamente.';
  if (/email not confirmed/i.test(error.message)) return 'Confirme seu e-mail antes de entrar.';
  if (/invalid login credentials/i.test(error.message)) return 'E-mail ou senha incorretos.';
  if (/rate limit/i.test(error.message)) return 'Muitas tentativas. Aguarde antes de tentar novamente.';
  return error.message || 'Não foi possível concluir. Confira sua conexão e tente novamente.';
}
async function action(button, work) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try { await work(); } catch (error) { notice(errorMessage(error), true); }
  finally { if (button) button.disabled = false; }
}
function paragraph(text) { const p = document.createElement('p'); p.textContent = text; return p; }
function button(text, work) {
  const b = document.createElement('button'); b.textContent = text;
  b.addEventListener('click', () => action(b, work)); return b;
}
function card(event) {
  const article = document.createElement('article'); article.className = 'card';
  const title = document.createElement('h3'); title.textContent = event.title; article.append(title);
  article.append(paragraph(event.description), paragraph(event.location),
    paragraph(dateTime(event.starts_at)),
    paragraph(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(event.price_cents / 100)));
  article.append(paragraph(event.capacity == null ? 'Capacidade ainda não definida.'
    : `${Math.max(0, event.capacity - event.active_registration_count)} vaga(s) disponível(is) de ${event.capacity}.`));
  return article;
}
async function cancelRegistration(id) {
  if (!window.confirm('Cancelar esta inscrição? O pagamento não será estornado automaticamente.')) return;
  check(await db.from('registrations').update({ status: 'cancelled' }).eq('id', id).eq('status', 'active'));
  notice('Inscrição cancelada. O banco libera a vaga somente no primeiro cancelamento.');
  await load();
}
async function registerForEvent(event, combatGroupId = null) {
  if (groupsFailure) throw new Error('Não foi possível conferir os grupos. Atualize a página antes de se inscrever.');
  const groups = combatGroups.filter(group => group.event_id === event.id);
  if (groups.length && !gamePage) { location.assign('game.html?id=' + encodeURIComponent(event.id)); return; }
  if (!session) {
    window.location.assign(loginUrl(combatGroupId));
    return;
  }
  if (groups.length && !combatGroupId) throw new Error('Escolha um grupo de combate antes de se inscrever.');
  const registration = { event_id: event.id, player_id: session.user.id };
  if (combatGroupId) registration.combat_group_id = combatGroupId;
  check(await db.from('registrations').insert(registration));
  notice('Inscrição realizada. Combine o pagamento com o organizador.');
  await load();
}
async function load() {
  if (authPage) return;
  const current = ++generation;
  const user = session?.user;
  const [events, mine, registrations, teams, detail, groupResult] = await Promise.all([
    publicEventsQuery(),
    user ? db.from('events').select('*').eq('organizer_id', user.id).order('starts_at') : { data: [] },
    user ? db.from('registrations').select('*,events(title,starts_at,status)').eq('player_id', user.id) : { data: [] },
    user ? db.from('teams').select('id,name,description').order('created_at', { ascending: false }).limit(12) : { data: [] },
    gamePage && validGameId ? db.from('events').select('*').eq('id', gameId).limit(1) : { data: [] },
    db.from('event_combat_groups').select('*').order('created_at')
  ]);
  if (current !== generation) return;
  groupsReady = !groupResult.error;
  const missingGroups = ['42P01', 'PGRST205'].includes(groupResult.error?.code);
  groupsFailure = groupResult.error && !missingGroups ? groupResult.error : null;
  combatGroups = groupsReady ? groupResult.data || [] : [];
  if (groupsFailure) notice('Não foi possível carregar os grupos. Atualize antes de se inscrever.', true);
  const publicEvents = check(events), myEvents = check(mine), myRegistrations = check(registrations);
  const joined = new Set(myRegistrations.filter(r => r.status !== 'cancelled').map(r => r.event_id));
  if (cataloguePage) $('show-more-games').hidden = publicEvents.length < 2;
  if (page === 'home') {
    renderRecents(publicEvents);
    renderTeams(teams.data || [], session, !!teams.error);
  }
  if (gamePage) renderGame(detail.data?.[0], {
    session, joined: joined.has(gameId), ownGroupId: myRegistrations.find(row => row.event_id === gameId && row.status !== 'cancelled')?.combat_group_id,
    onChooseTeam: async groupId => {
      const registration = myRegistrations.find(row => row.event_id === gameId && row.status === 'active');
      if (!registration) throw new Error('Inscrição ativa não encontrada.');
      check(await db.rpc('choose_registration_team', { p_registration_id:registration.id,p_group_id:groupId }));
      notice('Time escolhido. Sua inscrição e pagamento foram preservados.'); await load();
    }, groups: combatGroups.filter(group => group.event_id === gameId), groupsFailure, onRegister: registerForEvent,
    onError: error => notice(errorMessage(error), true)
  });
  if (gamePage && detail.error) notice('Não foi possível carregar o jogo. Confira sua conexão e atualize a página.', true);
  if (cataloguePage) {
  $('events').replaceChildren();
  for (const e of publicEvents) {
    const element = posterCard(e);
    if (joined.has(e.id)) element.append(paragraph('Inscrição confirmada.'));
    else if (e.capacity != null && e.active_registration_count >= e.capacity) element.append(paragraph('Lotado.'));
    $('events').append(element);
  }
  const filtered = Object.values(filters).some(Boolean);
  $('filter-status').textContent = filtered ? 'Filtros aplicados ao catálogo público.' : '';
  $('location-chip-label').textContent = filters.location || 'Todo o Brasil';
  if (!publicEvents.length) $('events').append(paragraph(filtered
    ? 'Nenhum evento encontrado com esses filtros. Tente outros termos ou limpe os filtros.'
    : 'Ainda não há próximos eventos publicados.'));
  }
  if (page !== 'account') return;
  await renderAdmin(db, $('admin-panel'), () => current === generation && session?.user.id === user.id, load, notice);
  if (current !== generation) return;
  $('my-events').replaceChildren(); $('my-registrations').replaceChildren();
  for (const e of myEvents) {
    const element = card(e); element.append(paragraph({ draft: 'Rascunho', published: 'Publicado', cancelled: 'Cancelado', archived: 'Arquivado' }[e.status]));
    if (e.status === 'archived') { $('my-events').append(element); continue; }
    const presentation = metadataEditor(e, async data => {
      check(await db.from('events').update(data).eq('id', e.id));
      notice('Apresentação atualizada.'); await load();
    }, error => notice(errorMessage(error), true));
    if (presentation) element.append(presentation);
    element.append(coverUploader(db, e, async () => { notice('Capa atualizada.'); await load(); }, error => notice(errorMessage(error), true)));
    if (groupsReady) element.append(groupManager(e, combatGroups.filter(group => group.event_id === e.id), async group => {
      check(await db.rpc('save_combat_group', { p_event_id: e.id, p_name: group.name, p_capacity: group.capacity, p_group_id: group.id }));
      notice('Grupo salvo. O limite total do evento continua valendo.'); await load();
    }, error => notice(errorMessage(error), true)));
    else element.append(paragraph(groupsFailure ? 'Grupos indisponíveis. Atualize a página.' : 'Grupos de combate: aplique a migração 004 no Supabase para habilitar.'));
    element.append(paragraph(`${e.active_registration_count ?? 0} inscrição(ões) ativa(s).`));
    const capacityForm = document.createElement('form'); capacityForm.className = 'event-capacity-form';
    const capacityLabel = document.createElement('label'); capacityLabel.textContent = 'Capacidade de vagas';
    const capacityInput = document.createElement('input');
    capacityInput.type = 'number'; capacityInput.min = String(Math.max(1, e.active_registration_count ?? 0));
    capacityInput.max = '2147483647'; capacityInput.step = '1';
    capacityInput.value = e.capacity ?? ''; capacityInput.placeholder = 'Vazio: sem limite definido';
    capacityLabel.append(capacityInput); capacityForm.append(capacityLabel);
    const capacitySubmit = document.createElement('button'); capacitySubmit.type = 'submit'; capacitySubmit.textContent = 'Atualizar capacidade';
    capacityForm.append(capacitySubmit);
    capacityForm.addEventListener('submit', event => {
      event.preventDefault();
      action(capacitySubmit, async () => {
        if (e.split_teams) {
          const total = Number(capacityInput.value);
          if (!Number.isInteger(total) || total < 2 || total % 2) throw new Error('Informe um total par: metade PMC e metade CAMUFLADO.');
        }
        check(await db.from('events').update({ capacity: capacityInput.value === '' ? null : Number(capacityInput.value) }).eq('id', e.id));
        notice('Capacidade atualizada.'); await load();
      });
    });
    element.append(capacityForm);
    if (e.split_teams) { capacityInput.required = true; capacityInput.step = '2'; element.append(paragraph(`PMC: ${e.capacity/2} vagas · CAMUFLADO: ${e.capacity/2} vagas.`)); }
    else if (!combatGroups.some(group => group.event_id === e.id)) element.append(button('Configurar PMC e CAMUFLADO', async () => {
      const total = Number(capacityInput.value);
      if (!Number.isInteger(total) || total < 2 || total % 2) throw new Error('Preencha uma capacidade total par, a partir de 2.');
      check(await db.rpc('enable_split_teams', { p_event_id:e.id,p_capacity:total }));
      notice('Times configurados. As inscrições antigas foram preservadas.'); await load();
    }));
    const participants = document.createElement('div');
    element.append(button('Ver inscrições ativas', async () => {
      const rows = check(await db.from('registrations').select('*').eq('event_id', e.id).eq('status', 'active').order('created_at'));
      participants.replaceChildren();
      for (const r of rows) {
        const item = document.createElement('div');
        item.append(paragraph(`Inscrição ${r.id.slice(0, 8)} · ${dateTime(r.created_at)} · ${combatGroups.find(group => group.id === r.combat_group_id)?.name || 'Sem grupo (inscrição original)'}`),
          button(`Cancelar inscrição ${r.id.slice(0, 8)}`, () => cancelRegistration(r.id)));
        participants.append(item);
      }
      if (!rows.length) participants.append(paragraph('Nenhuma inscrição ativa.'));
    }), participants);
    if (e.status === 'draft') element.append(button('Publicar no catálogo', async () => {
      check(await db.from('events').update({ status: 'published' }).eq('id', e.id));
      notice('Evento publicado no catálogo.'); await load();
    }));
    if (e.status !== 'cancelled') element.append(button('Cancelar evento', async () => {
      if (!window.confirm('Cancelar este evento? As inscrições serão mantidas para consulta.')) return;
      check(await db.from('events').update({ status: 'cancelled' }).eq('id', e.id));
      notice('Evento cancelado.'); await load();
    }));
    $('my-events').append(element);
  }
  if (!myEvents.length) $('my-events').append(paragraph('Você ainda não criou eventos.'));
  for (const r of myRegistrations) {
    const element = document.createElement('article'); element.className = 'card';
    element.append(paragraph(r.events ? `${r.events.title} · ${dateTime(r.events.starts_at)}`
      : 'Inscrição registrada. Este evento não está disponível no catálogo.'));
    if (r.combat_group_id) element.append(paragraph('Grupo: ' + (combatGroups.find(group => group.id === r.combat_group_id)?.name || 'Grupo registrado')));
    else {
      element.append(paragraph('Sem time escolhido (inscrição original preservada).'));
      if (r.status === 'active') { const choose = document.createElement('a'); choose.href = 'game.html?id=' + encodeURIComponent(r.event_id) + '#game-groups'; choose.textContent = 'Escolher meu time'; element.append(choose); }
    }
    element.append(paragraph(r.status === 'cancelled' ? 'Inscrição cancelada.' : 'Inscrição ativa.'));
    if (r.status !== 'cancelled') element.append(button('Cancelar minha inscrição', () => cancelRegistration(r.id)));
    $('my-registrations').append(element);
  }
  if (!myRegistrations.length) $('my-registrations').append(paragraph('Você ainda não tem inscrições.'));
}
async function syncSession(next) {
  session = next;
  generation++;
  if ($('admin-panel')) { $('admin-panel').hidden = true; $('admin-panel').replaceChildren(); }
  if ($('auth')) $('auth').hidden = !!session;
  if ($('account')) $('account').hidden = !session;
  if ($('account-guest')) $('account-guest').hidden = !!session;
  $('logout').hidden = !session;
  if (session && authPage) { location.replace(signedInDestination()); return; }
  document.querySelectorAll('[data-account-link]').forEach(link => {
    link.href = session ? 'connected.html' : loginUrl();
  });
  document.querySelectorAll('[data-account-label]').forEach(label => { label.textContent = session ? 'Minha conta' : 'Entrar'; });
  document.querySelectorAll('[data-mobile-account-label]').forEach(label => { label.textContent = 'Perfil'; });
  document.querySelectorAll('[data-registration-link]').forEach(link => { link.href = session ? 'connected.html#my-registrations' : loginUrl(); });
  if ($('profile-warning')) $('profile-warning').textContent = '';
  if (session) {
    const user = session.user;
    if ($('welcome')) $('welcome').textContent = `Minha conta · ${user.user_metadata?.display_name || user.email}`;
    try {
      const rows = check(await db.from('profiles').select('id').eq('id', user.id));
      if (!rows.length) check(await db.from('profiles').insert({ id: user.id, display_name: (user.user_metadata?.display_name || user.email.split('@')[0]).slice(0, 100) }));
    } catch (error) { if ($('profile-warning')) $('profile-warning').textContent = `Não foi possível salvar seu perfil: ${errorMessage(error)}`; }
  }
  await load();
}
$('auth-form')?.addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget; const submit = event.submitter;
  action(submit, async () => {
    const values = new FormData(form), email = values.get('email').trim(), password = values.get('password');
    if (submit.value === 'signup') {
      const name = (values.get('name') || '').trim();
      if (!name) throw new Error('Informe seu nome de jogador para criar a conta.');
      const data = check(await db.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: emailRedirectUrl() } }));
      notice(data.session ? 'Conta criada.' : 'Confira seu e-mail para confirmar o cadastro. Depois, entre com sua senha.');
    } else {
      check(await db.auth.signInWithPassword({ email, password })); notice('Você entrou na sua conta.');
    }
    form.elements.password.value = '';
  });
});
$('event-form')?.addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  action(event.submitter, async () => {
    if (!session) throw new Error('Entre na sua conta para criar um evento.');
    const values = new FormData(form);
    const start = new Date(values.get('starts_at')), end = new Date(values.get('ends_at'));
    if (!(start > new Date()) || !(end > start)) throw new Error('Escolha um início no futuro e um fim posterior ao início.');
    const title = values.get('title').trim(), location = values.get('location').trim();
    if (!title || !location) throw new Error('Informe título e local do evento.');
    const total = Number(values.get('capacity'));
    if (!Number.isInteger(total) || total < 2 || total % 2) throw new Error('Informe uma capacidade total par: metade PMC e metade CAMUFLADO.');
    check(await db.from('events').insert({ organizer_id: session.user.id, title,
      location, description: values.get('description').trim(), starts_at: start.toISOString(), ends_at: end.toISOString(),
      status: values.get('status'), price_cents: Math.round(Number(values.get('price')) * 100),
      capacity: values.get('capacity') === '' ? null : Number(values.get('capacity')) }));
    form.reset(); notice('Evento salvo.'); await load();
  });
});
$('logout').addEventListener('click', () => action($('logout'), async () => {
  check(await db.auth.signOut()); notice('Você saiu da conta.');
}));
$('resend-confirmation')?.addEventListener('click', () => action($('resend-confirmation'), async () => {
  const email = $('auth-form').elements.email;
  if (!email.reportValidity()) return;
  check(await db.auth.resend({ type: 'signup', email: email.value.trim(), options: { emailRedirectTo: emailRedirectUrl() } }));
  notice('Se houver um cadastro pendente para este e-mail, você receberá um novo link de confirmação.');
}));
$('reload')?.addEventListener('click', () => action($('reload'), load));
function openSearch(field = 'title') {
  $('filters-panel').open = true;
  $('filters-panel').scrollIntoView({ block: 'start' });
  $('event-filters').elements[field].focus();
}
$('location-chip')?.addEventListener('click', () => openSearch('location'));
document.querySelectorAll('[data-search-link]').forEach(link => link.addEventListener('click', event => {
  if (!cataloguePage) return;
  event.preventDefault(); window.location.hash = 'catalogue'; openSearch();
}));
$('show-more-games')?.addEventListener('click', () => $('events').scrollBy({ left: $('events').clientWidth * .8, behavior: 'smooth' }));
$('show-more-recent')?.addEventListener('click', () => $('recent-events').scrollBy({ left: $('recent-events').clientWidth * .8, behavior: 'smooth' }));
$('event-filters')?.addEventListener('submit', event => {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  action(event.submitter, async () => {
    const dateValue = values.get('date').trim();
    let date = '';
    if (dateValue) {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateValue);
      if (!match) throw new Error('Informe a data no formato dd/mm/aaaa.');
      date = `${match[3]}-${match[2]}-${match[1]}`;
      const parsed = new Date(date + 'T12:00:00');
      if (parsed.getFullYear() !== Number(match[3]) || parsed.getMonth() + 1 !== Number(match[2]) || parsed.getDate() !== Number(match[1])) throw new Error('Informe uma data válida no formato dd/mm/aaaa.');
    }
    filters = { ...filters, title: values.get('title').trim(), location: values.get('location').trim(), date };
    await load();
  });
});
$('clear-filters')?.addEventListener('click', () => {
  action($('clear-filters'), async () => {
    $('event-filters').reset(); $('quick-search-form')?.reset(); clearTimeout(quickSearchTimer); filters = { title: '', location: '', date: '', search: '' };
    await load();
  });
});
$('recovery-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const email = event.currentTarget.elements.email.value.trim();
  action(event.submitter, async () => {
    check(await db.auth.resetPasswordForEmail(email, { redirectTo: emailRedirectUrl() }));
    notice('Se houver uma conta para este e-mail, você receberá um link para redefinir sua senha. Confira também o spam.');
  });
});
// As consultas são agendadas fora do callback do Auth para evitar bloqueio do SDK.
let authVersion = 0;
db.auth.onAuthStateChange((_event, next) => {
  const version = ++authVersion;
  setTimeout(() => { if (version === authVersion) syncSession(next).catch(error => notice(errorMessage(error), true)); }, 0);
});

if ($('forgot-password') && window.location.hash === '#forgot-password') {
  $('forgot-password').open = true;
  $('recovery-form').elements.email.focus();
}
function updateMobileNav() {
  const hash = window.location.hash;
  const active = authPage || page === 'account' && hash !== '#my-registrations' ? 'account'
    : hash === '#my-registrations' ? 'registrations' : hash === '#catalogue' || gamePage || page === 'catalogue' ? 'search' : 'home';
  document.querySelectorAll('[data-mobile]').forEach(link => {
    if (link.dataset.mobile === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', updateMobileNav); updateMobileNav();

if (!authPage && ['#auth','#forgot-password'].includes(location.hash)) location.replace(new URL('login.html' + (location.hash === '#forgot-password' ? '#forgot-password' : ''), location.href).href);
if (page === 'home' && ['#account','#my-registrations'].includes(location.hash)) location.replace(new URL('connected.html' + location.hash, location.href).href);
if (page === 'home' && location.hash === '#catalogue') openSearch();

if (authPage) document.querySelectorAll('.auth-switch a').forEach(link => { if (['login.html','cadastro.html'].some(name => link.getAttribute('href') === name)) { const target = new URL(link.href); target.search = location.search; link.href = target.href; } });

let quickSearchTimer;
function applyQuickSearch() {
  clearTimeout(quickSearchTimer);
  action(null, async () => { filters.search = $('quick-search').value.trim(); await load(); });
}
$('quick-search-form')?.addEventListener('submit', event => { event.preventDefault(); applyQuickSearch(); });
$('quick-search')?.addEventListener('input', () => { clearTimeout(quickSearchTimer); quickSearchTimer = setTimeout(applyQuickSearch, 300); });

// Conteúdo público é texto: jamais interpreta HTML vindo do banco.
(async () => {
  const result = await db.from('site_content').select('key,value');
  if (result.error) return; // Mantém os textos padrão até a migração ser aplicada.
  for (const row of result.data || []) {
    document.querySelectorAll('[data-site-content]').forEach(node => {
      if (node.dataset.siteContent === row.key) node.textContent = row.value;
    });
  }
})().catch(() => {});
