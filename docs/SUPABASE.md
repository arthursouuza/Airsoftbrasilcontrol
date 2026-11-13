# Supabase: preparação, conexão e homologação

**Estado: integração preparada, sem projeto Supabase conectado ou homologado.** Não publicar esta página como sistema pronto. A demonstração publicada em `main` continua independente. A branch `feature/supabase-auth` adiciona `connected.html`, sem alterar `index.html`, `app.js` ou `styles.css` da demonstração. Não mesclar/publicar antes da homologação abaixo. Não há migração de localStorage, seed, cobrança ou credenciais secretas nos arquivos.

## 1. Criar ou selecionar um projeto de homologação

No painel Supabase, crie um projeto separado para homologação (ou selecione um projeto vazio existente). Escolha a região e guarde a senha do banco no seu gerenciador de senhas. Não envie a senha, chave `service_role`, chave `sb_secret_*`, token pessoal do Supabase ou URL de banco com senha para o chat ou Git.

Para conectar o site são necessários somente:

- URL HTTPS oficial do projeto (`https://<project-ref>.supabase.co`).
- Chave **pública** `sb_publishable_*`, em Project Settings / API Keys. Ela será visível no navegador; a proteção depende de Auth + RLS, não do sigilo dessa chave. O código rejeita chaves secretas e as chaves JWT legadas para evitar confusão.

Se quiser que o Codex conecte e teste, forneça apenas esses dois valores públicos. Para aplicar migrações remotamente por CLI, autentique o CLI fora do chat com `supabase login` e use o gerenciador de segredos do ambiente para qualquer credencial adicional. Permita o host específico do projeto na rede do ambiente se estiver bloqueado. Nenhuma credencial remota está configurada atualmente.

## 2. Aplicar a migração

Instale o CLI Supabase pela documentação oficial. A partir desta branch:

```sh
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push --dry-run
supabase db push
```

Revise o projeto de destino e o plano antes do último comando. A senha, quando solicitada pelo CLI, deve ser fornecida por entrada segura; nunca a inclua em um comando salvo, arquivo versionado ou log. Como alternativa, execute o conteúdo de `supabase/migrations/20261113020000_auth_events_registrations.sql` pelo SQL Editor do projeto vazio, uma única vez. Não use os dois métodos de forma alternada sem conciliar o histórico de migrações do CLI.

A migração é transacional e não contém fixtures. Confira que as três tabelas possuem RLS habilitado e que as permissões de colunas foram aplicadas. Não execute a migração em um schema com tabelas homônimas sem revisar conflitos. Para rollback de homologação, prefira descartar o projeto de teste; não há script destrutivo automático sobre dados reais.

## 3. Configurar Auth

No projeto hospedado (o `config.toml` configura apenas o Supabase local):

1. Habilite o provedor Email/password, cadastro e **confirmação de e-mail**. Defina mínimo de 12 caracteres, regras de senha, limites de envio/tentativas e SMTP adequado antes de uso público.
2. Em URL Configuration, use como Site URL a URL exata da página de homologação `.../connected.html`. Adicione explicitamente à lista de redirects os endereços em que testar, por exemplo `http://localhost:5173/connected.html`, `http://127.0.0.1:5173/connected.html` e a URL de homologação HTTPS. Evite curingas amplos.
3. Ao publicar futuramente no Pages, autorize `https://arthursouuza.github.io/Airsoftbrasilcontrol/connected.html`. Isso só configura o retorno de Auth; não publica nem comprova a integração.
4. Preserve os templates padrão compatíveis com PKCE e a URL de redirect fornecida. Confirme e-mail/recupere senha **no mesmo navegador e origem** em que iniciou o fluxo (o verificador PKCE é local). Teste links expirados e reenvio antes de lançar. O botão “Recuperar senha” envia um link e o callback mostra o formulário de nova senha.

O cadastro cria a identidade em `auth.users`; o jogador salva o perfil depois do login. Não há trigger no cadastro que possa quebrar o envio de e-mail. A senha fica exclusivamente no Supabase Auth, nunca na tabela de perfis. Tokens de sessão são gerenciados pelo SDK no armazenamento do navegador, separados do localStorage da demonstração. Sair encerra a sessão neste dispositivo e limpa os dados privados exibidos; não encerra todas as sessões do usuário.

## 4. Configurar e executar o frontend

Requer Node 22+:

```sh
npm ci
cp .env.example .env
# Edite .env com URL e sb_publishable_* (somente dados públicos)
npm run config:local
npm run dev
```

Abra `http://localhost:5173/connected.html`. O comando gera `supabase-config.json`, ignorado pelo Git. `npm run build` gera `dist/` e sua configuração pública a partir de `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` do ambiente. Para usar o `.env` no build:

```sh
npm run build
node --env-file=.env scripts/config.mjs dist
npm run preview
```

Abra `http://localhost:4173/connected.html` no preview e autorize esse retorno no Auth se for testar confirmação/recuperação ali. Sem configuração, os formulários ficam desabilitados; não há fallback para dados fictícios. Uma configuração preenchida exibe “Integração em validação”, sem afirmar homologação. Não publique o `.env` ou fontes de segredos. Nunca use `service_role` no frontend ou nas variáveis de build.

## Modelo e proteção

