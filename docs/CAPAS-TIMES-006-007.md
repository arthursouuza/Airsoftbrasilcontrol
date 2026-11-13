# Capas da galeria e times PMC/CAMUFLADO

Base: d113cee6cab512c23b4fb076a58bc664cf9f17a9.

## Comportamento

- Criador ou administrador envia JPG/PNG/WebP até 5 MB, vê prévia e salva a capa pelo site. O link continua disponível como alternativa.
- Imagens ficam públicas no bucket event-covers; o caminho identifica o evento, sem e-mail ou dados do jogador. Somente criador/admin de evento não arquivado envia imagens. Não há sobrescrita nem exclusão de imagens antigas nesta atualização.
- A troca da capa verifica o valor anterior para evitar sobrescrever alteração concorrente. Falha no upload mantém a capa atual; falha posterior pode deixar um arquivo sem uso, sem alterar a capa.
- Novos jogos exigem capacidade par, a partir de 2. PMC e CAMUFLADO são criados automaticamente, com metade das vagas cada.
- Mudanças na capacidade total atualizam ambos os limites na mesma transação; reduções abaixo das reservas de qualquer time falham integralmente.
- Inscrição nova exige escolha do time. Um time lotado bloqueia inscrições mesmo com vagas no outro; o total do evento também é respeitado.
- Eventos existentes publicados/rascunhos com capacidade par e sem grupos recebem os dois times. Outros eventos mantêm os grupos e capacidade existentes e exigem revisão antes da conversão; o criador pode configurar os dois times quando não existem grupos.
- Inscrições antigas sem time continuam com o mesmo ID e pagamentos. O próprio jogador pode escolher uma vez, pela página do jogo. Não se cancela nem reinscreve automaticamente.
- A proteção de Carandiru permanece. Nenhum evento, inscrição ou pagamento é excluído, arquivado ou cancelado pelas migrações.

## Aplicação

1. Conferir projeto nzgpceglyxwtukrbdkam, 005 instalada, ausência de 006/007 e baseline de contagens/proteção.
2. Executar 202611130006_event_covers.sql uma vez e depois 202611130007_pmc_camuflado.sql uma vez.
3. Publicar o pacote compilado na branch codex/airsoft-admin-preservado (fonte atual do Pages).
4. Conferir login de criador, admin e conta comum, envio de capa de teste autorizado, bloqueio de edição por terceiro, escolha de time, time cheio e preservação de Carandiru e vínculos.

Não reaplicar 005. Não converter inscrições automaticamente em times. Não executar cancelamentos dos eventos de teste.

## Validação deste pacote

- Compilação esbuild concluída.
- PostgreSQL WASM isolado (PGlite): 001–007 aplicadas; limites, criação dos times, time cheio, redução inválida, escolha legada, preservação do pagamento, liberação de vaga, RLS de upload, autorização e conflito de capa aprovados.
- 56 testes de navegador aprovados: 47 na primeira execução e 9 na repetição após ajustar a simulação do endereço raiz e o roteiro antigo à capacidade mínima par. Incluem upload com falha/sucesso, prévia, formato inválido, time cheio, escolha legada, login, Modo Deus, catálogo e inscrições.
- O ambiente bloqueia conexões locais; os testes serviram os próprios arquivos por interceptação do navegador, com a API simulada. Nenhum teste de interface alterou dados de produção.
- PGlite usa sessão única; não substitui teste de concorrência com múltiplas conexões PostgreSQL nem teste do serviço Supabase Storage real (MIME/tamanho).
- Migrações 006 e 007 aplicadas uma vez e confirmadas pelo Supabase em 13/11/2026. Pós-verificação: 15 eventos, 23 inscrições, 4 pagamentos, nenhum contador divergente; Carandiru publicada/protegida, 75 vagas em cada time e inscrição original ativa sem time atribuído.
- Publicação do pacote e conferência final da interface seguem como etapa separada.
