# Validação da administração — 13/11/2026

Branch de trabalho: feature/catalogo-visual.

- Build com esbuild passou.
- Os 47 testes de navegador anteriores passaram.
- Três testes administrativos novos passaram: arquivar/restaurar, aprovação de
  exclusão por título (cancelamento e erro não chamam RPC), Carandiru sem botão
  de exclusão, logout, conta comum e erro do servidor sem falso sucesso.
- PostgreSQL 17 isolado em Docker: migrações 001–005 aplicadas; RLS e negação
  administrativa para conta comum; INSERT arquivado e memória NULL rejeitados;
  arquivar/restaurar; evento passado retorna a rascunho; Carandiru protegida após
  renomeação; pagamento pendente preservado; exclusão bloqueada por inscrição
  ativa ou cancelada; exclusão local de evento vazio com auditoria atômica.
- Nenhuma exclusão definitiva foi executada em produção. As exclusões dos testes
  ocorreram somente no banco temporário criado no container abc-admin-db.

Leitura pública real confirmou Operação Carandiru publicada, ID
b581d679-53ba-4479-8e92-9b44b7ab49b6. Consulta de archived_from_status retornou
42703 (coluna ausente), compatível com 005 ainda não instalada. Isso não confirma
por si só todo o schema remoto nem permite conferir pagamentos privados.

O ambiente não disponibiliza credencial administrativa Supabase. O script de
backup parou antes de acessar o banco por ausência de SUPABASE_DB_URL.
Backup efetivo e restauração NÃO executados; migração NÃO aplicada em produção;
conta administrativa ainda depende de confirmação do titular. Nenhuma publicação
Pages realizada. A leitura da configuração Pages via gh foi bloqueada por rede
(Forbidden em api.github.com). O conector GitHub disponível não expõe essa leitura.

Concluir backup/restauração, conferência privada de pagamentos e homologação
remota antes da publicação. Não confundir testes locais com validação em produção.
