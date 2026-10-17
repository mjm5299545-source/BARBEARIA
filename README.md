# Barbearia Grecco

Site e plataforma de agendamento da Barbearia Grecco, em Propriá–SE. Interface em React + TypeScript, API Express em Node 24, Supabase Auth/PostgreSQL na Vercel e SQLite no desenvolvimento local. Site, administração e dados usam o mesmo backend. Na Vercel, contas e dados usam um projeto Supabase exclusivo da Grecco e as fotos usam Vercel Blob. Confira os limites e custos dos planos escolhidos.

## Publicação na Vercel

Siga o [guia Supabase exclusivo](docs/SUPABASE.md) e o [guia da Vercel](docs/VERCEL.md). Crie um projeto novo, execute migrations com uma conexão administrativa temporária e configure no servidor a conexão restrita, Supabase Auth, criptografia de sessão e Blob. Depois de Redeploy, autorize a conta criada no Supabase pelo assistente `/admin`. Não use o banco do outro site.

O site público abre durante a preparação. A agenda permanece desativada e a saúde do banco retorna 503 enquanto a conexão não existir. Não há banco ou uploads gravados no disco efêmero da Vercel.

## Executar em desenvolvimento

Requisitos: **Node.js 24 ou superior**, npm e uma pasta persistente com permissão de escrita. Chromium é necessário apenas para os testes de navegador.

```sh
npm ci --cache /tmp/grecco-npm-cache
npm run dev
```

O Vite usa a porta **5173**, e a API, **3001**. O Vite encaminha `/api` e `/uploads` à API. Abra o site pelo acesso disponibilizado pela sua hospedagem ou ambiente. `/admin` é o painel. A verificação `GET /api/health` testa também a conexão com o banco. Não é necessário criar outro checkout ou worktree no ambiente da nuvem.

## Primeiro acesso seguro

Não existe usuário ou senha padrão nem credencial embutida. Na Vercel, crie e confirme a conta em Supabase Authentication → Users, com cadastro público desativado, e autorize o primeiro administrador em `/admin` com a chave temporária `SETUP_TOKEN`, conforme o guia. Senhas são verificadas pelo Supabase Auth. Os comandos abaixo são exclusivos do modo local. Para desenvolvimento ou um servidor próprio, crie a conta no terminal:

```sh
npm run admin:setup
```

O assistente solicita e-mail e senha com entrada oculta (mínimo 12 caracteres). Para automação, injete `ADMIN_EMAIL` e `ADMIN_PASSWORD` por um mecanismo seguro e execute `npm run admin:create`. Esses valores só são utilizados na criação da conta; não são necessários para iniciar o servidor. Não coloque senhas em commits, logs ou comandos gravados no histórico. Em um container, execute o assistente no container ativo com terminal interativo.

Depois, acesse `/admin` e siga esta ordem:

1. **Serviços e preços:** revise as quatro sugestões, configure as durações reais e os preços ou deixe o preço vazio para “Consulte os valores”. Salvar confirma a configuração. Crie novos serviços, componha combos, destaque, ordene ou arquive serviços. O histórico preserva o preço e os nomes da época da reserva.
2. **Profissionais e horários:** cadastre os nomes reais e vincule os serviços, inclusive os combos realizados. Adicione os períodos de expediente. Para almoço, cadastre manhã e tarde separadamente. Dias sem períodos ficam fechados. Use bloqueios para folgas, férias e compromissos. Alterar expediente não cancela reservas existentes; revise e remarque atendimentos afetados.
3. **Configurações:** cadastre o WhatsApp oficial com DDI e DDD (somente dígitos), contato, Instagram, texto dos horários e regras da agenda. Ative o agendamento online depois de cadastrar serviços e expediente. O endereço e as coordenadas iniciais são os fornecidos no projeto; ambos podem ser editados.
4. **Conteúdo e galeria:** revise textos, botões, imagens, logo e cor. Salve um rascunho, visualize e publique. Publicar conteúdo preserva contatos e regras de agenda atuais. Fotos da galeria e alterações em serviços/configurações são salvas diretamente. Ao enviar a primeira foto para a galeria, ela substitui as referências ilustrativas.

**Estado inicial intencional:** agenda online desativada, preços em branco, contatos e horários pendentes, nenhum nome fictício de profissional. As durações iniciais são estimativas visíveis no painel e precisam ser salvas pelo responsável antes de liberar cada serviço para reserva. Não há reservas nem clientes de demonstração no banco real. Os dados dos testes usam bancos temporários isolados.

## Fluxos implementados

