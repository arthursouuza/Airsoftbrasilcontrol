import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, emailRedirectUrl } from './config.js';
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);
let session = null;
let generation = 0;
function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}
function check(result) { if (result.error) throw result.error; return result.data; }
function errorMessage(error) {
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
  return article;
}
async function load() {
  const current = ++generation;
  const user = session?.user;
  const [events, mine, registrations] = await Promise.all([
    db.from('events').select('*').eq('status', 'published').gt('starts_at', new Date().toISOString()).order('starts_at'),
    user ? db.from('events').select('*').eq('organizer_id', user.id).order('starts_at') : { data: [] },
    user ? db.from('registrations').select('id,event_id,events(title,starts_at,status)').eq('player_id', user.id) : { data: [] }
  ]);
  if (current !== generation) return;
  const publicEvents = check(events), myEvents = check(mine), myRegistrations = check(registrations);
  const joined = new Set(myRegistrations.map(r => r.event_id));
  $('events').replaceChildren(); $('my-events').replaceChildren(); $('my-registrations').replaceChildren();
  for (const e of publicEvents) {
    const element = card(e);
    if (joined.has(e.id)) element.append(paragraph('Inscrição confirmada.'));
    else element.append(button(user ? 'Inscrever-me' : 'Entre para se inscrever', async () => {
      if (!session) { $('auth').scrollIntoView(); $('auth-form').elements.email.focus(); return; }
      check(await db.from('registrations').insert({ event_id: e.id, player_id: session.user.id }));
      notice('Inscrição realizada. Combine o pagamento com o organizador.'); await load();
    }));
    $('events').append(element);
  }
  if (!publicEvents.length) $('events').append(paragraph('Ainda não há próximos eventos publicados.'));
  for (const e of myEvents) {
    const element = card(e); element.append(paragraph({ draft: 'Rascunho', published: 'Publicado', cancelled: 'Cancelado' }[e.status]));
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
  for (const r of myRegistrations) $('my-registrations').append(paragraph(r.events
    ? `${r.events.title} · ${new Date(r.events.starts_at).toLocaleString('pt-BR')}`
    : 'Inscrição registrada. Este evento não está disponível no catálogo.'));
  if (!myRegistrations.length) $('my-registrations').append(paragraph('Você ainda não tem inscrições.'));
}
async function syncSession(next) {
  session = next;
  $('auth').hidden = !!session; $('account').hidden = !session; $('logout').hidden = !session;
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
      status: values.get('status'), price_cents: Math.round(Number(values.get('price')) * 100) }));
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
