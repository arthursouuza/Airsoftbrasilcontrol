# Comparação funcional com a gravação

Base visual aprovada pelo usuário em 13/11/2026. A comparação usa a gravação recebida; nova tentativa de acessar https://combatzilla.com em 13/11 retornou 403 do proxy. Não foi possível verificar as regras internas, APIs ou todos os fluxos do site original.

| Recurso visto na gravação | Estado no Airsoft Brasil Control |
| --- | --- |
| Catálogo com cartazes, próximos jogos e recém-chegados | Implementado com eventos reais do Supabase; um cartão ocupa a largura disponível, vários usam faixa horizontal no celular. |
| Página individual com descrição, ingresso, horário, localização e regras | Implementada. Imagem e conteúdo editorial dependem de dados cadastrados e dos campos opcionais da migração 003. |
| Acesso e confirmação | Implementados por e-mail com Supabase. O acesso por telefone/WhatsApp da referência ainda precisa de provedor e configuração próprios; a confirmação por e-mail permanece obrigatória. |
| Inscrever e cancelar, limite de vagas | Implementados com regras e triggers existentes; nenhuma mudança de banco nesta revisão. |
| Times | Listagem autenticada existente; não equivale ainda aos perfis e interações completos da referência. |
| Grupos de combate | Apresentação textual opcional; escolha de grupo, vagas por grupo e integrantes precisam de modelo relacional, regras de acesso e testes de concorrência próprios. |
| Mais de uma modalidade de ingresso e pagamento on-line | Há um ingresso individual com preço real e pagamento combinado com organizador. Compra, gateway, webhooks, conciliação e estorno ainda não implementados. |
| Mercado | Ainda não implementado; exige anúncios, mídia, propriedade e moderação. |
| Avaliações, reputação e perfis detalhados | Ainda não implementados; exigem regras de participação, privacidade e proteção contra avaliações duplicadas. |

O objetivo de equivalência funcional está registrado. Não apresentar essas lacunas como concluídas nem criar controles sem ações reais. Prioridade do próximo módulo foi perguntada ao usuário; enquanto não respondida, não assumir contratação/configuração de provedores nem alterar o banco real.

## Pendências anteriores preservadas

Migração 003 opcional ainda não aplicada; fotografia real de Operação Carandiru; testes autenticados reais acompanhados pelo titular; domínio/SMTP e validação real do recebimento de recuperação de senha. Nenhuma senha deve ser compartilhada no chat. Confirmação e RLS permanecem ativas.
