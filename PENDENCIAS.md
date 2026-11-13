# Pendências e próximas melhorias

## E-mails e recuperação de senha — adiados por decisão do usuário

- Manter o endereço atual: https://arthursouuza.github.io/Airsoftbrasilcontrol/.
- Registro de domínio, Resend e SMTP próprio ficam adiados.
- Pendente: garantir envio e recebimento reais dos e-mails de confirmação e
  recuperação. A última tentativa de recuperação retornou HTTP 429 do Supabase,
  código `over_email_send_rate_limit`; não comprova indisponibilidade permanente.
- Pendente: validar o fluxo real completo de recuperação — recebimento, abertura
  do link, nova senha definida pelo usuário e login com a nova senha.
- O formulário e o callback já estão implementados; testes simulados de alteração
  de senha e testes com sessão real não substituem a validação completa acima.
- Manter confirmação de e-mail obrigatória e todas as políticas de acesso/RLS.
  Não contornar os limites do serviço nem considerar o envio homologado.
- A senha temporária não foi substituída pelo agente. O usuário definirá sua
  própria senha quando o fluxo real puder ser concluído.

## Melhorias sem dependência de SMTP próprio

Usar as contas já confirmadas nos testes autenticados. Novos cadastros continuam
dependendo de receber e confirmar o e-mail pelo serviço atual.

1. Busca e filtros por título, local e data implementados na área conectada.
   Paginação continua como melhoria futura.
2. Edição de eventos pelo organizador, com validações no banco e na interface.
3. Limite de vagas e cancelamento com liberação atômica: migração aplicada e
   homologação com duas contas concluída. Histórico e permissões preservados.
   Guia: `docs/VAGAS.md`.
4. Painel do organizador com inscritos, contadores e pagamentos manuais,
   preservando o acesso exclusivo aos dados permitidos.
5. Edição de perfil e gestão de equipes/membros, mantendo as regras existentes.
6. Melhorias de navegação, acessibilidade, mensagens de erro e estados de espera.

Cada melhoria requer implementação e validação próprias; esta lista não indica
que os recursos já existem. Priorização sugerida após os filtros: edição de eventos,
controle de vagas e cancelamento, painel de inscritos.

## Revisão visual em branch separada

- Branch `feature/catalogo-visual`; main e PR #1 preservados.
- Referências bloqueadas pelo proxy; comparação com a gravação ainda pendente.
- Migração opcional 003 e cadastro de cartazes/capa/grupos/regras reais pendentes.
- Homologação autenticada real com credenciais de teste válidas pendente.
- Prévia e detalhes: `docs/VISUAL-REVIEW.md`. Não publicar antes da revisão.
