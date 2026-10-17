# Supabase exclusivo da Barbearia Grecco

O design aprovado foi preservado. Esta integração usa Supabase Auth para as contas e PostgreSQL do mesmo projeto para a operação. O navegador chama somente a API da Grecco; não recebe JWT, refresh token, conexão de banco nem chave administrativa. Não é necessária chave `service_role`.

## 1. Criar o projeto certo

Na organização Supabase, escolha **New project**, crie um projeto exclusivo para **Barbearia Grecco** e anote o Project Ref em Settings → General. Não selecione, migre ou reutilize o projeto do outro site. O código confere se URL de autenticação e conexão PostgreSQL pertencem ao mesmo Project Ref antes de consultar ou migrar o banco.

Se houver dados da Grecco em outra base, faça backup e planeje sua transferência antes de trocar a conexão. Estas migrations preservam registros existentes e não transferem dados de outro projeto automaticamente. Não apague a base anterior.

Em **Authentication → URL Configuration**, configure **Site URL** como `https://grecco-barber.vercel.app`. Remova URLs de exemplos; adicione somente domínios de confiança em Redirect URLs. O login atual usa senha pela API do servidor e não depende de callback ou token na URL. Recuperação de senha pode ser enviada pelo painel Supabase; configure um SMTP e um fluxo de recuperação antes de disponibilizar recuperação automática no site. Cadastros públicos devem ficar **desativados** em Authentication → Providers → Email; crie a conta do responsável em Authentication → Users → Add user com e-mail confirmado e senha forte de pelo menos 12 caracteres. Nenhum metadado enviado por usuários concede permissão de administrador.

## 2. Executar as migrations uma vez

Use Node **24.x** e um terminal seguro com as dependências instaladas. Injete as variáveis com seu gerenciador de segredos ou arquivo privado fora do Git (`node --env-file=/caminho/privado ...`). Não copie segredos para comandos gravados no histórico, este documento ou o chat.

| Variável do comando | Valor |
| --- | --- |
| `SUPABASE_URL` | Project URL HTTPS do projeto novo. |
| `SUPABASE_PROJECT_REF` | Project Ref do projeto novo. |
| `GRECCO_CONFIRM_PROJECT_REF` | O mesmo Project Ref, conferido manualmente antes de autorizar migrations. |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável (ou anon legada) do projeto novo. |
| `SESSION_ENCRYPTION_KEY` | 32 bytes aleatórios em hexadecimal, 64 caracteres; mantenha o mesmo valor no servidor. |
| `DATABASE_MIGRATION_URL` | Conexão administrativa do projeto novo, **Session pooler**, porta **5432**, usuário `postgres.PROJECT_REF`, ou conexão direta `db.PROJECT_REF.supabase.co`. |
| `DATABASE_APP_PASSWORD` | Senha aleatória do papel restrito `grecco_backend`, 32 bytes hex, 64 caracteres. Guarde em gerenciador seguro. |

Execute:

```sh
npm run db:migrate
```

Para gerar cada segredo hexadecimal, um gerenciador de senhas ou `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"` pode ser usado em um terminal privado. Não compartilhe a saída. Gere valores diferentes para a senha do banco, a criptografia e a chave temporária de configuração.

As migrations versionadas são:

- `migrations/postgres.sql`: tabelas operacionais e restrição de exclusão GiST contra reservas sobrepostas, inclusive escritas simultâneas diretas.
- `migrations/002-postgres.sql`: clientes e vínculos, identidade Supabase, sessões com credenciais cifradas, índices, validações e preservação dos clientes já existentes.
- `migrations/003-supabase.sql`: RLS obrigatório nas tabelas privadas, chave estrangeira para `auth.users`, revogação de acesso público e papel restrito do backend.

A execução é transacional, serializada e controlada por `grecco.schema_migrations`. Repetir não apaga nem reinicializa dados. Repetir com uma nova `DATABASE_APP_PASSWORD` troca a senha da conexão: atualize a Vercel de forma coordenada. A aplicação em produção verifica a versão instalada e não usa credenciais de migration.

## 3. Variáveis na Vercel

Em grecco-barber → Settings → Environment Variables → **Production**, cadastre:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Session pooler do **mesmo projeto**, porta **5432**. Substitua o usuário por `grecco_backend.PROJECT_REF` e a senha por `DATABASE_APP_PASSWORD`. Preserve o hostname informado em Connect. Conexão direta usa usuário `grecco_backend`. |
| `SUPABASE_URL` | URL HTTPS do projeto novo. |
| `SUPABASE_PROJECT_REF` | Referência do projeto novo. |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável ou anon legada. |
| `SESSION_ENCRYPTION_KEY` | Segredo hexadecimal criado na etapa anterior. |
| `APP_ORIGIN` | `https://grecco-barber.vercel.app`, sem barra final, se esse continuar sendo o domínio de produção. |
| `SETUP_TOKEN` | Segredo temporário aleatório de pelo menos 32 caracteres, para autorizar o primeiro administrador. |
| `BLOB_READ_WRITE_TOKEN` | Token da integração Vercel Blob **público**, exclusivo das fotos públicas. |

