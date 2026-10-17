# Publicar a Grecco na Vercel

A Vercel executa o frontend e a API. O PostgreSQL guarda reservas, contas, sessões e configurações; o Vercel Blob guarda apenas fotos públicas. A aplicação não grava banco nem fotos no disco temporário das funções.

## 1. Publicar o código correto

O repositório conectado é `mjm5299545-source/BARBEARIA`. A raiz do projeto deve ser a raiz do repositório, onde ficam `package.json`, `vercel.json`, `src/` e `api/`. O commit `d578552` só contém o README e produz 404.

O `vercel.json` define os dois builds, o frontend em `dist/`, a função em `api/index.mjs` e o encaminhamento de `/api`, `/uploads`, `/admin` e `/reserva`. Não substitua isso por um deployment apenas estático: a agenda depende da API.

Na Vercel, confira o repositório e a branch de produção configurados. Se aparecer um aviso de que o campo `builds` prevalece sobre as opções do painel, isso é esperado: o build é definido pelo arquivo versionado. Use Node.js **24.x**.

## 2. Conectar o banco (Neon/PostgreSQL)

No projeto `grecco-barber`, abra **Storage → Connect Database / Create Database**. A interface pode apresentar provedores no Marketplace. Escolha **Neon** ou conecte outro PostgreSQL compatível. Revise o plano e os limites antes de concluir; a aplicação não contrata serviços nem altera planos automaticamente.

Conecte o banco ao projeto e aos ambientes desejados, especialmente **Production**. Depois abra **Settings → Environment Variables** e confira se existe **`DATABASE_URL`**, com a conexão PostgreSQL do provedor. Prefira a conexão com pool (pooled). Use uma base dedicada à Grecco. O banco precisa suportar a extensão `btree_gist`, disponível no Neon.

Algumas integrações oferecem a conexão sob um nome com prefixo. Nesse caso, adicione `DATABASE_URL` com o mesmo valor pela interface segura da Vercel. Não envie a conexão pelo chat nem use prefixo `VITE_`: ela deve existir apenas no servidor. O TLS do banco externo permanece verificado; não adicione opções para desativá-lo.

As tabelas são criadas no schema `grecco`, na primeira conexão, com inicialização versionada e trava no banco. Nenhuma conta, reserva ou preço fictício é inserido. Contatos, profissionais, expediente e agenda continuam pendentes até configuração pelo responsável.

## 3. Conectar fotos (Vercel Blob)

Em **Storage**, crie um armazenamento **Blob público** e conecte ao projeto. Confira a variável protegida **`BLOB_READ_WRITE_TOKEN`** em Production. O armazenamento público contém somente fotos destinadas ao site; dados dos clientes ficam no PostgreSQL.

O painel aceita JPG, PNG e WebP de até **4 MB**, abaixo do limite de payload das funções. As imagens são verificadas, reduzidas e convertidas em WebP antes do envio. O banco guarda a referência do arquivo. Nenhum token de armazenamento é enviado ao navegador.

Sem Blob, o site pode usar as imagens iniciais, mas o upload fica explicitamente indisponível. Reservas, edição de textos e preços dependem do banco, não do Blob.

## 4. Configurar o primeiro acesso

Em **Settings → Environment Variables**, adicione **`SETUP_TOKEN`** como variável sensível, com uma chave aleatória de pelo menos 32 caracteres, gerada pelo seu gerenciador de senhas. Essa chave é temporária e diferente da senha da sua conta. Guarde-a de forma privada.

Cadastre também **`APP_ORIGIN`** com a origem de produção, por exemplo o domínio real exibido em Domains, com `https://` e sem barra no final. Para este projeto, confira se `https://grecco-barber.vercel.app` continua sendo o domínio configurado. Essa variável também permite gerar o sitemap.

Faça **Redeploy**: variáveis adicionadas depois de um deployment só ficam disponíveis em um deployment novo.

Abra o endereço público do site seguido de **`/admin`**. O assistente mostra o estado das conexões. Com banco e chave configurados, informe a chave, seu e-mail e uma senha forte com pelo menos 12 caracteres. A criação do primeiro administrador é protegida por trava transacional e não pode ser repetida após existir uma conta.

Depois de criar sua conta, remova `SETUP_TOKEN` das variáveis da Vercel e faça outro Redeploy. Você continuará entrando com e-mail e senha; o banco guarda somente o derivado seguro da senha, não a senha original.

## 5. Abrir a agenda

No painel:

1. Revise os serviços e salve as durações e os preços oficiais. Preços vazios continuam como “Consulte os valores”.
2. Cadastre um profissional, selecione os serviços realizados e defina os períodos de trabalho.
3. Configure WhatsApp, contato e texto dos horários.
4. Em Configurações, habilite o agendamento online.
5. Revise os textos e substitua imagens ilustrativas por fotos autorizadas.

Confirme uma reserva de teste pelo site, consulte o link privado, cancele e confira se o horário foi liberado. O WhatsApp abre uma conversa; ele não envia notificações automáticas nem confirma uma reserva sozinho.

## Verificação e diagnóstico

- **Site público:** carrega mesmo durante a configuração inicial, com informações fornecidas e reservas desativadas. Isso não significa que o banco esteja pronto.
- **`/api/health`:** retorna `ok: true` quando consegue consultar o banco. Sem `DATABASE_URL` na Vercel, retorna **503**, sem simular persistência.
- **`/api/setup/status`:** informa os estados de configuração sem expor valores de credenciais.
- **404 com commit `d578552`:** a Vercel ainda publicou o commit antigo, ou está ligada à branch errada.
- **API retorna HTML:** confira se o deployment usa `vercel.json` da raiz e se as rotas para a função foram mantidas.
- **Banco não conecta:** confira `DATABASE_URL`, ambiente Production/Preview, conexão pooled, disponibilidade do projeto do provedor e novo Redeploy. Não desative a verificação TLS.
- **Upload indisponível:** confira Blob público, token vinculado ao ambiente e Redeploy. Arquivos pessoais e documentos de clientes não devem ser enviados à galeria pública.
- **Origem não permitida:** confira `APP_ORIGIN` e se você está acessando exatamente o domínio configurado. Evite usar o mesmo banco para previews públicos de código em revisão; prefira uma base de preview isolada. Remova APP_ORIGIN somente em um preview confiável e isolado, se precisar validar a origem própria daquele deployment.

Os testes locais incluem PostgreSQL real e execução do handler serverless sem escrita em disco. A conexão com seu projeto Neon/Blob e a publicação na sua conta só podem ser confirmadas depois de configurar esses serviços e verificar o deployment real.

## Manutenção

Ative backups/recuperação no provedor PostgreSQL conforme o plano escolhido e teste restaurações. Para exportar, use `pg_dump` com um mecanismo seguro de conexão e uma ferramenta compatível com a versão do servidor. O comando `npm run db:backup` é exclusivo do SQLite de desenvolvimento; ele não faz backup do PostgreSQL nem do Blob.

Não exponha o banco diretamente ao navegador. Não conceda acesso anônimo às tabelas nem publique as chaves como variáveis `VITE_*`. O papel administrativo, as sessões e os limites de tentativas são verificados no backend e persistem no banco entre instâncias da Vercel.
