# Administração pelo site

Endereço previsto: `connected.html#admin-panel`, após entrar em sua conta.
O painel ainda depende da migração 005 e da publicação aprovada. A implementação
local não significa que a versão em produção foi homologada.

A autorização é conferida no banco a cada chamada. A migração cadastra somente o
UID 76788b2d-a0a7-4423-8ef3-63f0b1975a7d e o e-mail arthur.pg040@gmail.com;
a função administrativa continua exigindo essa correspondência em auth.users.
O site usa apenas a chave pública. Não há service_role ou senha PostgreSQL no bundle.

## Recursos

- Eventos: criar, editar qualquer evento, alterar apresentação, capacidade, valores,
  datas e publicação; arquivar/restaurar individualmente ou arquivar em lote atômico.
  A seleção de lote exclui eventos protegidos; o banco também rejeita o lote inteiro
  se houver um evento protegido ou inválido. Lotes aceitam até 100 IDs distintos.
- Inscrições: consultar, criar para jogador existente com conferência de vagas e
  grupo, cancelar sem apagar vínculo nem pagamento. Vínculos são imutáveis.
- Jogadores: consultar e editar nome de exibição. Criação de conta, confirmação de
  e-mail, senha e recuperação continuam no Auth; o painel não acessa senhas.
- Equipes: criar/editar nome e descrição; adicionar membros, desativar/reativar o
  vínculo sem apagar histórico. Não transfere a propriedade por JSON.
- Grupos: criar/editar nomes e capacidades respeitando as reservas ativas.
- Pagamentos: registrar pagamentos manuais e atualizar valor, método e estado,
  com confirmação na interface e auditoria de antes/depois. O site não movimenta
  dinheiro nem executa Pix ou estorno bancário.
- Conteúdo: editar os seis blocos de texto do catálogo, times, organizadores e
  rodapé. O navegador usa textContent e não interpreta HTML vindo do banco.
- Auditoria: consultar alterações e operações de arquivamento/restauração/exclusão.

Formulários enviam o snapshot do registro editado. Se ele mudar, a transação é
rejeitada, evitando sobrescrever alterações concorrentes. Não há escrita ampla por
políticas RLS novas: as RPCs usam uma lista explícita de campos permitidos.
Não é possível promover jogadores, mudar IDs, donos, contadores ou vínculos financeiros.

## Preservação

Carandiru é protegida por ID persistente e por título. O trigger impede arquivar,
cancelar, tornar rascunho ou excluir, inclusive pelo organizador e após renomeação.
Arquivar eventos de teste mantém inscrições e pagamentos intactos. O lote dos 14
eventos deve ser identificado pelos IDs no inventário autenticado; não presumir que
todo evento diferente de Carandiru é teste.

Exclusão definitiva exige evento arquivado, ausência de qualquer inscrição e
aprovação pelo título exato. Carandiru nunca é elegível. Nenhum dado foi excluído
em produção pelo desenvolvimento. Exclusões dos testes usam somente bancos temporários.

## Segredos e execução real

Acesso e configuração segura de segredos foram autorizados pelo titular. O ambiente
atual ainda não fornece SUPABASE_DB_URL nem credencial administrativa válida.
Configure a URI PostgreSQL administrativa nos segredos do ambiente, com acesso de
rede ao host/pooler e certificado TLS válido. Adicione ABC_ADMIN_EMAIL e
ABC_ADMIN_PASSWORD para testes de login, sem enviar seus valores no chat.
A credencial temporária antiga foi recusada; não redefinimos a senha.

Ver `APLICAR-005.md` para backup, restauração, aprovação da migração e deploy.