- Site responsivo em preto e dourado, fontes locais, menu acessível, filtros de serviços, fotos ampliáveis, localização com mapa carregado por solicitação, política de privacidade e preferências de movimento reduzido.
- Reserva de um ou mais serviços ou combo, profissional compatível, data/horário disponível, nome e telefone validados, revisão e confirmação com referência.
- Horários respeitam expediente, pausas, bloqueios, duração, antecedência, limite de dias, passo da agenda e intervalo entre clientes. Combos não podem ser combinados com componentes repetidos.
- Transações serializam criação/remarcação: `BEGIN IMMEDIATE` no SQLite e bloqueio por profissional no PostgreSQL. O PostgreSQL também tem uma restrição de exclusão que impede sobreposição de reservas mesmo por gravação direta. Duas reservas simultâneas não ocupam a mesma disponibilidade. Cancelamento libera o horário. Datas são salvas em UTC e apresentadas em `America/Sao_Paulo`; os horários de expediente usam o horário de Brasília.
- Link privado em `/reserva#TOKEN` permite consultar, cancelar e remarcar até o prazo configurado. O token aleatório tem 256 bits e apenas seu hash é armazenado. O link deve ser salvo pelo cliente; não enviamos notificações nem prometemos recuperação automática por telefone. Dados pessoais e notas não são retornados na consulta pública.
- Painel com indicadores calculados das reservas reais, agenda diária/semanal/mensal e em lista, busca, filtros, reserva manual ou confirmada pelo WhatsApp, remarcação, cancelamento, conclusão e notas internas. A tela carrega até as 5.000 reservas mais recentes; os indicadores usam agregações do banco inteiro. O histórico de um cliente mostra até 1.000 atendimentos e a lista de clientes usa páginas de 50 registros. O painel atualiza a cada 30 segundos quando está visível. Não há indicador de faturamento estimado.
- Upload autenticado de JPG, PNG e WebP de até 4 MB, leitura e verificação real da imagem, limite de pixels, orientação automática, redução para até 1.920 px e conversão WebP sem metadados. SVG e arquivos inválidos são rejeitados.
- Em produção, login Supabase Auth com autorização administrativa independente dos metadados da conta, verificação de identidade e renovação de token no servidor. Access/refresh tokens são cifrados com AES-256-GCM no banco e nunca enviados ao navegador. O modo local usa scrypt e sal aleatório. Há sessão opaca com validade de oito horas e hash no banco, autorização de administrador em todas as operações restritas, cookie HttpOnly/SameSite e Secure em produção, token CSRF, verificação de origem, SQL parametrizado, cabeçalhos de segurança e limites de tentativas persistentes no banco nas rotas sensíveis, compartilhados entre instâncias.
- Clientes cadastrados a partir das reservas, busca por nome/telefone, histórico e edição de dados permitidos, exclusivamente no painel. Dados antigos dos atendimentos são preservados.
- RLS obrigatório nas tabelas do schema privado, sem acesso anon/authenticated e com conexão de servidor sem BYPASSRLS. Migrations não são executadas com a conexão da aplicação.
- Retenção configurável: botão no painel remove nome, telefone e notas de reservas encerradas antigas. É uma operação deliberada do responsável, não uma rotina automática. O canal de privacidade pode ser cadastrado; sem ele, o aviso orienta contato presencial.

## WhatsApp e integrações

Após configurar um número válido, os links abrem o WhatsApp com mensagem pronta. No fluxo de reserva, ela inclui os serviços, a data e o horário pretendido. **Abrir/enviar a conversa não reserva o horário.** O responsável confirma a conversa e pode registrar a reserva manualmente com origem WhatsApp. Sem número, não há link fictício no site.

Não foram integradas APIs de envio automático de WhatsApp, SMS ou e-mail, gateway de pagamento, avaliações ou redes sociais fictícias. Essas integrações não são simuladas. Nenhum preço, horário ou telefone definitivo foi inventado.

## Verificação

```sh
npm run build
npm test
npm audit --omit=dev --cache /tmp/grecco-npm-cache
```

O build inclui TypeScript. `npm test` executa testes da API e testes reais de navegador com Playwright/Chromium. O executável padrão é `/usr/bin/chromium`; ajuste `CHROMIUM_PATH` se necessário. A suíte utiliza bancos temporários e credenciais aleatórias, removidos ao terminar. Se `TEST_DATABASE_URL` for fornecida por um mecanismo seguro, a mesma suíte usa schemas descartáveis `grecco_test_*` no PostgreSQL. Nunca aponte testes para uma conta de produção. Ela cobre concorrência, persistência, autorização/CSRF, intervalos, bloqueios, prazo de alterações, snapshots de preço, combos, uploads, edição/publicação e o fluxo do cliente no desktop e na navegação mobile. Testes não substituem uma revisão de produção do domínio, HTTPS, backup e contatos oficiais.

`npm run test:postgres` faz build, inicia PostgreSQL e Supabase Auth reais em containers Docker isolados, executa a suíte completa e remove seus containers e volumes. O daemon Docker deve estar disponível; as imagens vêm dos repositórios oficiais e os segredos de teste são gerados a cada execução.

