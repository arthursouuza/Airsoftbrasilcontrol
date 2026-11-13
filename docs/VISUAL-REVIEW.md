# Revisão visual — feature/catalogo-visual

## Base e escopo

Base: `origin/main`, commit `82f630ee503ef23ae614a44164a47d45567e1687`.
A alteração está em branch separada. Não atualiza main, não publica no Pages
e não mescla o PR #1.

Inventário inicial: SDK oficial Supabase, cadastro com confirmação de e-mail,
login/logout, perfil, recuperação de senha, eventos em rascunho/publicados,
filtros de nome/local/data, inscrições, capacidade atômica, cancelamento e
reinscrição, administração de capacidade e participantes pelo organizador.
A página inicial antiga era uma demonstração local separada da área conectada.

## Referências: acesso não confirmado

- https://airsoft-brasil-control-arthur.newimage3.chatgpt.site
- https://combatzilla.com

Ambas as tentativas retornaram 403 do proxy de rede, antes de acessar o site.
Não foi possível verificar login, conteúdo, layout ou assets dessas páginas.
A gravação mencionada ainda não foi anexada. O design foi implementado a partir
dos requisitos escritos, sem afirmar reprodução fiel de uma referência vista.

Foi salvo um rascunho de rede que preserva Supabase/Pages e adiciona os domínios
das referências. Para acessá-las neste ambiente é necessário revisar, salvar e
publicar a configuração do ambiente. Isso não atualiza a main nem o site.

## Implementado

- Fundo preto, cartões escuros, verde e identidade Airsoft Brasil Control.
- `index.html` e `connected.html` agora usam o mesmo catálogo real.
- Um único template (`src/site.html`) gera as entradas, sem manter três fontes
  HTML divergentes. `game.html?id=<uuid>` é a página individual do jogo.
- Começando em breve: próximos jogos publicados, ordenados por início; filtros
  mantidos no servidor, recolhíveis no celular e abertos no desktop.
- Recém-chegados: os mesmos resultados reais ordenados por criação, sem inventar
  eventos para preencher o catálogo.
- Cartazes: imagem HTTPS cadastrada pelo organizador, quando disponível; caso
  contrário, cartaz tipográfico com título/data reais. Não há foto fictícia.
- Times: leitura da tabela teams apenas com sessão autenticada, conforme RLS;
  visitantes recebem convite de login. Nenhuma permissão pública foi ampliada.
- Página do jogo: capa, descrição, ingresso individual com preço e vagas reais,
  grupos/programação/regras cadastrados, horários e link de localização no mapa.
  Dados não informados são identificados como ausentes. Sem checkout fictício.
- A inscrição da página usa o mesmo INSERT real e os mesmos triggers de vagas.
- Preservados criação/publicação/cancelamento de eventos, filtros, autenticação,
  recuperação, capacidade, inscrições e cancelamentos por jogador/organizador.
- Navegação inferior, inputs de 16 px, safe-area e alvos de toque no celular.
- Os antigos app.js/styles.css da demonstração continuam no histórico, mas não
  são carregados pelas novas entradas. abc-demo-v1 nunca é importado.
  localStorage do SDK mantém somente a sessão, como já ocorria anteriormente.

## Migração opcional, NÃO aplicada no Supabase

`supabase/migrations/202611130003_event_presentation.sql` adiciona somente
poster_url, cover_url, groups, schedule e rules. URLs HTTPS e limites de tamanho
são validados no banco. Grants por coluna e RLS existentes limitam a edição ao
organizador; não há alteração em vagas, inscrições ou confirmação de e-mail.

A interface funciona antes da migração: SELECT * retorna os campos antigos e
não são enviados novos campos em INSERTs ou UPDATEs do fluxo existente.
A edição de apresentação só aparece quando os novos campos existem no retorno.
Depois da revisão, aplicar uma única vez pelo SQL Editor e cadastrar URLs e
conteúdo real pelo botão Editar apresentação do jogo em Meus eventos.
Não repetir migrações 001/002 já aplicadas. Nenhuma migração remota foi executada.

No banco real consultado havia um evento publicado: Operação Carandiru.
Não havia campos de cartaz/capa/grupos/regras. As capturas usam esse registro e
seu preço/local/vagas reais; não usam os fixtures dos testes.

## Testes e limites

- `npm run build`: passou.
- `npm test`: 29 testes passaram, incluindo o roteiro de revisão manual com API
  simulada e os cenários de cartão único/faixa horizontal no celular.
  O teste móvel de filtros foi adaptado para abrir o painel recolhível.
- Telas verificadas em 320 e 390 px (celular) e 1440 px (desktop), sem rolagem
  horizontal, com navegação, detalhe, filtros e estados de ausência.
- Capturas com dados públicos reais em pt-BR, fuso America/Sao_Paulo.
- PostgreSQL 17 isolado: migrações 001/002/003, grants da apresentação e todos os
  testes de concorrência/cancelamento/ocupação passaram. Banco temporário removido.
- Autenticação, vagas e cancelamentos também passaram nos testes de UI simulados.
- `node scripts/live-browser.cjs` e `npm run test:capacity:remote` foram tentados,
  mas as credenciais temporárias arquivadas retornaram HTTP 400 no login.
  Os scripts pararam antes de criar eventos/inscrições; não alteraram senhas.
  Homologação autenticada REAL desta revisão continua pendente. Não solicitar
  senha no chat: usar login direto durante revisão ou contas de teste configuradas
  por um canal privado do ambiente.
