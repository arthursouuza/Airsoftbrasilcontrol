import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, emailRedirectUrl } from './config.js';
import { posterCard, renderRecents, renderTeams, renderGame, metadataEditor } from './catalogue.js';
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);
let session = null;
let generation = 0;
const gamePage = document.body.dataset.page === 'game';
const gameId = new URLSearchParams(window.location.search).get('id');
const validGameId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId || '');
if (gamePage) {
  $('catalogue-home').hidden = true;
  $('game-view').hidden = false;
  $('game-view').textContent = 'Carregando jogo…';
}
let filters = { title: '', location: '', date: '' };
$('filters-panel').open = !window.matchMedia('(max-width:650px)').matches;
const literalPattern = text => '%' + text.replace(/[\\%_]/g, '\\$&') + '%';
function publicEventsQuery() {
  let query = db.from('events').select('*').eq('status', 'published').gt('starts_at', new Date().toISOString()).order('starts_at');
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
  if (error.code === 'P0001') return 'O evento está indisponível ou não há mais vagas. Atualize o catálogo.';
  if (error.code === '23514') return 'A operação não atende às regras do evento. A capacidade não pode ser menor que o número de inscrições ativas.';
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
    paragraph(new Date(event.starts_at).toLocaleString('pt-BR')),
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
async function registerForEvent(event) {
  if (!session) {
    document.getElementById('auth').scrollIntoView();
    document.getElementById('auth-form').elements.email.focus();
    return;
  }
  check(await db.from('registrations').insert({ event_id: event.id, player_id: session.user.id }));
  notice('Inscrição realizada. Combine o pagamento com o organizador.');
  await load();
}
async function load() {
  const current = ++generation;
  const user = session?.user;
  const [events, mine, registrations, teams, detail] = await Promise.all([
    publicEventsQuery(),
    user ? db.from('events').select('*').eq('organizer_id', user.id).order('starts_at') : { data: [] },
    user ? db.from('registrations').select('id,event_id,status,events(title,starts_at,status)').eq('player_id', user.id) : { data: [] },
    user ? db.from('teams').select('id,name,description').order('created_at', { ascending: false }).limit(12) : { data: [] },
    gamePage && validGameId ? db.from('events').select('*').eq('id', gameId).limit(1) : { data: [] }
  ]);
  if (current !== generation) return;
  const publicEvents = check(events), myEvents = check(mine), myRegistrations = check(registrations);
  const joined = new Set(myRegistrations.filter(r => r.status !== 'cancelled').map(r => r.event_id));
  renderRecents(publicEvents);
  $('show-more-games').hidden = publicEvents.length < 2;
  renderTeams(teams.data || [], session, !!teams.error);
  if (gamePage) renderGame(detail.data?.[0], {
    session, joined: joined.has(gameId), onRegister: registerForEvent,
    onError: error => notice(errorMessage(error), true)
  });
  if (gamePage && detail.error) notice('Não foi possível carregar o jogo. Confira sua conexão e atualize a página.', true);
  $('events').replaceChildren(); $('my-events').replaceChildren(); $('my-registrations').replaceChildren();
  for (const e of publicEvents) {
    const element = posterCard(e);
    if (joined.has(e.id)) element.append(paragraph('Inscrição confirmada.'));
    else if (e.capacity != null && e.active_registration_count >= e.capacity) element.append(paragraph('Lotado.'));
    else {
      const signup = button(user ? 'Inscrever-me' : 'Entre para se inscrever', () => registerForEvent(e));
      signup.classList.add('poster-action'); element.append(signup);
    }
    $('events').append(element);
  }
  const filtered = Object.values(filters).some(Boolean);
  $('filter-status').textContent = filtered ? 'Filtros aplicados ao catálogo público.' : '';
  $('location-chip-label').textContent = filters.location || 'Todo o Brasil';
  if (!publicEvents.length) $('events').append(paragraph(filtered
    ? 'Nenhum evento encontrado com esses filtros. Tente outros termos ou limpe os filtros.'
    : 'Ainda não há próximos eventos publicados.'));
  for (const e of myEvents) {
    const element = card(e); element.append(paragraph({ draft: 'Rascunho', published: 'Publicado', cancelled: 'Cancelado' }[e.status]));
    const presentation = metadataEditor(e, async data => {
      check(await db.from('events').update(data).eq('id', e.id));
      notice('Apresentação atualizada.'); await load();
    }, error => notice(errorMessage(error), true));
    if (presentation) element.append(presentation);
    element.append(paragraph(`${e.active_registration_count ?? 0} inscrição(ões) ativa(s).`));
    const capacityForm = document.createElement('form');
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
        check(await db.from('events').update({ capacity: capacityInput.value === '' ? null : Number(capacityInput.value) }).eq('id', e.id));
        notice('Capacidade atualizada.'); await load();
      });
    });
    element.append(capacityForm);
    const participants = document.createElement('div');
    element.append(button('Ver inscrições ativas', async () => {
      const rows = check(await db.from('registrations').select('id,created_at').eq('event_id', e.id).eq('status', 'active').order('created_at'));
      participants.replaceChildren();
      for (const r of rows) {
        const item = document.createElement('div');
        item.append(paragraph(`Inscrição ${r.id.slice(0, 8)} · ${new Date(r.created_at).toLocaleString('pt-BR')}`),
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
    element.append(paragraph(r.events ? `${r.events.title} · ${new Date(r.events.starts_at).toLocaleString('pt-BR')}`
      : 'Inscrição registrada. Este evento não está disponível no catálogo.'));
    element.append(paragraph(r.status === 'cancelled' ? 'Inscrição cancelada.' : 'Inscrição ativa.'));
    if (r.status !== 'cancelled') element.append(button('Cancelar minha inscrição', () => cancelRegistration(r.id)));
    $('my-registrations').append(element);
  }
  if (!myRegistrations.length) $('my-registrations').append(paragraph('Você ainda não tem inscrições.'));
}
async function syncSession(next) {
  session = next;
  $('auth').hidden = !!session; $('account').hidden = !session; $('logout').hidden = !session;
  document.querySelectorAll('[data-account-link]').forEach(link => {
    link.href = session ? '#account' : '#auth';
  });
  document.querySelectorAll('[data-account-label]').forEach(label => { label.textContent = session ? 'Minha conta' : 'Entrar'; });
  document.querySelectorAll('[data-mobile-account-label]').forEach(label => { label.textContent = session ? 'Conta' : 'Entrar'; });
  document.querySelectorAll('[data-registration-link]').forEach(link => { link.href = session ? '#my-registrations' : '#auth'; });
  $('profile-warning').textContent = '';
  if (session) {
    const user = session.user;
    $('welcome').textContent = `Minha conta · ${user.user_metadata?.display_name || user.email}`;
    try {
      const rows = check(await db.from('profiles').select('id').eq('id', user.id));
      if (!rows.length) check(await db.from('profiles').insert({ id: user.id, display_name: (user.user_metadata?.display_name || user.email.split('@')[0]).slice(0, 100) }));
    } catch (error) { $('profile-warning').textContent = `Não foi possível salvar seu perfil: ${errorMessage(error)}`; }
  }
  await load();
}
$('auth-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget; const submit = event.submitter;
  action(submit, async () => {
    const values = new FormData(form), email = values.get('email').trim(), password = values.get('password');
    if (submit.value === 'signup') {
      const name = values.get('name').trim();
      if (!name) throw new Error('Informe seu nome de jogador para criar a conta.');
      const data = check(await db.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: emailRedirectUrl() } }));
      notice(data.session ? 'Conta criada.' : 'Confira seu e-mail para confirmar o cadastro. Depois, entre com sua senha.');
    } else {
      check(await db.auth.signInWithPassword({ email, password })); notice('Você entrou na sua conta.');
    }
    form.elements.password.value = '';
  });
});
$('event-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  action(event.submitter, async () => {
    if (!session) throw new Error('Entre na sua conta para criar um evento.');
    const values = new FormData(form);
    const start = new Date(values.get('starts_at')), end = new Date(values.get('ends_at'));
    if (!(start > new Date()) || !(end > start)) throw new Error('Escolha um início no futuro e um fim posterior ao início.');
    const title = values.get('title').trim(), location = values.get('location').trim();
    if (!title || !location) throw new Error('Informe título e local do evento.');
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
$('resend-confirmation').addEventListener('click', () => action($('resend-confirmation'), async () => {
  const email = $('auth-form').elements.email;
  if (!email.reportValidity()) return;
  check(await db.auth.resend({ type: 'signup', email: email.value.trim(), options: { emailRedirectTo: emailRedirectUrl() } }));
  notice('Se houver um cadastro pendente para este e-mail, você receberá um novo link de confirmação.');
}));
$('reload').addEventListener('click', () => action($('reload'), load));
function openSearch(field = 'title') {
  $('filters-panel').open = true;
  $('filters-panel').scrollIntoView({ block: 'start' });
  $('event-filters').elements[field].focus();
}
$('location-chip').addEventListener('click', () => openSearch('location'));
document.querySelectorAll('[data-search-link]').forEach(link => link.addEventListener('click', event => {
  if (gamePage) return;
  event.preventDefault(); window.location.hash = 'catalogue'; openSearch();
}));
$('show-more-games').addEventListener('click', () => $('events').scrollBy({ left: $('events').clientWidth * .8, behavior: 'smooth' }));
$('show-more-recent').addEventListener('click', () => $('recent-events').scrollBy({ left: $('recent-events').clientWidth * .8, behavior: 'smooth' }));
$('event-filters').addEventListener('submit', event => {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  action(event.submitter, async () => {
    filters = { title: values.get('title').trim(), location: values.get('location').trim(), date: values.get('date') };
    await load();
  });
});
$('clear-filters').addEventListener('click', () => {
  action($('clear-filters'), async () => {
    $('event-filters').reset(); filters = { title: '', location: '', date: '' };
    await load();
  });
});
$('recovery-form').addEventListener('submit', event => {
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

if (window.location.hash === '#forgot-password') {
  $('forgot-password').open = true;
  $('recovery-form').elements.email.focus();
}
function updateMobileNav() {
  const hash = window.location.hash;
  const active = ['#auth', '#account', '#forgot-password'].includes(hash) ? 'account'
    : hash === '#my-registrations' ? 'registrations' : hash === '#catalogue' || gamePage ? 'search' : 'home';
  document.querySelectorAll('[data-mobile]').forEach(link => {
    if (link.dataset.mobile === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', updateMobileNav); updateMobileNav();