A suíte adicional `tests/supabase.test.mjs` exige PostgreSQL e GoTrue **reais**, locais e descartáveis. Configure `TEST_SUPABASE_DATABASE_URL`, `TEST_SUPABASE_AUTH_URL` e `TEST_SUPABASE_JWT_SECRET` por variáveis seguras; sem esses serviços, os sete testes são explicitamente marcados como não executados. O banco deve se chamar `grecco_auth_test` ou `grecco_test_*`, no loopback. A suíte cria/apaga apenas seu schema Grecco e as duas contas criadas para validação. Não use bancos com dados reais. O gateway local dos testes apenas encaminha HTTP ao GoTrue; não simula autenticação.

## Publicar em servidor próprio (alternativa à Vercel)

O modo local SQLite exige um **servidor Node com disco persistente**, ou container com volume. Na Vercel, use PostgreSQL e Blob conforme o guia: o disco local não é utilizado. Hospedagem apenas estática não executa a API.

```sh
npm ci --cache /tmp/grecco-npm-cache
npm run build
npm start
```

Em produção, a API serve também o frontend em `dist/`, incluindo `/admin` e `/reserva`. `npm start` define `NODE_ENV=production` e ativa cookies Secure. Exponha por **HTTPS**, com proxy reverso confiável, e configure:

| Variável | Uso |
| --- | --- |
| `PORT` | Porta HTTP interna; padrão 3001. |
| `DATA_DIR` | Pasta persistente do banco e dos uploads; padrão `./data`. |
| `APP_ORIGIN` | Origem HTTPS final, sem barra final. Usada para validação de origem e sitemap. Não use um domínio de exemplo em produção. |
| `TRUST_PROXY` | `1` apenas quando há um único proxy de confiança que sobrescreve os cabeçalhos `X-Forwarded-*`. Caso contrário mantenha `0`. |
| `CHROMIUM_PATH` | Opcional, executável do navegador para testes. |
| `BACKUP_DIR` | Destino privado dos backups; padrão `./backups`. |

O arquivo `.env.example` documenta as variáveis, mas não é carregado automaticamente. Use as configurações seguras da hospedagem ou o suporte `--env-file` do Node. Não exponha `data/` como pasta estática; apenas `data/uploads/` é servido pela rota dedicada.

O `Dockerfile` fornece build em etapas, execução sem root e healthcheck. Exemplo de construção: `docker build -t grecco .`. Monte um volume em `/app/data`, configure as variáveis da hospedagem e termine TLS no proxy. A imagem não inclui credenciais. O Dockerfile está preparado; o build Docker não foi executado neste ambiente. Ao usar essa alternativa, copie também `migrations/` para a imagem, conforme o Dockerfile.

Use uma única instância da aplicação sobre um volume local. SQLite com WAL é apropriado para esta operação de pequeno porte; para múltiplas réplicas ou volume de rede, migre o banco para um servidor transacional e mantenha as regras de conflito. Os limites de tentativas já usam o banco compartilhado.

## Backup e restauração do SQLite local

```sh
npm run db:backup
```

No desenvolvimento local, o script usa a API de backup do SQLite para produzir uma cópia consistente, incluindo dados em WAL, e copia uploads para uma pasta privada com data. Mantenha uma cópia criptografada fora da máquina e verifique periodicamente a restauração. Não envie backups para o Git: contêm dados pessoais e hashes de autenticação.

Para restaurar, pare os processos da aplicação, preserve o estado atual, substitua o arquivo `grecco.sqlite` e a pasta `uploads` por uma cópia de backup confiável e remova os arquivos WAL/SHM antigos **somente com os processos parados e o estado preservado**. Reinicie e valide a saúde, o login e uma consulta de reserva. A perda do banco implica perda de reservas e contas. Para PostgreSQL/Blob, use os backups e exportações dos provedores, conforme o guia da Vercel.

## Organização

- `src/Public.tsx`, `src/Booking.tsx`: site público e fluxos de reserva.
- `src/admin/`: login, indicadores e gestão da operação.
- `server/db.mjs`, `migrations/`: conexões, inicialização versionada e transações PostgreSQL/SQLite.
- `api/index.mjs`, `vercel.json`: função e roteamento da Vercel.
- `server/storage.mjs`: uploads locais ou Vercel Blob, com referências persistentes.
- `server/booking.mjs`: disponibilidade e transações de reserva.
- `server/index.mjs`, `server/security.mjs`: API, autenticação, validações e uploads.
- `scripts/`: criação segura de administrador e backup.
- `tests/`: integração e testes de navegador.
- `public/images/`: imagens ilustrativas geradas para a apresentação. Não são fotos reais da Barbearia Grecco; substitua-as pelo painel. Fontes Cormorant Garamond e DM Sans distribuídas via Fontsource sob SIL Open Font License, com licença nos pacotes correspondentes.

Consulte o [relatório de validação](docs/VALIDACAO.md) para os resultados executados e os limites da entrega. A conexão ao projeto Supabase exclusivo e ao Blob da sua conta depende das variáveis configuradas na Vercel. Configurar o domínio, cadastrar os dados oficiais, criar a conta do responsável e publicar no provedor escolhido são etapas posteriores; não houve implantação em uma hospedagem pública.
