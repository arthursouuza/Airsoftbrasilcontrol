// Chave pública destinada ao navegador. A segurança dos dados depende do RLS.
export const SUPABASE_URL = 'https://nzgpceglyxwtukrbdkam.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_iv8C43a-Zw1BufNAxSLF1Q__K59QGKA';
export const PUBLIC_SITE_URL = 'https://arthursouuza.github.io/Airsoftbrasilcontrol/';

// Resolve também quando o site é hospedado em um subdiretório.
export function emailRedirectUrl(pageUrl = window.location.href) {
  const current = new URL(pageUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(current.hostname);
  return new URL('auth-callback.html', local ? current.href : PUBLIC_SITE_URL).href;
}