- `profiles`: um perfil por `auth.users.id`; somente o próprio usuário lê/cria/edita. E-mail não é duplicado no perfil. Nome e equipe são compartilhados com o organizador somente quando há inscrição no evento dele.
- `events`: dados de eventos são públicos para navegação. Cada conta autenticada pode organizar seus próprios eventos (modelo de organização aberto, sem papel administrativo editável). Inserção vincula `organizer_id = auth.uid()`; só o dono edita. Organizador, id, timestamps e contador não podem ser alterados pelo cliente. Não há exclusão de evento pela API; encerre inscrições.
- `registrations`: usuário insere/cancela apenas a própria inscrição. Pode ver suas inscrições; organizador vê as de seus próprios eventos. Cancelamento exclui a inscrição ativa e libera a vaga; esta etapa não fornece histórico de cancelamento nem auditoria de pagamentos.
- `event_roster(uuid)`: função com validação explícita do dono, `search_path` vazio e execução restrita. Retorna somente nome/equipe e dados da inscrição no evento próprio, sem e-mail. Não abre acesso geral aos perfis.
- `UNIQUE(event_id, player_id)` impede duplicatas inclusive concorrentes.
- Trigger `AFTER INSERT` faz `UPDATE events SET occupied = occupied + 1 WHERE occupied < capacity AND NOT closed AND starts_at > now()`. O lock da linha serializa inscrições e alterações de capacidade; o contador e a inscrição pertencem à mesma transação. A constraint `0 <= occupied <= capacity` impede redução abaixo da ocupação. O trigger `AFTER DELETE` libera a vaga, inclusive em cascata de exclusão de perfil pelo administrador. `AFTER INSERT` evita contar inserções descartadas por `ON CONFLICT DO NOTHING`.
- O cliente não pode alterar o contador nem atualizar uma inscrição para transferir vaga/usuário/evento. Falha, rollback ou conflito não deixa vaga consumida. Em níveis de isolamento mais estritos ou deadlocks, uma transação pode ser abortada: o cliente deve atualizar e tentar novamente; nunca ignorar o erro.
- Rotinas de manutenção com credencial administrativa têm poderes para contornar RLS/desabilitar triggers: devem preservar estes invariantes. A aplicação não usa tais credenciais.
- Listas são atualizadas após operações e pelo botão Atualizar; não há assinatura Realtime. Outras abas/dispositivos podem mostrar contagem antiga, mas o banco decide a última vaga.

## Testes executáveis e seus limites

`npm run test:db` usa um PostgreSQL 17 local dedicado, cria um banco temporário, aplica a migração real e remove somente esse banco ao terminar. O script recusa hosts remotos. Não aponte para um banco real. Exemplo de infraestrutura descartável, sem senhas e restrita ao loopback:

```sh
docker run -d --name abc-postgres-test -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:55432:5432 postgres:17
npm run test:db
# Após os testes, remova apenas este container descartável:
docker rm -f abc-postgres-test
```

`auth.users`, `auth.uid()` e os papéis são simulados no PostgreSQL **apenas pelo teste**. A migração real usa os objetos do Supabase. O teste cobre RLS, grants por coluna, perfis privados, propriedade, roster, duplicatas, 20 acessos à última vaga, 10 duplicatas concorrentes, `ON CONFLICT`, cancelamento duplo, rollback, corrida com capacidade, eventos encerrados/passados e cascata. Não cobre o servidor Auth ou PostgREST hospedado.

Após `npm run build`, deixe `npm run preview` ativo e execute `npm run test:browser`. Requer Chromium (`CHROMIUM_PATH` opcional) ou `npx playwright install chromium`. O teste usa endpoints HTTP simulados: cobre estados de configuração, cadastro/confirmação, login, perfil, eventos, inscrição/cancelamento, erro de lotação do servidor, limpeza ao sair, escape de HTML e responsividade. **Não comprova integração real**. O workflow `supabase-checks.yml` executa esses mesmos testes e build, sem publicação ou acesso a projeto Supabase.

## Homologação necessária antes de publicar

Em um projeto de homologação com a migração aplicada:

- Criar e confirmar duas contas de jogadores e duas de organizadores em navegadores separados; testar login, persistência de sessão, recuperação e saída.
- Salvar/editar perfil e criar evento; confirmar que outro organizador não altera o evento, nem obtém roster/perfil alheio mesmo via chamadas REST manuais.
- Confirmar pelo REST que anon não cria/edita recursos e não lê perfis/inscrições. Verificar bloqueio ao forjar `player_id`, `organizer_id` ou `occupied`.
- Disputar uma última vaga com dois usuários simultâneos; apenas um deve ser confirmado. Repetir duplicata com duas sessões da mesma conta, cancelamento e redução de capacidade simultânea. Conferir a contagem diretamente no banco.
- Confirmar compartilhamento dos dados entre dispositivos, erros de rede sem falso sucesso e nenhuma importação de `abc-demo-v1`.
- Testar callbacks em sua URL definitiva, entrega SMTP e limites de Auth. Conferir os Security Advisors do projeto e as tabelas/grants/policies aplicados.

Somente após estes testes, preparar uma alteração separada para publicar `dist/` via workflow GitHub Pages. O Pages atual publica arquivos da `main` sem build; **não mescle esta branch esperando que os imports npm funcionem diretamente no Pages**. Esta branch não altera a configuração de publicação. O workflow futuro deve instalar dependências, gerar apenas a configuração pública, executar build e enviar `dist/` como artifact de Pages. Manter o acesso à demonstração local identificado. Pagamentos permanecem fora do escopo.
