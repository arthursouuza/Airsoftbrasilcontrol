# Aplicação da 005 e publicação

Esta versão amplia a 005 ainda não instalada, preservando o commit ff64e28 como
ancestral. Se a 005 já tiver sido instalada, não reaplicar: comparar o schema e
preparar migração incremental. Executar como postgres; as funções de arquivo
usam esse proprietário no controle de escrita do status arquivado.

## 1. Acesso e inventário

Configure SUPABASE_DB_URL e as credenciais de teste nos segredos do ambiente.
Libere o host PostgreSQL/pooler na rede do ambiente e mantenha TLS validado.
`python3 scripts/admin-preflight.py` verifica UID/e-mail e coleta um inventário
privado com os dados visíveis via RLS, sem alterar tabelas. A exportação REST é
parcial e não consistente; não substitui o backup completo. A conta comum pode
não conseguir inventariar dados de outros organizadores antes da migração.

Antes de qualquer alteração em produção, identificar os 14 eventos por IDs,
conferir Carandiru publicada e registrar baseline privado de eventos, inscrições,
pagamentos e grupos. Não inferir os IDs por posição na lista nem apenas por título.

## 2. Backup verificável

`python3 scripts/backup-supabase.py` usa pg_dump/psql/pg_restore compatíveis com o
servidor. A URI fica no ambiente, nunca no código, argumentos de processo ou logs.
TLS é forçado a verify-full; configure PGSSLROOTCERT se necessário.
O processo exporta um snapshot read-only, produz dump custom e hashes SHA-256 de
todos os registros das tabelas public/auth/storage no mesmo snapshot.
Dumps e manifestos ficam em work/backups, privados e ignorados pelo Git.

`python3 scripts/verify-restore.py work/backups/ARQUIVO.dump` verifica o hash do dump,
restaura exclusivamente num banco temporário do container local abc-admin-db e
compara todos os fingerprints. Só marca restore_verified se a comparação passar.
Requer PostgreSQL e extensões compatíveis. Um dump Supabase com extensões específicas
pode exigir ambiente local Supabase compatível; falha não deve ser ignorada.
O banco temporário é removido ao terminar. Não há destino de restauração remoto.

O dump contém PostgreSQL e metadados do Storage. Binários de Storage, funções Edge,
configuração de Auth/SMTP e demais configurações externas precisam de backup separado.
Guarde a cópia verificada em armazenamento privado criptografado antes da migração.
Não tratar o teste do fixture local como backup de produção.

## 3. Aprovação da migração e arquivamento

Com o backup real restaurado e comparado, apresentar hash e diff da 005, baseline e
lista dos 14 eventos ao titular. Obter aprovação explícita antes de aplicar SQL ou
alterar produção. Executar a migração numa transação como postgres.
A migração acrescenta schema, auditoria, políticas, conteúdo inicial e o indicador
active dos membros; não altera eventos, inscrições ou pagamentos existentes.

Após aprovar o arquivamento dos IDs revisados, usar admin_archive_events na conta
administrativa para lote atômico. Verificar que os 14 estão archived, Carandiru
continua published, e que os hashes de inscrições/pagamentos não mudaram.
Nunca executar admin_delete_event durante essa validação sem aprovação específica.

## 4. Homologação e deploy

Rode build, npm test e npm run test:admin:db. Depois faça login administrativo real
no navegador e verifique também a conta comum. Testes de criação/edição reais devem
usar eventos identificados de homologação e autorização para alterar produção;
arquive os fixtures no final e preserve inscrições/pagamentos.

Confirme a configuração atual do GitHub Pages. scripts/prepare-pages.cjs prepara
somente os arquivos públicos em work/pages-COMMIT, com hashes e version.json. Não
inclui dumps, segredos, fontes, scripts, testes nem node_modules. Exige Git limpo.
Peça confirmação do titular para o commit/artefato antes do deploy de produção.
Não fazer merge ou atualizar a branch usada pelo Pages sem essa confirmação.

Após o deploy, consulte version.json, abra o site real, teste login, RLS, painel,
conteúdo e Carandiru, e registre os resultados. scripts/production-smoke.cjs lê a
hospedagem atual e o Supabase em navegador real sem substituir arquivos por versões
locais nem alterar tabelas. Ele sozinho não homologa login ou mutações administrativas.