Não adicione prefixo `VITE_`. Não cadastre `DATABASE_MIGRATION_URL`, `DATABASE_APP_PASSWORD`, `GRECCO_CONFIRM_PROJECT_REF` ou chaves `service_role` na aplicação Vercel. Nunca desative a verificação TLS. Se o certificado do banco exigir uma CA específica, configure `PG_CA_CERT` com a CA oficial indicada pelo provedor.

Use **Session pooler**; o modo Transaction na porta 6543 não preserva o `search_path` de sessão usado por esta implementação e é rejeitado explicitamente. O pool Node limita cada instância a três conexões; acompanhe os limites do plano e a concorrência da Vercel.

Conecte um Vercel Blob público em Storage para permitir uploads. Somente fotos do site vão para o Blob; cadastros, notas e reservas ficam no banco privado. O Supabase Storage não é utilizado nesta versão.

Faça **Redeploy**. Variáveis novas não alteram um deployment já publicado. Preview deve usar outro projeto de teste; não compartilhe o banco de produção com código em revisão.

## 4. Autorizar o primeiro administrador

Abra `/admin`. O assistente verifica banco, configuração de autenticação e fotos. Informe a chave temporária `SETUP_TOKEN` e o e-mail/senha da conta **já criada e confirmada no Supabase Auth**. A API autentica essa conta e, com trava transacional, registra a primeira permissão administrativa no banco. Depois disso, nenhuma conta comum consegue repetir a operação.

Remova `SETUP_TOKEN` da Vercel e faça outro Redeploy. Entre normalmente com a conta Supabase. Usuários novos não viram administradores: a permissão depende de `grecco.users.role = 'admin'` e do vínculo imutável `auth_user_id`. Para um segundo administrador, o responsável técnico deve conceder esse vínculo por um procedimento administrativo auditável no projeto correto; não há cadastro público administrativo.

Sessões usam cookie opaco HttpOnly, Secure em produção, SameSite Strict e CSRF. Access/refresh tokens ficam cifrados com AES-256-GCM no banco. A identidade é conferida no Supabase Auth a cada requisição; o access token é renovado sob trava antes de expirar. A sessão da Grecco tem limite absoluto de oito horas. Logout revoga a sessão no provedor e apaga a sessão local. Trocar a chave de criptografia encerra sessões existentes. Não altere essa chave a cada deployment.

## 5. Permissões e RLS

As tabelas estão no schema privado `grecco`. **Não o inclua em Exposed schemas** do Supabase Data API. RLS e FORCE ROW LEVEL SECURITY estão ativos em todas as tabelas; `anon`, `authenticated` e PUBLIC não recebem acesso ao schema ou tabelas. A política `grecco_server` permite operações apenas ao papel PostgreSQL `grecco_backend`, que tem NOINHERIT/NOBYPASSRLS e não possui DDL ou acesso a `auth.users`.

Esse papel existe somente na conexão secreta do backend. Os usuários Supabase recebem o papel `authenticated`, nunca `grecco_backend`. A API valida a sessão e a permissão administrativa antes de cada operação do painel. Rotas públicas retornam só informações públicas, validam reservas e limitam tentativas no banco. Dados de clientes e notas internas não ficam acessíveis no frontend público nem em endpoints Supabase para usuários comuns.

Não edite uma policy para `USING(true)` destinado a PUBLIC/anon/authenticated para contornar uma falha. Se uma migration falhar, ela será revertida; corrija a conexão/permissão e repita o comando no mesmo projeto novo.

## 6. Validação após publicar

1. Confirme o commit correto do GitHub no deployment e abra `/`, `/admin` e `/reserva` diretamente e após atualizar.
2. Consulte `/api/health` e `/api/setup/status`. `ok: true` comprova consulta ao banco, não valida sozinho Auth, Blob ou dados comerciais.
3. Entre, altere um preço e confirme a alteração no site em outra aba/dispositivo. Cadastre profissionais e horários oficiais, com intervalos e bloqueios.
4. Faça uma reserva real de validação, confirme a presença no painel, remarque, cancele e verifique a disponibilidade. Preserve o link privado de reserva.
5. Confirme logout, bloqueio sem sessão e upload de foto. Cadastre contatos e habilite a agenda apenas depois de revisar os dados reais.
6. Configure backups e restauração no Supabase conforme o plano; teste uma restauração separada. Preserve também as fotos do Blob.

A validação de produção só estará concluída após essas verificações no projeto e domínio reais. Os testes locais com GoTrue/PostgreSQL reais não substituem credenciais e serviços de produção conectados.
