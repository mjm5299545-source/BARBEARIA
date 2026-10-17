# Publicar a Grecco na Vercel

Siga o [guia Supabase exclusivo da Grecco](SUPABASE.md) para criar o projeto, executar migrations, configurar Auth, variáveis e primeiro acesso. O projeto Supabase utilizado pelo outro site não deve ser acessado ou alterado.

O repositório conectado é `mjm5299545-source/BARBEARIA`, branch `main`. A raiz da Vercel deve ser a raiz do repositório, que contém `package.json`, `api/` e `vercel.json`. Use Node **24.x**. O commit inicial `d578552` tinha apenas um README e causava 404.

`vercel.json` define o frontend Vite em `dist/`, a função Express em `api/index.mjs`, as rotas `/api`, `/uploads`, robots/sitemap e o fallback SPA que permite abrir e atualizar `/admin` e `/reserva`. O aviso de que `builds` prevalece sobre configurações do painel é esperado. Não publique apenas o frontend estático.

Após configurar as variáveis de **Production**, faça Redeploy. O site pode abrir com a agenda desativada durante a preparação; isso não comprova que Auth, banco ou uploads estejam conectados. `/api/health` retorna 503 se o banco estiver indisponível. O painel mostra a configuração pendente em `/admin`.

Em Storage, conecte **Vercel Blob público**. Apenas imagens destinadas ao site são públicas; nenhum cadastro deve ser enviado para a galeria. Sem `BLOB_READ_WRITE_TOKEN`, o upload retorna um erro de configuração e não grava no disco efêmero da função.

Diagnóstico:

- **API devolve HTML/404:** confira o commit, a raiz e as rotas do `vercel.json`.
- **Banco não conecta:** confira projeto exclusivo, usuário `grecco_backend.PROJECT_REF`, senha, Session pooler porta 5432, migrations e Redeploy. Não desligue TLS.
- **Login não funciona:** confira Supabase Auth, e-mail confirmado, senha, `SESSION_ENCRYPTION_KEY`, primeiro acesso e autorização em `grecco.users`. Contas comuns são recusadas mesmo com metadado `role: admin`.
- **Origem recusada:** acesse o domínio exato cadastrado em `APP_ORIGIN`. Use projeto de teste separado para previews.
- **Fotos não enviam:** confira Blob público, token no ambiente correto e arquivo válido até 4 MB.

A publicação do código no GitHub pode disparar o deploy pela integração existente. Ela não cria projetos Supabase/Blob nem injeta segredos. Confirme o resultado em Deployments e execute as verificações do guia antes de liberar uso real.
