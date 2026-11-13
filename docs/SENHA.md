# Redefinir sua senha

1. Abra https://arthursouuza.github.io/Airsoftbrasilcontrol/connected.html#forgot-password.
2. Se já estiver conectado, clique em **Sair**. Abra **Esqueci minha senha**.
3. Informe seu e-mail e clique em **Enviar link de recuperação**.
4. Abra a mensagem do Supabase (confira o spam) e clique no link.
5. Na página **Defina sua nova senha**, digite uma senha de pelo menos oito
   caracteres, repita no campo de confirmação e clique em **Salvar nova senha**.
6. Após a confirmação de sucesso, clique em **Voltar ao site** e entre com a
   nova senha. A aplicação solicita o encerramento global das sessões anteriores.

Sua senha é digitada somente no formulário do site e enviada por HTTPS ao
Supabase. Não a envie no chat, não compartilhe o link do e-mail e não use uma
senha reutilizada de outro serviço. O site não armazena a senha em localStorage.
O SDK armazena a sessão de acesso, como nos demais fluxos de autenticação.

Se o link expirar ou já tiver sido utilizado, use **Solicitar novo link de
recuperação** na página de retorno. Use o e-mail mais recente. A página sem um
link válido não permite definir uma senha, mesmo havendo outra sessão no navegador.

Se aparecer **O limite de envio de e-mails do Supabase foi atingido**, o serviço
recusou o envio (HTTP 429). Aguarde a liberação antes de tentar novamente.
O administrador pode configurar um provedor SMTP próprio nas configurações de
e-mail/SMTP da autenticação do Supabase. As credenciais SMTP devem ficar somente
no painel do Supabase, nunca no chat ou no site.

## Configuração

A recuperação usa a mesma URL já autorizada de `auth-callback.html`. O SDK
solicita o e-mail com `resetPasswordForEmail`, valida a sessão/usuário no retorno
e envia a senha escolhida pelo usuário com `updateUser`. O retorno de confirmação
de cadastro continua abrindo a área conectada; o retorno de recuperação mostra
o formulário e aguarda o usuário.

Se os templates tiverem sido personalizados no painel, o template **Reset
password** deve usar `{{ .ConfirmationURL }}`. O template padrão já contém o
link correto; não é preciso configurar novas URLs.

## Validação

Testes Playwright com API simulada cobrem solicitação sem senha, retorno,
comparação dos campos, atualização da senha, encerramento global das sessões,
senha rejeitada e sessão inválida. Os textos de senha usados nos testes são
fictícios e nunca são enviados ao projeto Supabase real.

O teste com sessão real valida a abertura do formulário vazio e a remoção dos
tokens da URL, sem alterar senha. A alteração final real é feita exclusivamente
pelo próprio usuário ao abrir o link recebido e preencher o formulário.
