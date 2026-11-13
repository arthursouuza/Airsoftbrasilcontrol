# Capacidade e cancelamentos

A migração foi aplicada pelo administrador no projeto atual. A verificação
retornou zero inconsistências/duplicidades e três triggers habilitados. A
homologação remota com duas contas passou. **Não execute novamente a migração
no projeto atual.** As instruções abaixo ficam como referência de instalação.

## Revisão do que existia

O banco publicado tem unicidade global de `(event_id, player_id)`, mas não tem
capacidade, contador de ativos nem estado de cancelamento de inscrição. A busca
por vagas/cancelamentos na demonstração local não participa do Supabase.
O cancelamento de evento é diferente do cancelamento de uma inscrição.

## Aplicar a migração

1. No projeto Supabase `nzgpceglyxwtukrbdkam`, abra **SQL Editor → New query**.
2. Copie TODO o arquivo `supabase/migrations/202611130002_capacity_cancellations.sql`.
3. Clique em **Run** uma única vez. A migração inicial já existe: não a execute
   novamente. Se ocorrer erro, a transação inteira é desfeita; informe a mensagem
   sem credenciais para análise antes de repetir.
4. Execute `supabase/verificar_vagas.sql`. Esperado: zero inconsistências,
   zero pares com inscrições ativas duplicadas e os três triggers listados.
5. Informe que a migração foi aplicada para a homologação remota com as duas
   contas de teste e eventos novos. A interface preparada só deve ser publicada
   depois dessa homologação.

A chave pública não permite executar DDL; a aplicação da migração é feita pelo
administrador no SQL Editor. Não é necessário fornecer chaves secretas no chat.

## Regras implementadas

- `capacity = NULL` significa **sem limite definido**. Os eventos existentes
  preservam esse comportamento, sem escolher arbitrariamente uma lotação.
- `active_registration_count` é preenchido pela migração a partir das inscrições
  existentes e, depois, mantido por triggers. O cliente não pode escrever nele.
- Um UPDATE condicional na linha do evento reserva a vaga atomicamente.
  Concorrentes aguardam a mesma linha e reavaliam a lotação; não há consulta de
  disponibilidade seguida de INSERT desprotegido.
- A restrição de capacidade impede diminuí-la abaixo dos ativos, inclusive
  concorrendo com novas inscrições. A capacidade deve ser positiva ou NULL.
- Um índice único parcial permite somente uma inscrição **ativa** por jogador
  e evento. Uma inscrição cancelada fica no histórico; reinscrever cria outra
  linha, sem reativar ou reutilizar a inscrição anterior.
- Cancelamento muda `active → cancelled`, registra o horário no banco e decrementa
  a ocupação na mesma transação. Repetir o cancelamento é inofensivo e não
  decrementa novamente. Reativar inscrição cancelada é proibido.
- O jogador cancela somente suas inscrições; o organizador cancela inscrições
  dos seus próprios eventos. Demais leituras e escritas mantêm as políticas RLS.
- Não há DELETE de inscrições pelo cliente nem alteração de identidade/vínculos.
- Pagamentos existentes permanecem ligados às inscrições originais. Cancelar
  inscrição **não** marca pagamento como reembolsado nem faz estorno automático.
- Cancelar um evento não cancela automaticamente suas inscrições. Elas continuam
  disponíveis para consulta e cancelamento explícito, sem perder o histórico.

## Interface de vagas e cancelamentos

Cadastro de evento com capacidade opcional; vagas restantes no catálogo;
lotação esgotada; edição de capacidade pelo dono; cancelamento em Minhas
inscrições e lista de inscrições ativas do organizador com cancelamento.
O banco continua sendo a autoridade quando as vagas mudam entre exibição e clique.

## Testes locais executados

PostgreSQL 17 real em Docker, com banco temporário e três identidades locais de
teste (dois jogadores e um organizador). O teste mantém a primeira transação
aberta e verifica que a segunda realmente espera antes de liberar o lock:

- Duas inscrições na última vaga: uma aceita e outra rejeitada.
- Duas inscrições do mesmo jogador: uma aceita e outra rejeitada sem gastar vaga.
- Cancelamentos simultâneos/repetidos: uma única liberação e timestamp estável.
- Reinscrição após cancelar: nova linha e preservação do histórico.
- Jogador alheio não cancela; organizador consegue cancelar participantes.
- Redução da capacidade e inscrição concorrente, nas duas ordens.
- Rollback de reserva; bloqueio de adulteração do contador, vínculos e exclusões.
- Migração preserva inscrições e pagamentos legados e calcula a ocupação.

Para reproduzir, use Docker configurado e execute na raiz:

```sh
docker run -d --name abc-capacity-db -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17
npm run test:capacity:db
docker rm -f abc-capacity-db
```

Esse container não expõe portas. O teste cria e remove apenas seu banco temporário.
A autenticação local replica papéis e `auth.uid()` para testar as políticas;
não equivale a uma homologação do serviço Supabase hospedado.

## Homologação remota (concluída no projeto atual)

```sh
npm run test:capacity:remote
```

Usa as duas contas confirmadas configuradas em arquivos privados no ambiente.
Interrompe sem escritas se as colunas da migração ainda não existirem. Todos os
INSERTs são em eventos novos identificados como TESTE; não altera inscrições
preexistentes. Cancela somente IDs criados pelo teste, preservando o histórico.
Senhas não são geradas nem impressas. Se as credenciais antigas deixarem de
funcionar, configurar contas de teste pelo ambiente privado, sem enviá-las ao chat.

Domínio próprio, SMTP e validação real de recuperação de senha continuam adiados.

Resultados reais: concorrência na última vaga, duplicidade ativa, cancelamentos
simultâneos/repetidos, reinscrição, redução concorrente de capacidade e proteção
do contador passaram. O teste de interface real também validou o ajuste de
capacidade e os cancelamentos por jogador e organizador. Todos os eventos e
inscrições criados nesses testes foram cancelados; dados anteriores não foram
alterados. A versão publicada é conferida por comparação dos arquivos e
repetição dos fluxos no GitHub Pages.
