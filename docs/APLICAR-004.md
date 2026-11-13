# Grupos de combate — migração 004

Arquivo: `supabase/migrations/202611130004_combat_groups.sql`.

## Aplicação no Supabase

1. Abra o projeto correto no Supabase e entre em **SQL Editor → New query**. Execute primeiro `supabase/verificar_pre_requisitos_003_004.sql`: execute a 004 somente se `base_001_002_ok = true` e `migracao_004 = ausente`. Se estiver completa, não repita; se estiver parcial, confira os objetos antes de qualquer alteração.
2. Copie o conteúdo completo de `202611130004_combat_groups.sql`, incluindo `begin;` e `commit;`, e execute uma única vez.
3. Não repita 001 ou 002. A 004 pressupõe essas migrações já aplicadas. A 003 é editorial/opcional e não é necessária para a 004.
4. Abra outra consulta, copie `supabase/verificar_grupos.sql` por inteiro e execute.
5. Resultado esperado: `rls_grupos_ativo`, `organizador_pode_usar_rpc` e `escrita_direta_bloqueada` = **true**; `eventos_inconsistentes`, `grupos_inconsistentes` e `pares_ativos_duplicados` = **0**. `inscricoes_ativas_sem_grupo` pode ser maior que zero: são inscrições preservadas, não uma inconsistência.
6. Recarregue a interface da branch de revisão. Em **Minha conta → Meus eventos → Gerenciar grupos de combate**, defina nomes e limites por grupo. O banco rejeita nomes duplicados no evento e capacidade inferior à ocupação ativa.

A execução é transacional. Se ocorrer erro, a transação não é aplicada parcialmente. Não edite o script para pular o erro nem repita migrações anteriores; compartilhe apenas a mensagem de erro, sem credenciais. Uma segunda aplicação da 004 retorna tabela já existente, sem substituir a estrutura aplicada.

**Nesta entrega a 004 está preparada, não aplicada no Supabase. Main e GitHub Pages não foram atualizados.** Aplicar a 004 sem criar grupos mantém inscrições atuais funcionando no site anterior. A partir do primeiro grupo cadastrado, novas inscrições naquele evento exigem escolha de grupo no banco: cadastre grupos no ambiente real somente quando a interface correspondente estiver disponível aos jogadores. Não crie grupos de teste em eventos reais apenas para avaliar a prévia.

## Como funciona

- `event_combat_groups` é uma nova tabela. O texto editorial `events.groups`, se existir, não é convertido nem apagado.
- O organizador cria/edita grupos via RPC `save_combat_group`. Não existe escrita direta de cliente na tabela, incluindo contadores, capacidade ou exclusão.
- Nomes, limites e ocupação são visíveis para eventos publicados. Grupos de rascunhos/cancelados só ficam visíveis ao organizador.
- Todas as operações que alteram ocupação/grupos usam a linha do evento como ponto comum de bloqueio. A inscrição reserva a vaga total e a vaga do grupo na mesma transação. Se uma reserva falha, nenhuma vaga é consumida.
- A soma dos limites dos grupos pode superar a capacidade total: o limite do evento também é obrigatório. Vagas por grupo não aumentam o limite total.
- Evento sem grupos continua com o fluxo antigo. Depois do primeiro grupo, novas inscrições exigem um grupo válido daquele evento. Inscrições anteriores sem grupo são preservadas, com indicação explícita na interface.
- O grupo de uma inscrição é imutável. Para trocar, cancele e inscreva-se novamente; a vaga não fica garantida entre as operações. Não se reativa a inscrição cancelada.
- Cancelamento pelo jogador ou organizador libera as duas vagas uma vez. O histórico de grupo permanece na inscrição cancelada.
- O índice único já existente continua impedindo duas inscrições ativas do mesmo jogador no evento, inclusive em grupos diferentes.
- Não há exclusão de grupos nesta etapa: preservar vínculos e histórico é parte da implementação.

## Participantes e permissões

As políticas de `registrations` não foram ampliadas. Jogador consulta somente suas inscrições; o organizador consulta e cancela inscrições dos próprios eventos. Outros jogadores e visitantes não recebem lista de participantes.

Em **Meus eventos → Ver inscrições ativas**, o organizador vê o identificador da inscrição, data e grupo, com a opção de cancelamento já existente. Em **Minhas inscrições**, o jogador vê seu próprio grupo. Nomes/e-mails de outros jogadores não são divulgados: a política de perfis permanece privada.

## Validação e prévia

Testes de banco usam PostgreSQL 17 real em Docker, com três identidades isoladas e um banco temporário exclusivo removido ao terminar. Não usam credenciais nem dados do Supabase real.

```sh
docker --host=unix:///var/run/docker.sock run -d --name abc-groups-db -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17
# Sem publicação de portas; aguarde pg_isready dentro do container.
docker --host=unix:///var/run/docker.sock exec abc-groups-db pg_isready -U postgres
npm run test:groups:db
```

O comando pressupõe o container `abc-groups-db` pronto. Se ele já existir, reutilize-o; o teste cria e remove apenas o próprio banco temporário. Não aponte esse script para um banco remoto.

Cenários: preservação do legado/pagamentos; aplicação sem 003; compatibilidade posterior com 003; última vaga do grupo e do total em sessões concorrentes; duplicidade em grupos distintos; cancelamento simultâneo/repetido; reinscrição; redução de limite nas duas ordens; rollback; cancelamento disputando nova reserva; criação do primeiro grupo concorrendo com inscrição sem grupo; RLS; grupos de outro evento; cadastro por terceiro; acesso anônimo; escrita direta bloqueada; contadores e vínculo imutáveis; rascunhos privados; validação final de consistência.

Os testes Playwright usam API simulada e cobrem escolha obrigatória, grupo lotado, retorno ao grupo escolhido após login, reserva explícita, cancelamento, gestão por RPC, participantes, falhas de consulta, compatibilidade anterior à migração e layout em celular/computador. As capturas de grupos são identificadas **TESTE LOCAL** e não representam grupos já cadastrados na Operação Carandiru.

Depois de aplicar no Supabase e liberar uma prévia acessível, falta validar ponta a ponta com duas contas confirmadas, em evento exclusivo de teste: criar dois grupos, disputar última vaga, conferir mensagens/ocupação e cancelar. Cada titular digita a senha no próprio site; nenhuma senha ou chave secreta deve ser enviada no chat. Não publicar nem atualizar a main antes da revisão autorizada.

O acompanhamento completo com duas contas está em `HOMOLOGACAO-GRUPOS-DUAS-CONTAS.md`. Diagnóstico pelo SQL Editor e homologação remota ainda não foram concluídos.
