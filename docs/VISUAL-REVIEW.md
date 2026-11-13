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

## Referências e gravação recebida

- https://airsoft-brasil-control-arthur.newimage3.chatgpt.site
- https://combatzilla.com

Ambas as tentativas retornaram 403 do proxy de rede, antes de acessar o site.
Não foi possível verificar login, conteúdo, layout ou assets dessas páginas.
Posteriormente foi recebida e inspecionada a gravação `ScreenRecording_11-13-2026 01-18-47_1.mp4` (65 segundos). A revisão atual compara o catálogo (1–11 s), jogo (13–20 s), horários/localização e acesso (58 s) dessa gravação. Os links continuam sem acesso confirmado; a comparação visual usa o vídeo.

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

## Revisão com a gravação — 13/11/2026

Cabeçalho compacto, chips Jogos/Times/local, banner central com CTA branco, verde #24d350, cartões sem moldura externa e navegação inferior flutuante. Um evento ocupa a largura disponível; vários usam faixa horizontal com cartões de aproximadamente 40%. Recém-chegados reutiliza cartazes reais. Buscar e Todo o Brasil abrem os filtros existentes; limpar continua disponível.

No celular, o jogo usa capa alta, compartilhamento de URL limpa, descrição, inscrição, grupos, ingresso individual, horários, localização e regras. O compartilhamento não inclui fragmentos de autenticação. A navegação inferior fica apenas no catálogo, como no vídeo.

Não foram copiados eventos, cartazes, avaliações, participantes, mercado ou autenticação por WhatsApp da demonstração. Permanecem o e-mail com confirmação e os fluxos reais do Supabase. Operação Carandiru ainda não possui fotografia cadastrada: cartaz e capa usam apresentação tipográfica, sem atribuir uma fotografia de outro evento. A migração 003 continua pendente; nenhuma migração foi executada nesta revisão.

As capturas usam leitura pública real do Supabase, sem alterar inscrições. Os testes automatizados usam API simulada; login e operações autenticadas reais ainda dependem da validação manual segura do titular. SMTP e recebimento real de recuperação de senha continuam pendentes.

Prévia interna: http://127.0.0.1:8000/ (HTTP 200). O relay de prévia deste ambiente está indisponível; não há link externo verificado. Main e GitHub Pages não são atualizados.

Verificação desta revisão: build concluído e 30 testes Playwright aprovados (API simulada), incluindo compartilhamento sem parâmetros extras, acesso ao ingresso no celular, filtros e fluxos existentes. Capturas conferidas em 390 × 844 e desktop; testes de largura em 320, 390 e 1440 pixels.

## Navegação em páginas separadas — revisão seguinte

- `index.html`: início, destaques e catálogo resumido, sem formulários de autenticação ou gestão no HTML.
- `jogos.html`: catálogo de jogos e filtros, sem banner promocional, login ou gestão.
- `game.html?id=…`: detalhes de um jogo, inscrição e informações reais.
- `login.html`: entrada por e-mail, reenvio de confirmação e recuperação de senha.
- `cadastro.html`: nome de jogador, e-mail e nova senha; confirmação obrigatória mantida.
- `connected.html`: conta, criação/gestão de eventos e inscrições; visitante recebe links de acesso.

O build extrai somente os blocos da página a partir do template compartilhado. Não se trata de esconder todos os formulários com CSS no catálogo. Os links antigos #auth/#account/#forgot-password recebem navegação compatível. Login iniciado num jogo retorna a esse jogo sem inscrever automaticamente; retornos externos são recusados. O callback de e-mail continua no mesmo endereço autorizado, sem nova configuração no Supabase. Nenhuma migração é necessária para separar as páginas.

O roteiro manual foi atualizado para navegar entre catálogo e conta e continua alterando apenas o evento técnico criado pela própria execução. Build e 33 testes automatizados passaram (API simulada); capturas públicas reais foram conferidas em 390 px. As pendências de autenticação real, 003, imagem de Carandiru e SMTP permanecem. Main e Pages continuam sem alteração.

## Ajustes da base aprovada — 13/11/2026

Filtros iniciam recolhidos no celular tanto no início quanto em Jogos, com summary “Filtrar jogos” sempre visível. Buscar e o chip de local também expandem os filtros. No computador, permanecem abertos.

Cartazes sem URL válida ou com falha de carregamento recebem apresentação tipográfica compacta: título, data completa e local, sem a área alta reservada a uma fotografia ausente. A capa individual usa o mesmo tratamento compacto. Imagens válidas mantêm sua apresentação anterior.

Datas de evento, legendas, capas e registros passam a dd/mm/aaaa, com horário separado quando aplicável. O filtro usa entrada explícita dd/mm/aaaa e valida dia/mês/ano antes de converter para os limites de dia no Supabase; datas impossíveis não disparam consulta. Campos nativos de criação com datetime-local continuam usando o seletor do navegador.

Build e 36 testes Playwright aprovados (API simulada), cobrindo também recolher/expandir, dimensões do cartaz, falha de imagem e datas inválidas. Capturas atualizadas com leitura pública real do Supabase. Sem alteração de schema, políticas ou dados de inscrições. Main e Pages não atualizados. A comparação das funcionalidades e lacunas está em FUNCIONALIDADES-REFERENCIA.md.
