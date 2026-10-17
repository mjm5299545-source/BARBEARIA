# Validação da integração Supabase — 17/10/2026

## Entrega no código

O design público aprovado, logo, fotografias, fontes, paleta, animações e seções foram preservados. Nenhum dado de produção foi apagado. Não houve acesso ao projeto Supabase do outro site.

A auditoria encontrou autenticação própria anterior, ausência de integração Supabase Auth e de gestão de clientes. No domínio publicado, antes desta atualização, `/api/health` retornou HTTP **503**, código `SETUP_REQUIRED`, pedindo `DATABASE_URL`. `/api/setup/status` informou `configured: false`, `required: true`, `setupKeyConfigured: false`, `uploadsConfigured: false`. Esse é um bloqueio de configuração externo confirmado. Não foi possível inspecionar logs privados da conta Vercel ou o painel da conta Supabase.

Foram implementados:

- Supabase Auth pela API do servidor, sessão opaca HttpOnly/Secure, CSRF, limite absoluto de oito horas, renovação serializada de tokens e encerramento no logout. Credenciais do provedor cifradas no banco; nenhuma chave `service_role` necessária.
- Autorização administrativa vinculada ao ID confirmado no Supabase, sem confiar em metadados ou permitir promoção por cadastro comum. Assistente para autorizar uma conta já criada no projeto novo, protegido por chave temporária e trava transacional.
- Migrations versionadas, dados preservados, identidade vinculada a `auth.users`, clientes/histórico, validações e índices. Conexão de aplicação separada da conexão administrativa. Conferência do Project Ref antes de acesso ao banco.
- RLS e FORCE RLS em todas as tabelas privadas; acesso direto negado a anon/authenticated. Papel do servidor sem SUPERUSER, BYPASSRLS ou permissão de DDL.
- Clientes com busca, paginação, histórico e edição protegida, sem alterar snapshots dos atendimentos antigos. Indicadores, próximos atendimentos e popularidade calculados no banco inteiro.
- Recuperação de erros do painel, retorno ao login quando a sessão expira, atualização periódica de agenda/painel/reserva e bloqueio síncrono de envio duplicado no formulário.
- Exclusão de serviços apenas quando não possuem vínculos/histórico; preservação por desativação nos demais casos. Remarcação não reativa reservas canceladas durante uma operação simultânea.

## Execuções concluídas

| Verificação | Resultado |
| --- | --- |
| `npm run test:postgres` (inclui build/TypeScript) | **38 aprovados, 0 falhas, 0 ignorados** |
| PostgreSQL + Supabase Auth (GoTrue v2.177.0) | Serviços reais em containers descartáveis; não foram usados mocks de autenticação/banco |
| Teste adicional da integração com extensão `btree_gist` no schema `extensions` | **7 aprovados, 0 falhas**, verificando a disposição usada pelo Supabase |
| `npm test`, modo SQLite sem provedores externos | **30 aprovados, 0 falhas, 8 ignorados** por ausência intencional dos provedores nesse comando; os mesmos cenários externos foram executados no comando completo |
| `npm audit --omit=dev` | **0 vulnerabilidades reportadas** nas dependências de produção |
| Rotas de `vercel.json` com `@vercel/routing-utils` | Configuração válida |
| `git diff --check` | Sem erros |

Os testes incluem login e primeiro acesso no Chromium, rejeição de senha incorreta/conta comum/CSRF, renovação concorrente, expiração, revogação de permissão, logout no provedor, falha real de conexão e recuperação, criação/edição de serviços e profissionais, preços refletidos no site, períodos e bloqueios, duas reservas simultâneas com um único sucesso, restrição de exclusão por SQL direto, consulta/remarcação/cancelamento, snapshots de preço, clientes, persistência em conexão independente, upload local validado, publicação de conteúdo, navegação e agendamento mobile. O fluxo mobile também foi executado contra a integração Supabase real; dois eventos de confirmação seguidos gravaram apenas uma reserva, e uma alteração administrativa apareceu no link do cliente.

As verificações de navegador foram automatizadas com Playwright/Chromium. Não houve homologação manual por um operador real da barbearia nem teste de carga. Nenhum resultado local é apresentado como teste da conta Supabase/Blob de produção.

## Dependências externas e prontidão

**A produção ainda não está pronta para receber reservas reais.** Falta criar e configurar o projeto Supabase exclusivo, executar migrations nesse projeto, configurar as variáveis seguras da Vercel, conectar Blob e autorizar o primeiro administrador. Veja as etapas exatas em [SUPABASE.md](SUPABASE.md) e [VERCEL.md](VERCEL.md).

Depois do deployment, ainda é necessário validar Auth, persistência, upload Blob, TLS/conexão do Session pooler, domínio, dados comerciais oficiais e backup/recuperação no ambiente real. Os testes com PostgreSQL/GoTrue locais e do handler serverless comprovam os fluxos no ambiente de desenvolvimento, mas não comprovam essas integrações externas.

O limite de conexões do Session pooler deve ser acompanhado conforme o plano e a concorrência das funções. A agenda carrega até 5.000 reservas, o histórico individual até 1.000 e clientes são paginados de 50 em 50; indicadores usam o banco inteiro. WhatsApp continua como conversa por link e registro manual pelo administrador, sem mensagens ou confirmações automáticas simuladas.