- A emulação usa Chromium. Não foi testado um iPhone físico/Safari real.

## Prévia local e capturas

```sh
npm ci
npm run build
npm start
```

No ambiente, abrir http://localhost:8000/ e
http://localhost:8000/game.html?id=b581d679-53ba-4479-8e92-9b44b7ab49b6.
As capturas de revisão estão em `/workspace/scratch/abc-preview/` (fora do repo):
`desktop.png`, `iphone.png`, `iphone-screen.png`, `iphone-catalogo.png`,
`jogo-iphone.png` e `jogo-desktop.png`.
A prévia ainda não está publicada no GitHub Pages.

## Arquivos da alteração

- `src/site.html` — template único das páginas.
- `index.html`, `connected.html`, `game.html` — entradas geradas.
- `connected.css` — tema responsivo e controles do painel existente.
- `src/catalogue.js` — cartazes, recentes, times, detalhe e edição opcional.
- `src/app.js` — conecta a apresentação aos fluxos Supabase existentes.
- `connected.js` — bundle gerado.
- `scripts/build-pages.cjs`, `package.json` — geração das entradas no build.
- `supabase/migrations/202611130003_event_presentation.sql` — campos opcionais.
- `tests/catalogue.spec.cjs` — novos testes de catálogo e detalhe.
- `tests/filters.spec.cjs` — abertura do painel no teste móvel.
- `tests/db/capacity.py` — regressão das permissões da nova migração.
- `README.md`, `VALIDACAO.md`, `PENDENCIAS.md`, `docs/VISUAL-REVIEW.md` — documentação.

## Pendências antes da aprovação

1. Conferir a gravação/referências após acesso, para comparação visual fiel.
2. Rever esta prévia e homologar login/inscrições com conta real acessível.
3. Aplicar a migração opcional para cadastrar cartazes, capa, grupos e regras
   reais; sem ela o catálogo atual continua funcionando com os dados existentes.
4. Main e publicação só após a revisão solicitada pelo usuário. Não mesclar PR #1.

Domínio próprio, Resend/SMTP e validação real completa da recuperação de senha
continuam adiados. Confirmação de e-mail e regras de acesso permanecem ativas.

## Continuação a partir de 8966eee

A gravação mencionada não chegou como anexo/arquivo acessível nesta etapa.
As referências continuam retornando 403 do proxy. Portanto não foram feitos
ajustes de fidelidade alegando comparação com o vídeo; a prévia visual atual
foi preservada. É necessário anexar novamente a gravação para essa comparação.

A migração 003 foi revisada e ganhou guia (`docs/APLICAR-003.md`) e consulta
única de verificação (`supabase/verificar_apresentacao.sql`). Os testes locais
validam os resultados antes e depois da migração, além da preservação de dados
e políticas. Não foi aplicada no Supabase.

O roteiro `npm run test:manual` abre um navegador no computador do usuário,
aguarda o login digitado exclusivamente no site e automatiza somente um evento
novo de teste. Não lê/exporta senha ou tokens. Instruções completas em
`docs/VALIDACAO-MANUAL.md`. Esse roteiro foi validado com API simulada; a
homologação real continua pendente do login manual. Não foram repetidas
tentativas com as credenciais temporárias antigas.

Arquivos adicionados nesta continuação: `scripts/manual-review.cjs`,
`supabase/verificar_apresentacao.sql`, `docs/APLICAR-003.md` e
`docs/VALIDACAO-MANUAL.md`. Atualizados também package.json e os testes locais.

## Ajuste mobile solicitado após a revisão

Botões e acentos usam verde vivo #00d563, sem verde-limão. Margens, hero,
títulos, filtro e capa foram compactados mantendo alvos de toque de 44 px.
O evento único ocupa a largura útil do catálogo; múltiplos eventos usam faixa
horizontal no celular, com rolagem isolada e scroll-snap. Recém-chegados também
usa faixa horizontal quando há vários registros. Desktop preserva sua grade.

29 testes Playwright passaram, incluindo novas verificações de cor, largura
do cartão e rolagem horizontal do catálogo em 320 e 390 px, sem overflow da
página. Os vários registros usados nesse teste são fixtures isolados da API
simulada, nunca importados no Supabase. As capturas usam apenas a Operação
Carandiru real; não houve escrita no banco, alteração de autenticação ou RLS.

Novas capturas em `/workspace/scratch/abc-preview/`:
- `mobile-pagina-inteira-v2.png` — página completa.
- `mobile-jogo-v2.png` — todos os detalhes do jogo.
- `mobile-inicio-v2.png`, `mobile-catalogo-v2.png`, `mobile-jogo-tela-v2.png` —
  recortes no viewport de 390 x 844, com a navegação fixa em sua posição real.
Nas capturas longas, somente a barra inferior foi colocada no final do documento
durante a captura para não cobrir uma seção no meio da imagem; o CSS do site
continua com navegação fixa. Não houve alteração de conteúdo para as capturas.

A main não foi atualizada. Pendências anteriores de gravação acessível, migração
003 e homologação autenticada real permanecem registradas acima.

A referência adicional compartilhada pela Biblioteca do ChatGPT também retornou
403 do proxy. Seu conteúdo não foi visto. A comparação exata continua pendente
de um vídeo/imagem anexado diretamente ao chat ou acesso liberado à referência.
Os ajustes de cor, largura e espaçamento desta revisão seguem a lista escrita
pelo usuário, sem afirmar correspondência visual com esse arquivo.
