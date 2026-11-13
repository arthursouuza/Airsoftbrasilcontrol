import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const status = document.getElementById('callback-status');
const hash = new URLSearchParams(window.location.hash.slice(1));
const query = new URLSearchParams(window.location.search);
const hasError = hash.has('error') || query.has('error') || hash.has('error_code') || query.has('error_code');
const hasCredentials = hash.has('access_token') || query.has('code');

async function confirm() {
  if (hasError) {
    window.history.replaceState(null, '', window.location.pathname);
    status.textContent = 'Este link expirou ou não é válido. Se você já confirmou o e-mail, volte ao site e entre com sua senha. Caso contrário, solicite um novo link de confirmação.';
    return;
  }
  if (!hasCredentials) {
    status.textContent = 'Este endereço não contém um link de confirmação. Se você já confirmou o e-mail, volte ao site e entre com sua senha.';
    return;
  }
  const db = createClient(SUPABASE_URL, SUPABASE_KEY);
  try {
    const { data, error } = await db.auth.getSession();
    if (error || !data.session) throw new Error('Sessão indisponível');
    const verified = await db.auth.getUser();
    if (verified.error || !verified.data.user?.email_confirmed_at) throw new Error('E-mail não confirmado');
    window.history.replaceState(null, '', window.location.pathname);
    status.textContent = 'E-mail confirmado. Abrindo sua conta…';
    window.location.replace(new URL('connected.html', window.location.href).href);
  } catch {
    window.history.replaceState(null, '', window.location.pathname);
    status.textContent = 'Não foi possível concluir a confirmação. Volte ao site e tente entrar com sua senha. Se necessário, solicite um novo link.';
  }
}
confirm();
