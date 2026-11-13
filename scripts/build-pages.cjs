// Páginas estáticas distintas, geradas de um template compartilhado para o Pages.
const fs = require('node:fs');
const template = fs.readFileSync('src/site.html', 'utf8');
const pages = { 'index.html':'home', 'connected.html':'account', 'game.html':'game', 'login.html':'login', 'cadastro.html':'signup', 'jogos.html':'catalogue' };
for (const [name,page] of Object.entries(pages)) {
 let html=template.replace('{{title}}',({catalogue:'Jogos',home:'Encontre seu próximo jogo',account:'Minha conta',game:'Jogo',login:'Entrar',signup:'Criar conta'})[page]+' · Airsoft Brasil Control').replace('{{pageAttribute}}',` data-page="${page}"`);
 for(const section of ['catalogue','game','auth','account']) {
  const keep=section==='catalogue'?['home','catalogue'].includes(page):section==='auth'?['login','signup'].includes(page):section===page;
  html=html.replace(new RegExp(`<!-- start:${section} -->([\\s\\S]*?)<!-- end:${section} -->`),keep?'$1':'');
 }
 if(!['home','catalogue'].includes(page))html=html.replace(/<nav class="catalogue-chips"[\s\S]*?<\/nav>/,'');
 if(page==='catalogue')html=html.replace(/<section class="hero[\s\S]*?<\/section>/,'').replace(/<div class="section-divider"[\s\S]*?<\/div>/,'').replace(/<section id="new-arrivals"[\s\S]*?<\/section>/,'').replace(/<section id="teams"[\s\S]*?<\/section>/,'').replace(/<section class="organize-banner"[\s\S]*?<\/section>/,'').replace('Começando em breve<span class="green-dot">.</span>','Todos os jogos<span class="green-dot">.</span>');
 if(page==='signup')html=html.replace('Sua conta</h2>','Criar conta</h2>').replace('autocomplete="current-password"','autocomplete="new-password"').replace('<button type="submit" value="login">Entrar</button>','').replace('<button type="submit" value="signup" class="secondary">','<button type="submit" value="signup">').replace(/<details id="forgot-password"[\s\S]*?<\/details>/,'').replace('<a href="cadastro.html">Criar uma conta</a>','<a href="login.html">Já tenho conta. Entrar</a>');
 if(page==='login')html=html.replace('Sua conta</h2>','Entrar</h2>').replace(/<label>Nome de jogador [\s\S]*?<\/label>/,'').replace('<button type="submit" value="signup" class="secondary">Criar conta</button>','');
 if(!['login','signup','account'].includes(page))html=html.replace('<div class="account-area">','<div class="account-area" hidden>');
 fs.writeFileSync(name,html);
}
