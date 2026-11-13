# Retorno dos e-mails de confirmação

No projeto Supabase `nzgpceglyxwtukrbdkam`, abra
**Authentication → URL Configuration** e salve:

**Site URL**

```text
https://arthursouuza.github.io/Airsoftbrasilcontrol/
```

**Redirect URLs** — adicione estas entradas sem apagar destinos ainda utilizados:

```text
https://arthursouuza.github.io/Airsoftbrasilcontrol/auth-callback.html
http://127.0.0.1:8000/auth-callback.html
http://localhost:8000/auth-callback.html
```

O frontend envia explicitamente `emailRedirectTo` para `auth-callback.html`.
Em produção e previews, usa a URL pública fixa do GitHub Pages; em localhost,
usa a página de callback do servidor local. A página verifica a sessão e o
usuário no Supabase e retorna ao diretório do site. Links expirados ou inválidos
exibem orientação e removem os parâmetros da barra de endereços.

Se os templates de confirmação tiverem sido personalizados, confira em
**Authentication → Email Templates → Confirm signup** se o botão utiliza
`{{ .ConfirmationURL }}`. Não substitua esse valor por um link fixo ao site.
O template padrão não precisa ser alterado.

Essa configuração administrativa não pode ser lida ou alterada com a chave
pública. A página de callback somente existirá no GitHub Pages depois de
publicada. Links emitidos anteriormente não são modificados pela configuração.

Antes da publicação, testar o callback no servidor local e o isolamento entre
duas contas. Depois de publicar, validar o arquivo público e um link novo com
redirect para a URL pública. Não afirmar que o retorno público foi homologado
antes de o arquivo existir na hospedagem.
