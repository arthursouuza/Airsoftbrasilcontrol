# Validação desta integração

## Confirmado no Supabase real

- Autenticação por e-mail habilitada; cadastro permitido; confirmação obrigatória.
- As seis tabelas existem na API REST.
- Leitura anônima de eventos retorna HTTP 200.
- Leitura anônima de profiles, teams, team_members, registrations e payments
  retorna HTTP 401 com código PostgreSQL 42501 (sem privilégio).
- Tentativas de INSERT anônimo com corpo vazio são bloqueadas nas seis tabelas
  por falta de privilégio; não foram criados registros.
- Consulta anônima por eventos não publicados não retorna linhas. Como o
  catálogo está vazio, isso não prova por si só o isolamento de rascunhos.
- O site no Chromium carregou a lista real de eventos (HTTP 200), vazia.
  O Chromium desta máquina não confia automaticamente na CA do proxy.
  Nesse teste, as requisições Supabase foram encaminhadas por Playwright
  `route.fetch`, com a CA fornecida pelo ambiente e verificação TLS ativa.

## Confirmado com API simulada no navegador

Três testes Playwright passaram: fluxo de cadastro com confirmação, login,
criação de evento e inscrição; sessão mantida ao recarregar e logout;
erro de credenciais inválidas; layout móvel sem rolagem horizontal.
Conteúdo inserido pelo usuário é exibido como texto, sem executar HTML.

## Confirmado com a conta real após confirmação do e-mail

O script `node scripts/live-browser.cjs` passou usando a conta confirmada,
com credenciais temporárias mantidas fora do repositório. Verificações reais:

- Login no navegador, criação automática de perfil e leitura do próprio perfil.
- Criação de evento em rascunho, invisível para visitante sem login.
- Publicação do evento no catálogo e leitura pública.
- Inscrição pela interface e leitura em Minhas inscrições.
- Segunda inscrição bloqueada por unicidade (HTTP 409 / 23505).
- Tentativas de criar perfil, evento ou inscrição com identidade diferente
  bloqueadas por RLS (HTTP 403 / 42501).
- Alteração do identificador do organizador bloqueada por privilégio de coluna.
- Sessão e inscrição mantidas após recarregar; logout real.

O evento de teste `8f22ad79-d70a-46c3-b011-722bce8b4cd7` foi cancelado ao final.
A inscrição foi preservada, conforme a regra que impede sua exclusão pelo cliente.
O teste não encontrou erros JavaScript. Não foi publicado o site.

## Isolamento real com duas contas confirmadas

`npm run test:isolation` passou em profiles, teams, team_members, events,
registrations e payments. Foi verificado isolamento de leitura e edição de
perfis nas duas direções, rascunhos ocultos para a outra conta, eventos publicados
legíveis mas editáveis apenas pelo dono, inscrições próprias e acesso dos
organizadores aos participantes, duplicidade bloqueada e ausência de permissão
para atribuir inscrições a outra identidade. Jogadores não leem pagamentos
alheios nem confirmam os próprios; apenas o organizador do evento pode gravar.
Equipes são editáveis pelo dono e membros não consultam vínculos alheios.

Os eventos de teste foram cancelados. Equipe, inscrições e pagamentos de teste
(valor zero, pendentes) foram mantidos para auditoria: a API não permite sua
exclusão. IDs estão em arquivo temporário privado fora do repositório.

## Retorno de confirmação

A página `auth-callback.html` trata links inválidos e expirados e, com uma sessão
real no servidor local, verificou o usuário no Supabase, removeu os tokens da
URL e abriu a área autenticada. A confirmação por e-mail real das duas contas
foi concluída, mas o retorno público dos links antigos não abriu. As URLs
administrativas devem ser salvas conforme `docs/REDIRECIONAMENTO.md`.
Os sete testes locais de navegador passaram após adicionar o callback.

Após o usuário salvar as URLs, `scripts/check-email-redirect.py` confirmou
as duas configurações por comportamento real do Auth: o endpoint de verificação,
consultado com token intencionalmente inválido e sem seguir redirecionamentos,
retornou HTTP 303 para a Site URL quando nenhum destino foi enviado e para
`auth-callback.html` quando solicitado. Nenhum link real foi consumido.

`scripts/check-pages-layout.cjs` também passou: arquivos locais servidos por
interceptação de requisições no navegador com a origem e o subdiretório do Pages,
com autenticação real no Supabase, abriram a área conectada e processaram o
callback removendo os tokens da URL. Esse teste não acessa o site público.

## Revisão para publicação

A política de rede foi aplicada e tanto o GitHub Pages quanto o Supabase
responderam HTTP 200. Os sete testes Playwright e os testes reais de login,
eventos, inscrições, sessão, logout, callback e isolamento entre duas contas
nas seis tabelas passaram novamente na revisão para publicação.

A demonstração publicada foi preservada: a área autenticada está em
`connected.html`, acessível pelo link no menu. Os scripts `live-browser.cjs`
e `live-callback.cjs` também aceitam o endereço público para homologação após
a publicação. A verificação da revisão publicada é feita por comparação dos
arquivos estáticos com o commit enviado e repetição dos fluxos reais.

A conta de teste usa senha temporária. Antes de uso pessoal definitivo, o usuário
deve definir sua própria senha pelo fluxo de recuperação do Supabase.
