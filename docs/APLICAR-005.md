# Administração e preservação de dados

A migração 005 revisada só deve ser aplicada após backup e restauração isolada.
Não reaplicar sobre uma 005 já instalada: comparar o schema e preparar uma migração
incremental antes. Nenhuma exclusão remota foi autorizada neste trabalho.

## Backup antes da migração

Configure `SUPABASE_DB_URL` como segredo do ambiente, com conexão PostgreSQL
administrativa, TLS válido e acesso de rede ao host/pooler. Não versionar a URI.
Execute `python3 scripts/backup-supabase.py`. O arquivo privado em `work/backups`
contém dados pessoais: copiar para armazenamento privado e criptografado.
O dump inclui schema e dados PostgreSQL, Auth e metadados do Storage. Os arquivos
binários do Storage, funções Edge e configurações externas precisam de backup separado.
O manifesto registra hash e leitura do catálogo; isso não prova restauração.

Restaure o dump em banco Supabase isolado compatível, nunca no banco de produção.
Use `pg_restore --exit-on-error --no-owner --no-acl` com a conexão de destino isolada.
Confira contagens, IDs e conteúdo de events, registrations, payments e grupos;
compare a Operação Carandiru e seus vínculos antes/depois. Não marcar o backup como
validado enquanto a restauração e essa comparação não passarem.

## Aplicação e publicação

Confirme a conta já indicada na 005 (UID + e-mail), a presença de 001–004 e se 005
já existe. Registre baseline privado de eventos, inscrições e pagamentos. Com backup
restaurado e validado, aplique a 005 como postgres no SQL Editor numa transação.
Ela não modifica eventos, inscrições ou pagamentos existentes: acrescenta schema,
permissões, auditoria e registra os IDs de eventos Carandiru como protegidos.

Teste login administrativo e comum, arquivar/restaurar um evento novo de homologação,
RLS e falhas sem alterar eventos existentes. Nunca excluir dados remotos de teste sem
aprovação. Compare baseline e Carandiru. Depois rode build, testes de navegador e banco.
Só então publique os arquivos estáticos da branch em GitHub Pages, verificando a
configuração atual de Pages antes de escolher o método. Não publique dumps, testes,
segredos, node_modules ou fontes de backup.

## Regras

O painel aparece em Minha conta após `is_site_admin` retornar booleano true.
RLS e RPCs conferem autorização no banco; não basta mudar HTML ou e-mail no navegador.
Arquivar mantém inscrições, pagamentos e contadores. Restaurar evento publicado passado
retorna a rascunho. Cada operação gera auditoria atômica. Falhas não geram falso sucesso.
O administrador não recebe UPDATE amplo sobre eventos de outros organizadores.
A exclusão exige evento arquivado, título exato como aprovação e ausência de qualquer
inscrição (até cancelada); pagamentos ficam preservados por seus vínculos.
Carandiru é protegida por título e por ID persistido, inclusive se renomeada.
Não executamos exclusões definitivas em produção durante validação.
