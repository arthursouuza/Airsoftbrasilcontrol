// Login é digitado pelo usuário no navegador. Não lê/salva senhas ou tokens.
// Execute no seu computador; somente eventos novos TESTE são alterados.
const { chromium, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

async function runSignedInReview(page) {
  const title = 'TESTE REVISÃO VISUAL ' + randomUUID().slice(0, 8);
  const ownCard = page.locator('#my-events article').filter({ hasText: title });
  const registered = page.locator('#my-registrations article').filter({ hasText: title });
  let created = false;
  page.on('dialog', dialog => dialog.accept());
  function localDate(value) {
    const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
    return adjusted.toISOString().slice(0, 16);
  }
  try {
    await expect(page.locator('#account')).toBeVisible({ timeout: 300000 });
    console.log('PASS login manual reconhecido; nenhuma credencial foi lida pelo teste');
    const start = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    const form = page.locator('#event-form');
    await page.getByText('Criar evento', { exact: true }).click();
    await form.getByLabel('Título', { exact: true }).fill(title);
    await form.getByLabel('Descrição', { exact: true }).fill('Evento técnico descartável de revisão. Não comparecer.');
    await form.getByLabel('Local', { exact: true }).fill('Teste técnico — não comparecer');
    await form.getByLabel('Início', { exact: true }).fill(localDate(start));
    await form.getByLabel('Fim', { exact: true }).fill(localDate(end));
    await form.getByLabel('Capacidade de vagas', { exact: true }).fill('1');
    const saved = page.waitForResponse(response => {
      const request = response.request();
      return new URL(response.url()).pathname === '/rest/v1/events' && request.method() === 'POST';
    });
    await form.getByRole('button', { name: 'Salvar evento', exact: true }).click();
    const response = await saved;
    if (response.status() !== 201) throw new Error('Criação do evento recusada pelo banco');
    created = true;
    await expect(ownCard).toBeVisible();
    await ownCard.getByRole('button', { name: 'Publicar no catálogo', exact: true }).click();
    // Isola o evento de teste sem selecionar ou alterar eventos preexistentes.
    await page.goto(new URL('index.html', page.url()).href);
    await page.locator('#filters-panel').evaluate(panel => { panel.open = true; });
    await page.getByLabel('Nome do evento', { exact: true }).fill(title);
    await page.getByRole('button', { name: 'Filtrar eventos', exact: true }).click();
    const publicCard = page.locator('#events article').filter({ hasText: title });
    await expect(publicCard).toBeVisible();
    console.log('PASS criação e publicação do evento exclusivo de teste');
    await publicCard.locator('.poster-link').click();
    await page.locator('#game-tickets').getByRole('button', { name: 'Inscrever-me', exact: true }).click();
    await expect(page.locator('#game-tickets')).toContainText('Inscrição confirmada.');
    await page.goto(new URL('connected.html', page.url()).href);
    await expect(registered).toContainText('Inscrição ativa.');
    console.log('PASS inscrição no evento de teste');
    await registered.getByRole('button', { name: 'Cancelar minha inscrição', exact: true }).click();
    await expect(registered).toContainText('Inscrição cancelada.');
    await expect(ownCard).toContainText('1 vaga(s) disponível(is) de 1');
    console.log('PASS cancelamento e liberação da vaga');
  } finally {
    if (created) {
      if (!new URL(page.url()).pathname.endsWith('/connected.html')) await page.goto(new URL('connected.html', page.url()).href);
      const cancelMine = registered.getByRole('button', { name: 'Cancelar minha inscrição', exact: true });
      if (await cancelMine.count()) {
        await cancelMine.click();
        await expect(registered).toContainText('Inscrição cancelada.');
      }
      const cancelEvent = ownCard.getByRole('button', { name: 'Cancelar evento', exact: true });
      if (await cancelEvent.count()) {
        await cancelEvent.click();
        await expect(ownCard.getByText('Cancelado', { exact: true })).toBeVisible();
      } else {
        await expect(ownCard.getByText('Cancelado', { exact: true })).toBeVisible();
      }
      console.log('CLEANUP evento e inscrição de teste cancelados; histórico preservado');
    }
  }
}

async function main() {
  const site = new URL(process.env.ABC_REVIEW_URL || 'http://127.0.0.1:8000/connected.html');
  if (!['http:', 'https:'].includes(site.protocol)) throw new Error('URL inválida');
  const browser = await chromium.launch({
    headless: false,
    ...(process.env.ABC_CHROMIUM_PATH ? { executablePath: process.env.ABC_CHROMIUM_PATH } : {})
  });
  const context = await browser.newContext(); // Contexto temporário, sem arquivo de sessão.
  const page = await context.newPage();
  try {
    await page.goto(site.href);
    console.log('Entre na conta confirmada diretamente no navegador. Não digite senhas no terminal ou no chat.');
    await runSignedInReview(page);
    console.log('PASS revisão real concluída. Pode compartilhar somente estas linhas de resultado.');
  } finally { await context.close(); await browser.close(); }
}

module.exports = { runSignedInReview };
if (require.main === module) main().catch(() => {
  console.error('FAIL revisão não concluída. Confira a tela e o evento TESTE REVISÃO VISUAL da tentativa. Dados privados omitidos.');
  process.exitCode = 1;
});
