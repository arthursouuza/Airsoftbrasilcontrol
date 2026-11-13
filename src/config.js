export function validateConfig(config) {
  if (!config?.url || !config?.publishableKey) throw Error('CONFIG_MISSING');
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || !/^[\w-]+\.supabase\.co$/.test(url.hostname) || url.pathname !== '/' || url.search || url.hash || url.username || url.password || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) throw Error('CONFIG_INVALID');
  return config;
}
