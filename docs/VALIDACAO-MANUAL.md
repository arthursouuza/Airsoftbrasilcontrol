# Validar com login no próprio navegador, sem enviar senha ao chat

O desktop interativo não está disponível nas ferramentas deste turno. As
credenciais temporárias antigas não autenticaram na revisão anterior e não
foram reutilizadas nesta etapa. O caminho recomendado é executar o teste no
seu computador e digitar sua senha somente na janela do site.

## Preparar uma cópia local limpa

Use Node.js e uma conta Supabase já confirmada. Não precisa fornecer chave
secreta: o projeto já contém somente a chave pública destinada ao navegador.

```sh
git clone --branch feature/catalogo-visual https://github.com/arthursouuza/Airsoftbrasilcontrol.git
cd Airsoftbrasilcontrol
npm ci
npx playwright install chromium
npm run build
npm start
```

Se já tiver uma cópia local limpa, pode atualizar essa branch em vez de clonar.
Não sobrescreva alterações locais que queira preservar.

## Entrar e executar

Em outro terminal, dentro da mesma pasta:

```sh
npm run test:manual
```

O Chromium abrirá http://127.0.0.1:8000/connected.html. Entre com sua conta
confirmada diretamente no formulário do site. O teste aguarda até cinco minutos
pelo login e continua automaticamente. Ele não preenche, lê ou exporta a senha,
não exporta tokens e não grava arquivo de sessão no repositório. O site usa o
SDK normal para autenticar por HTTPS no Supabase. Não habilite gravação/trace
durante a digitação da senha.

O teste cria um evento novo chamado TESTE REVISÃO VISUAL, publica esse evento,
faz uma inscrição e cancela a inscrição, verificando que a vaga foi liberada.
No final cancela o evento de teste, mantendo histórico. Os seletores usam o
título exclusivo do evento criado; não selecionam inscrições preexistentes.

Resultado esperado:

```text
PASS login manual reconhecido; nenhuma credencial foi lida pelo teste
PASS criação e publicação do evento exclusivo de teste
PASS inscrição no evento de teste
PASS cancelamento e liberação da vaga
CLEANUP evento e inscrição de teste cancelados; histórico preservado
PASS revisão real concluída. Pode compartilhar somente estas linhas de resultado.
```

Compartilhe apenas essas linhas PASS/FAIL. Não envie senha, cookies, tokens,
links de recuperação ou arquivos de estado do navegador. Se faltar acesso à
conta, a homologação real permanece pendente; não desative a confirmação de e-mail
nem as regras RLS para liberar o teste.

Se houver falha de conexão após a criação, confira em Meus eventos o evento
TESTE REVISÃO VISUAL da tentativa e cancele apenas esse evento/inscrição de
teste. O roteiro tenta fazer essa limpeza automaticamente, mas não pode
confirmá-la se a sessão ou a conexão ficar indisponível.

## O que já foi validado nesta etapa

O roteiro também foi executado com API simulada, cobrindo criação, inscrição,
cancelamento e limpeza, sem ler senha ou token. Isso verifica a automação,
mas não equivale à sua execução autenticada real.
