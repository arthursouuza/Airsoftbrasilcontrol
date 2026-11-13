# Homologação de grupos antes da publicação

Branch: `feature/catalogo-visual`. Não atualizar main, mesclar PR ou publicar Pages nesta etapa.

## 1. Conferir banco antes de executar qualquer migração

No Supabase → projeto `nzgpceglyxwtukrbdkam` → **SQL Editor → New query**, execute somente `supabase/verificar_pre_requisitos_003_004.sql`.

- `base_001_002_ok = true`: estrutura de vagas/RLS e três triggers presentes.
- Migração `completa`: não executar novamente.
- Migração `ausente`: executar somente o arquivo correspondente.
- Migração `parcial` ou base `false`: parar a aplicação e conferir o resultado; não repetir 001/002/003/004 nem apagar tabelas/colunas para resolver.

Ordem preferida para objetos ausentes: **003 → 004**. Ambas dependem da base 001/002; 004 não depende da 003. A 003 adiciona imagem/textos editoriais; 004 cria grupos relacionais e integra vagas. `events.groups` (texto) não é o grupo escolhido em uma inscrição.

Se ambas estiverem ausentes, execute separadamente:

1. `supabase/migrations/202611130003_event_presentation.sql` por inteiro, uma vez.
2. `supabase/verificar_apresentacao.sql`: esperado `5 | 5 | true | true | 3`.
3. `supabase/migrations/202611130004_combat_groups.sql` por inteiro, uma vez.
4. `supabase/verificar_grupos.sql`: três booleanos `true`; eventos/grupos inconsistentes e pares ativos duplicados = zero. Inscrições ativas sem grupo podem existir e são preservadas.
5. Repetir apenas a consulta de leitura `verificar_pre_requisitos_003_004.sql`: ambas devem retornar `completa`.

Cada migração usa sua própria transação. Executar a 003 com sucesso não significa que a 004 já foi aplicada. Não use somente a mensagem “Success” como verificação dos objetos e permissões.

## 2. Abrir a versão correta e autenticar sem compartilhar credenciais

O site publicado na main ainda não contém os grupos desta branch. Não use o Pages para esta homologação. O servidor interno do ambiente responde em `127.0.0.1:8000`, mas o relay de prévia externa está indisponível: esse endereço não aponta para este ambiente quando aberto no computador do usuário.

Alternativa que mantém a main sem publicação: executar a branch no próprio computador, com Git, Node/npm e Python 3 instalados. Em pasta nova:

```sh
git clone --branch feature/catalogo-visual https://github.com/arthursouuza/Airsoftbrasilcontrol.git Airsoftbrasilcontrol-validacao
cd Airsoftbrasilcontrol-validacao
npm ci
npm run build
npm start
```

Deixe esse terminal aberto. Acesse **http://localhost:8000/login.html**.

Use uma janela normal para o organizador e uma privada para o jogador, ou perfis/navegadores diferentes. Duas abas normais compartilham sessão; duas janelas privadas do mesmo perfil também podem compartilhar sessão.

Cada titular digita sua senha diretamente no site. Não envie senha, token, chave secreta ou link de confirmação no chat. As duas contas precisam estar com e-mail confirmado; mantenha a confirmação obrigatória. Login por senha de conta já confirmada não exige novo envio de e-mail. Se só houver uma conta confirmada, a segunda conta é uma pendência real, sem substituir os testes por simulação.

## 3. Evento A: limite do grupo

Somente o organizador:

1. Em Minha conta, crie **TESTE GRUPOS A — [identificador único]**, com descrição “Evento técnico de validação — não comparecer”, local “Teste técnico — não comparecer”, início futuro, fim posterior, valor zero e **capacidade total 2**. Salve como rascunho.
2. No cartão exclusivo desse evento, abra Gerenciar grupos de combate. Adicione **Alpha: 1 vaga** e **Bravo: 1 vaga**. Reabra o painel depois de cada salvamento para conferir os dados.
3. Publique somente esse evento no catálogo. Isso altera o status do evento de teste no banco; não é publicação do site nem alteração da main.
4. Abra a página do evento e compartilhe somente a URL `game.html?id=...` com o jogador. Não compartilhe URLs de callback com tokens.

Nas duas janelas autenticadas:

5. Abram a página antes de qualquer inscrição. Cada um selecione Alpha; não deve haver escolha automática de grupo.
6. Cliquem em Inscrever-me ao mesmo tempo. Esperado: uma confirmação em Alpha; a outra tentativa recebe mensagem de grupo lotado. Ocupação total 1; Alpha 1/1; Bravo 0/1. Não considerar só o botão desabilitado como prova de recusa do banco: os dois devem selecionar antes da primeira tentativa, mantendo a página da segunda janela sem recarregar até tentar.
7. O perdedor atualiza a página, escolhe Bravo e confirma. Total 2; cada grupo 1/1. Cada conta deve ter uma única inscrição ativa no evento. O banco também impede duplicidade entre grupos; essa proteção já foi testada no PostgreSQL isolado.

