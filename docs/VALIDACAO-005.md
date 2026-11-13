# Validação da administração — 13/11/2026

O commit ff64e28 está preservado no histórico. O remoto feature/catalogo-visual
permanecia em 436b747 na leitura anterior à preparação desta revisão.

## Evidência local

- Build passou. Os 53 testes completos de navegador passaram antes da adição do
  lote; depois, os sete testes administrativos passaram, incluindo o novo lote.
- PostgreSQL 17 isolado: 001–005 aplicadas; RLS, negação a conta comum/anônima,
  INSERT arquivado e memória NULL rejeitados; restauração passada volta a rascunho;
  Carandiru renomeada continua publicada e não pode ser excluída.
- RPCs de eventos, jogadores, equipes, membros reversíveis, grupos, inscrições,
  pagamentos e conteúdo passaram. Campos não permitidos, mudança de vínculo,
  capacidade inválida e edição com snapshot desatualizado foram rejeitados.
- Cancelamento libera contadores e preserva pagamentos. Um lote com Carandiru é
  inteiramente revertido; lote válido arquiva e gera auditoria por evento.
- Ensaio local de backup: pg_dump com snapshot exportado, hashes de todas as tabelas
  public/auth/storage do fixture, restauração em outro banco temporário e comparação
  SHA-256 passaram. Nenhum Supabase remoto foi restaurado.
- Interface: aprovações recusadas não chamam exclusão/lote; Carandiru sem seleção de
  lote ou botão de exclusão; edição envia snapshot; pagamentos usam centavos;
  texto HTML de conteúdo é exibido literalmente; logout limpa o painel.

## Evidência pública real

scripts/production-smoke.cjs abriu o Pages atual no Chromium: HTTP 200, login
publicado e sem admin-panel no HTML implantado. Carandiru permanece published,
ID b581d679-53ba-4479-8e92-9b44b7ab49b6. A navegação HTTP real passou via
Playwright route.fetch, com a CA do ambiente e verificação TLS ativa, devido à CA
não instalada no Chromium. Nenhum arquivo local substituiu a hospedagem.
Consulta anônima só vê Carandiru; não revela os 14 eventos privados de teste.

Após autorização para acesso seguro, a credencial temporária privada antiga foi
usada uma vez para tentar login real; Supabase retornou HTTP 400. Não houve nova
tentativa, redefinição de senha ou alterações em tabelas. Não houve login
administrativo bem-sucedido nesta revisão.

## Pendente em produção

Faltam SUPABASE_DB_URL, conectividade PostgreSQL e credencial/sessão válida da conta
administrativa. Não há backup real nem restauração desse backup. Não foi aplicada
migração, não foram arquivados os 14 eventos e não houve exclusão definitiva remota.
Acesso a segredos foi autorizado; aprovação de migração e confirmação do deploy
continuam necessárias. Não foi publicado o novo painel nem homologado em produção.
