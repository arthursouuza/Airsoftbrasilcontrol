# Airsoft Brasil Control

Site estático conectado ao Supabase por meio do SDK oficial. `src/config.js`
contém apenas URL e chave pública; nenhuma chave de serviço deve entrar no site.

## Desenvolvimento

- `npm ci --cache /tmp/abc-npm`
- `npm run build` gera `connected.js` a partir de `src/app.js`.
- `npm start` serve o site em http://localhost:8000.
- `npm test` executa testes de navegador com API simulada usando Chromium
  instalado em `/usr/bin/chromium`.
- `python scripts/check-supabase.py` valida a API real e os bloqueios anônimos,
  sem criar contas nem registros.

Para hospedagem estática, servir os arquivos estáticos da raiz, incluindo `connected.html`,
`connected.css`, `connected.js`, `auth-callback.html` e `auth-callback.js`.
O bundle gerado está versionado para funcionar sem etapa de build na hospedagem.

## Autenticação

O projeto exige confirmação por e-mail. Configure no painel do Supabase, em
Authentication → URL Configuration, a URL pública do site e os redirects
permitidos, incluindo o endereço local ao testar. O cadastro usa o endereço
atual da página para retorno; se esse redirect não estiver permitido, o Supabase
pode redirecionar para a Site URL configurada. Ao confirmar, o SDK processa a
sessão do link; também é possível entrar com e-mail e senha depois da confirmação.
A sessão é persistida no navegador pelo SDK e renovada automaticamente.

## Recursos

Cadastro, login, logout, criação de perfil após autenticação, eventos em
rascunho ou publicados no catálogo, cancelamento de evento e inscrições sem
pagamento automático. As datas do formulário usam o horário local do navegador
e são gravadas em UTC. O site não fornece cancelamento de inscrição nesta etapa.
Qualquer conta autenticada pode organizar eventos, conforme a migração inicial.

## Validação e publicação

Os testes de interface simulam a API e não comprovam isolamento no banco real.
O check público valida a existência das seis tabelas, bloqueio de leitura de
cinco tabelas privadas, bloqueio de escrita sem login e ausência de rascunhos
na consulta pública. O teste real de login, criação de eventos, inscrições, sessão e logout passou
com uma conta confirmada (`node scripts/live-browser.cjs`). As credenciais
ficam fora do repositório. O isolamento entre duas contas confirmadas passou nas seis tabelas. Consulte `VALIDACAO.md` para evidências e limites.
As URLs de retorno do Supabase foram configuradas e verificadas. Consulte também `supabase/README.md`.

## Página publicada e área conectada

A demonstração atual de `main` foi preservada em `index.html`, `app.js` e
`styles.css`. O link “Minha conta / Eventos reais” abre `connected.html`,
a área autenticada, sem importar dados fictícios do localStorage. Os arquivos
originais da demonstração e seu funcionamento estão descritos em
`docs/DEMONSTRACAO.md`. O retorno de e-mail abre a área conectada.
Configuração administrativa exata: `docs/REDIRECIONAMENTO.md`.

## Recuperação de senha

Use **Esqueci minha senha** na área conectada. Guia completo: [docs/SENHA.md](docs/SENHA.md).
O link abre o formulário para o próprio usuário definir a nova senha.

Envio/recebimento dos e-mails e recuperação real completa continuam pendentes.
Domínio próprio, Resend e SMTP foram adiados. A confirmação de e-mail e as
políticas de acesso permanecem obrigatórias. Veja [PENDENCIAS.md](PENDENCIAS.md).

## Busca de eventos reais

Em `connected.html`, use os campos Nome do evento, Local do evento e Data do
evento e clique em Filtrar eventos. Os critérios são combinados; nome e local
buscam trechos sem distinguir maiúsculas/minúsculas. A data considera o dia
de início no horário local do navegador, incluindo o início do dia e excluindo
o início do dia seguinte. Limpar filtros restaura os próximos eventos publicados.
Atualizar mantém os filtros aplicados. Esses filtros são enviados ao Supabase
e não alteram Meus eventos, Minhas inscrições ou as políticas de acesso.