## 4. Participantes e cancelamento

8. Organizador → Minha conta → cartão do TESTE A → Ver inscrições ativas: duas inscrições, com identificador, data e grupo.
9. Jogador → Minha conta: não deve existir cartão de gestão do TESTE A em Meus eventos. Em Minhas inscrições deve aparecer somente a inscrição desse jogador, com seu grupo. Não são exibidos nomes/e-mails de terceiros; isso preserva a política atual.
10. Para a inscrição do jogador, organizador e jogador abrem os respectivos botões de cancelamento e confirmam ao mesmo tempo. Esperado: inscrição cancelada; total cai de 2 para 1, e apenas o grupo correspondente passa de 1/1 para 0/1.
11. Atualizem as páginas. O botão de cancelar aquela inscrição desaparece e não há nova liberação de vaga. Histórico cancelado permanece. Execute `verificar_grupos.sql`: todos os três campos de inconsistência continuam zero.
12. O jogador pode escolher o grupo liberado e fazer nova inscrição. A inscrição antiga permanece cancelada, e só a nova conta como ativa. Troca de grupo exige cancelar/reinscrever; a vaga não fica reservada entre essas operações.

## 5. Evento B: limite total mesmo com grupos disponíveis

13. Organizador cria **TESTE GRUPOS B — [mesmo identificador]**, com capacidade total **1**, grupos Alpha **1** e Bravo **1**, e publica somente esse evento técnico.
14. Antes de qualquer inscrição, organizador seleciona Alpha e jogador seleciona Bravo. Cliquem em Inscrever-me ao mesmo tempo. Esperado: somente uma confirmação, outra tentativa recusada por lotação total. Um dos grupos continua com vaga livre, mas o evento está lotado.
15. Verificar participantes: organizador vê a inscrição ativa; jogador vê apenas sua própria inscrição se for o vencedor. Reexecute `verificar_grupos.sql`: inconsistências e duplicados continuam zero.

As tentativas simultâneas de interface complementam os testes com transações sobrepostas já executados no PostgreSQL 17 isolado; não afirmar que houve sobreposição no servidor remoto sem observar esse detalhe.

## 6. Encerrar sem alterar eventos reais

16. Cancelem as inscrições ativas exclusivamente dos TESTES A/B. O organizador cancela esses dois eventos técnicos. Não exclua registros nem mexa na Operação Carandiru.
17. Execute `verificar_grupos.sql` novamente. Guarde apenas os resultados numéricos e os identificadores dos eventos técnicos para revisão. O histórico dos testes permanece cancelado, como previsto no sistema.

Registro de acompanhamento (ainda não executado no Supabase real):

| Etapa | Resultado |
| --- | --- |
| Diagnóstico completo 003/004 | Pendente do SQL Editor |
| Aplicação somente das migrações ausentes | Pendente do diagnóstico |
| Prévia da branch acessível nas duas sessões | Pendente |
| Login de duas contas confirmadas | Pendente |
| Criar e editar grupos | Pendente |
| Última vaga do grupo | Pendente |
| Última vaga total com grupos diferentes | Pendente |
| Lista de participantes conforme papel | Pendente |
| Cancelamento concorrente e reinscrição | Pendente |
| Verificação final e limpeza dos testes | Pendente |

SMTP, domínio e validação real da recuperação de senha continuam pendentes. Não implementar pagamentos, mercado ou avaliações durante esta homologação.

## Evidência de leitura pública em 13/11/2026

Sem qualquer escrita, a API do projeto configurado retornou:

- Consulta `events(capacity,active_registration_count)`: HTTP 200.
- Consulta aos campos da 003: HTTP 400 / `42703`, `events.poster_url` não existe.
- Consulta `event_combat_groups`: HTTP 404 / `PGRST205`, tabela ausente do cache de schema.
- Consulta `registrations.combat_group_id`: HTTP 400 / `42703`, coluna não existe.

Esses resultados indicam que 003/004 não estão integralmente disponíveis, mas não descartam objetos parciais. A chave pública não permite atestar todos os triggers/permissões nem executar DDL. Por isso o diagnóstico do SQL Editor é obrigatório antes de recomendar executar ou pular cada arquivo.

O diagnóstico foi testado em banco isolado nos estados: ambas ausentes, 003 parcial, somente 004 completa e ambas completas. Os testes de concorrência/RLS existentes continuaram aprovados. Essa verificação local não equivale à homologação autenticada no Supabase real.
