import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const status = document.getElementById('callback-status');
const form = document.getElementById('new-password-form');
const hash = new URLSearchParams(window.location.hash.slice(1));
const query = new URLSearchParams(window.location.search);
const hasError = hash.has('error') || query.has('error') || hash.has('error_code') || query.has('error_code');
const hasCredentials = hash.has('access_token') || query.has('code');
let recovery = hash.get('type') === 'recovery';
let db;
let ready = false;
let saving = false;
const clearUrl = () => window.history.replaceState(null, '', window.location.pathname);
const retryMessage = 'Este link expirou ou não é válido. Solicite um novo link de recuperação ou confirmação. Se já confirmou seu cadastro, volte ao site para entrar.';

async function confirm() {
  if (hasError) { clearUrl(); status.textContent = retryMessage; return; }
  if (!hasCredentials) {
    status.textContent = 'Este endereço não contém um link de confirmação ou recuperação. Volte ao site para entrar ou solicite um novo link.';
    return;
  }
  db = createClient(SUPABASE_URL, SUPABASE_KEY);
  // O callback apenas marca o tipo; nenhuma chamada assíncrona dentro do Auth.
  db.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') recovery = true; });
  try {
    const { data, error } = await db.auth.getSession();
    if (error || !data.session) throw new Error('Sessão indisponível');
    const verified = await db.auth.getUser();
    if (verified.error || !verified.data.user?.email_confirmed_at) throw new Error('Usuário indisponível');
    clearUrl();
    if (recovery) {
      document.getElementById('callback-title').textContent = 'Defina sua nova senha';
      status.textContent = 'Link validado. Escolha uma senha com pelo menos 8 caracteres e confirme abaixo.';
      ready = true; form.hidden = false; form.elements.password.focus();
    } else {
      status.textContent = 'E-mail confirmado. Abrindo sua conta…';
      window.location.replace(new URL('connected.html', window.location.href).href);
    }
  } catch { clearUrl(); status.textContent = retryMessage; }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!ready || saving) return;
  const password = form.elements.password.value;
  const confirmation = form.elements.confirmation.value;
  if (password.length < 8) { status.textContent = 'Use uma senha com pelo menos 8 caracteres.'; return; }
  if (password !== confirmation) { status.textContent = 'As senhas não coincidem. Confira os dois campos.'; return; }
  saving = true;
  const submit = form.querySelector('button'); submit.disabled = true;
  try {
    const verified = await db.auth.getUser();
    if (verified.error || !verified.data.user) {
      ready = false; form.hidden = true; status.textContent = retryMessage; return;
    }
    const result = await db.auth.updateUser({ password });
    if (result.error) {
      if (result.error.code === 'same_password') status.textContent = 'Escolha uma senha diferente da atual.';
      else if (result.error.code === 'weak_password') status.textContent = 'A senha não atende aos requisitos do serviço. Use uma senha mais forte.';
      else status.textContent = 'Não foi possível salvar a senha. Tente novamente; se o link tiver expirado, solicite outro.';
      return;
    }
    ready = false; form.reset(); form.hidden = true;
    const signedOut = await db.auth.signOut({ scope: 'global' });
    status.textContent = signedOut.error
      ? 'Senha alterada. Não foi possível encerrar todas as sessões. Volte ao site e entre com sua nova senha.'
      : 'Senha alterada com sucesso. Volte ao site e entre com sua nova senha.';
  } catch { status.textContent = 'Não foi possível concluir. Confira sua conexão e tente novamente.'; }
  finally { form.reset(); saving = false; submit.disabled = false; }
});
confirm();
