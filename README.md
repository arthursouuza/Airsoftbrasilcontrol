# Airsoft Brasil Control

Demonstração estática responsiva em português, publicada pelo GitHub Pages a partir da `main`.

## Executar

Sem build ou dependências de produção. Execute `python3 -m http.server 8000` na raiz e abra http://localhost:8000.

## Funcionalidades locais

- Busca de eventos e filtro por disponibilidade.
- Cadastro de jogadores de teste com validação de e-mail duplicado.
- Criação/edição de eventos, preço informativo, capacidade e encerramento de inscrições.
- Inscrição local com bloqueio de duplicidade e lotação, cancelamento e liberação de vaga.
- Painel com contadores e lista de inscritos por evento; restauração com confirmação.
- Persistência no `localStorage` (`abc-demo-v1`), atualização entre abas e aviso em falha de leitura/escrita.

Os eventos iniciais são fictícios. Dados pertencem ao navegador/origem atual e podem ser apagados. Não digite dados pessoais reais. O painel é aberto, sem autenticação. A atualização entre abas não fornece transações nem evita corridas simultâneas; a contagem é apenas demonstrativa. Não há garantia de vagas reais, isolamento por organizador ou cobrança.

## Para produção

1. Autenticação, recuperação de conta, verificação e autorização no servidor por organizador/jogador.
2. API e banco de dados compartilhado com validações no servidor, restrições únicas de inscrição e transações para reservas concorrentes, auditoria e políticas de proteção/retenção de dados.
3. Gateway Pix/cartão, checkout seguro, confirmação por webhook verificado e idempotente, expiração de reservas, conciliação e reembolsos. Nunca tratar preço ou confirmação local como pagamento.

GitHub Pages hospeda os arquivos estáticos; esses serviços precisam de um backend externo. Os caminhos de CSS/JS são relativos para funcionar no subdiretório `/Airsoftbrasilcontrol/`.
