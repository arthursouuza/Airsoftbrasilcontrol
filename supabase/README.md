# Banco inicial

No projeto `nzgpceglyxwtukrbdkam`, abra **SQL Editor → New query**, copie todo
o arquivo `migrations/202611130001_initial_schema.sql` e clique em **Run**.
Execute uma vez. A transação desfaz todas as alterações se ocorrer erro.
Se uma tabela já existir, interrompa e confira sua estrutura antes de adaptar
a migração. O script não apaga nem substitui tabelas existentes.

Depois execute `diagnostico.sql`: devem aparecer seis tabelas com RLS ativo
e suas políticas. O editor pode mostrar apenas o resultado da última consulta;
se necessário, execute cada SELECT separadamente.

## Regras iniciais

- Visitantes podem ler eventos publicados.
- Usuários autenticados criam e editam apenas seu próprio perfil.
- Equipes são visíveis aos autenticados; apenas o dono edita a equipe e
  adiciona membros. Um membro pode sair; o dono pode remover membros.
- Qualquer usuário autenticado pode criar eventos e se torna seu organizador.
  Apenas ele pode editar esses eventos, inclusive publicar ou cancelar.
- Jogadores se inscrevem em eventos publicados que ainda não começaram,
  uma vez por evento. Inscrições são visíveis ao jogador e ao organizador.
- Apenas o organizador registra e altera pagamentos manuais; o jogador
  pode consultar seus próprios pagamentos. Identificadores e vínculos não
  podem ser alterados pelo cliente após a criação.
- Não há exclusão de eventos, inscrições ou pagamentos pela API do cliente.

## Limites desta primeira versão

Perfis são criados explicitamente pelo aplicativo depois do login; não há
gatilho de cadastro automático. O frontend inclui cadastro, login, eventos
e inscrições via SDK Supabase. Limite de vagas, cancelamento
de inscrições, aprovação de organizadores e integrações de Pix automático
ou cartão exigem implementação posterior. O valor do pagamento manual é
informado pelo organizador; não há checkout ou confirmação por webhook.

## Validação após executar

Use duas contas autenticadas diferentes para verificar isolamento: uma cria
um evento, a outra se inscreve. A segunda não deve editar o evento nem criar
ou alterar pagamentos. Um visitante deve ver somente eventos publicados.
A execução da migração foi confirmada pelo usuário. O check público confirma
as seis tabelas e bloqueia acesso anônimo às tabelas privadas e gravações.
Os testes autenticados de login, eventos e inscrições passaram com uma conta
confirmada. O isolamento completo entre duas contas passou nas seis tabelas.
