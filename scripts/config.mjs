import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const url = process.env.SUPABASE_URL || '';
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
if (url || publishableKey) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/^\w[\w-]*\.supabase\.co$/.test(parsed.hostname) || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) throw Error('Use a URL HTTPS oficial do projeto Supabase.');
  // Modern public keys only: deliberately reject JWT/service_role/secret keys.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey) || publishableKey.includes('REPLACE_ME')) throw Error('Use somente uma chave pública sb_publishable_.');
}
await writeFile(resolve(process.argv[2] || '.', 'supabase-config.json'), JSON.stringify({ url, publishableKey }, null, 2)+'\n');
console.log(url ? 'Configuração pública gerada. Isso NÃO confirma conexão, migrações ou testes.' : 'Build desconectado: projeto Supabase não configurado.');
