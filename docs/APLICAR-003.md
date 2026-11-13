# Aplicar a migração 003 sem substituir dados

A revisão parte do commit 8966eee da branch feature/catalogo-visual.
A consulta pública atual retornou coluna `poster_url` inexistente: a migração
003 ainda não está disponível no projeto consultado. Nenhum DDL foi executado
remotamente nesta revisão.

## O que o SQL faz

Arquivo: `supabase/migrations/202611130003_event_presentation.sql`.

Adiciona `poster_url`, `cover_url`, `groups`, `schedule` e `rules` como campos
opcionais, sem valor padrão. Os registros existentes permanecem no banco e os
novos campos ficam NULL. Não contém UPDATE, DELETE ou TRUNCATE de dados.

Aceita URLs HTTPS de até 2048 caracteres e textos de até 20000 caracteres.
Concede INSERT/UPDATE apenas dessas colunas ao papel authenticated. As políticas
RLS existentes continuam exigindo o organizador dono do evento para escrita.
Não altera capacidade, contador, inscrições, pagamentos, cancelamentos, triggers
de vagas ou confirmação obrigatória de e-mail.

## Passo a passo no projeto nzgpceglyxwtukrbdkam

1. Abra **Supabase → SQL Editor → New query**.
2. Execute o conteúdo de `supabase/verificar_apresentacao.sql`. Essa consulta é
   somente leitura e funciona mesmo antes de as colunas existirem.
3. Se `campos_apresentacao` e `restricoes_apresentacao` forem 0, execute TODO o
   conteúdo de `202611130003_event_presentation.sql` uma única vez em outra query.
   Não execute novamente as migrações 001 ou 002.
4. Se campos/restrições já forem 5, não repita a migração; apenas confira os
   demais resultados. Se houver contagens intermediárias ou erro, não apague
   tabelas/colunas: informe somente a mensagem e o resultado para revisão.
5. Execute novamente `verificar_apresentacao.sql`. Resultado esperado na mesma
   linha:

| Campo | Esperado |
|---|---|
| campos_apresentacao | 5 |
| restricoes_apresentacao | 5 |
| rls_eventos_ativo | true |
| permissoes_apresentacao_ok | true |
| triggers_vagas_ativos | 3 |

6. Execute também `supabase/verificar_vagas.sql`. A migração de apresentação não
   deve causar inconsistência de contagem ou duplicidade ativa; os três triggers
   de vagas devem continuar habilitados.

O script 003 usa BEGIN/COMMIT: erro desfaz as alterações daquela execução.
Se for executado uma segunda vez após sucesso, o erro de coluna existente não
significa que seja preciso apagar ou repetir as migrações anteriores.

## Depois da aplicação

Na prévia desta branch, entre como organizador, abra Meus eventos → Editar
apresentação do jogo. Cadastre URLs de imagens reais e grupos/programação/regras
reais. Campos vazios continuam como NULL. A interface anterior permanece
compatível porque as colunas foram adicionadas, sem renomear/remover campos.

Aplicar SQL não publica a interface e não atualiza a branch main. Esta revisão
permanece separada até aprovação. Grupos/programação são informações fornecidas
pelo organizador; a inscrição continua individual, com a mesma lotação atômica.
Não foi inventado estoque por grupo nem checkout de pagamentos.

## Teste executado

PostgreSQL 17 isolado: verificação antes da migração retorna `0|0|t|f|3` e,
depois, `5|5|t|t|3`. A edição por outro usuário é bloqueada pela RLS, URL não HTTPS
é rejeitada e os testes de preservação de registros, concorrência e cancelamento
continuam passando. O banco temporário do teste é descartado.
