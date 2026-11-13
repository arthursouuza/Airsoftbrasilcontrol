// Um único template mantém as três entradas estáticas compatíveis com Pages.
const fs = require('node:fs');
const template = fs.readFileSync('src/site.html', 'utf8');
for (const name of ['index.html', 'connected.html', 'game.html']) {
  const game = name === 'game.html';
  const html = template
    .replace('{{title}}', game ? 'Jogo · Airsoft Brasil Control' : 'Airsoft Brasil Control · Encontre seu próximo jogo')
    .replace('{{pageAttribute}}', game ? ' data-page="game"' : '');
  fs.writeFileSync(name, html);
}
