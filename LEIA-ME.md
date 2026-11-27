# Loja TCG: GitHub Pages + Supabase

Loja de Pokémon TCG (cartas avulsas e lacrados) que roda **de graça**:

- **GitHub Pages** hospeda o site (vitrine, carrinho e painel do lojista)
- **Supabase** guarda os produtos, pedidos, sugestões e fotos, e cuida do login do administrador

O pagamento não é feito no site. O cliente envia o pedido, que fica **pendente** com o estoque reservado. O WhatsApp abre com a mensagem pronta para o seu número. No painel você informa o frete e confirma ou recusa o pedido.
**Frete grátis automático para Jundiaí e Várzea Paulista (SP).**

---

## Passo 1: Criar o banco no Supabase (10 min)

1. Crie uma conta em **supabase.com** e clique em **New project**. Escolha a região **South America (São Paulo)**, defina uma senha do banco e guarde-a
2. Abra **SQL Editor → New query**, cole **todo** o conteúdo de `supabase/setup.sql` e clique em **Run**. Deve aparecer *Success*
3. Crie o seu login de administrador:
   - **Authentication → Users → Add user → Create new user**
   - Informe seu e-mail e uma senha forte e marque **Auto Confirm User**
4. Volte ao **SQL Editor** e rode a linha abaixo, trocando pelo seu e-mail:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'SEU@EMAIL.COM';
   ```
5. **Desligue o cadastro público:** em **Authentication → Sign In / Providers**, desmarque **Allow new users to sign up**. Assim ninguém consegue criar conta, e mesmo que criasse, não teria acesso de admin
6. Copie os dois dados de conexão:
   - **Project URL** (ex.: `https://abcdxyz.supabase.co`), em *Project Settings → Data API*
   - **Publishable key** (`sb_publishable_...`), em *Project Settings → API Keys*

> ⚠️ Use **somente** a *Publishable key*. **Nunca** coloque a *Secret key* (`sb_secret_...`) nem a `service_role` no site.

## Passo 2: Configurar o site

Abra `js/config.js` e preencha:

```js
storeName: 'Nome da Sua Loja',
storeWhatsapp: '5511987654321',          // seu WhatsApp, só números
supabaseUrl: 'https://abcdxyz.supabase.co',
supabaseKey: 'sb_publishable_...',
```

## Passo 3: Publicar no GitHub Pages (5 min)

1. Em **github.com**, crie um repositório **público** (ex.: `loja-tcg`). No plano gratuito, o Pages só funciona em repositórios públicos. Não há problema: o código não tem nenhum segredo, e quem protege os dados são as regras do banco
2. Clique em **Add file → Upload files** e arraste **todo o conteúdo** desta pasta, incluindo `.nojekyll` e a pasta `.github`. Depois clique em **Commit changes**
   - Arquivos que começam com ponto podem ficar ocultos no seu computador. No Windows, ative *Exibir → Itens ocultos*; no Mac, use `Cmd + Shift + .`
3. Vá em **Settings → Pages**, em *Source* escolha **Deploy from a branch**, depois a branch **main** e a pasta **/ (root)**, e clique em **Save**
4. Em 1 a 2 minutos o site estará em:
   - Loja: `https://SEU-USUARIO.github.io/loja-tcg/`
   - Painel: `https://SEU-USUARIO.github.io/loja-tcg/admin.html`

## Passo 4: Evitar que o Supabase "durma"

O plano gratuito do Supabase **pausa o projeto depois de 1 semana sem uso**. Os dados não se perdem, mas a loja para até você reativar. Para evitar isso, o projeto já traz uma automação que acessa o banco a cada 2 dias:

1. No GitHub, abra **Settings → Secrets and variables → Actions → New repository secret** e crie:
   - `SUPABASE_URL`: a Project URL
   - `SUPABASE_KEY`: a Publishable key
2. Na aba **Actions**, abra **Manter Supabase ativo** e clique em **Run workflow** para testar

---

## Domínio próprio (opcional)

Se tiver um domínio (ex.: `sualoja.com.br`), configure em **Settings → Pages → Custom domain** e siga as instruções de DNS que o GitHub mostra. Depois marque **Enforce HTTPS**.

## Como a segurança funciona

- O site é estático: **toda a proteção fica no banco** (Row Level Security do Supabase), não no navegador
- Visitantes só **leem os produtos visíveis**. Eles não conseguem ver pedidos de outras pessoas, alterar preços nem mexer no estoque
- Pedidos são criados por uma função do banco que **recalcula preços e estoque**, então valores enviados pelo navegador são ignorados
- Somente usuários na tabela `admins` gerenciam produtos, pedidos, sugestões e fotos
- Login com senha protegida pelo Supabase Auth, que tem limite de tentativas
- Limite de pedidos por telefone e por hora, e campo invisível contra robôs nas sugestões
- Nenhum dado é inserido como HTML (sem XSS) e há uma Content-Security-Policy

## Dicas

- **Pedidos falsos?** Recuse no painel: o estoque volta automaticamente
- **Backup:** no Supabase, use *Database → Backups* ou exporte as tabelas em *Table Editor → Export to CSV*
- **Trocar a senha:** em *Authentication → Users*, abra seu usuário e use *Send password recovery* ou redefina a senha
- **Notificação extra:** a mensagem do pedido chega pelo WhatsApp quando o cliente toca em "enviar". Confira também o painel, onde todos os pedidos ficam registrados mesmo que o cliente não envie a mensagem

## Estrutura

```
index.html            loja
admin.html            painel do lojista
js/config.js          ← suas configurações
js/app.js, admin.js   lógica da loja e do painel
js/common.js          conexão com o Supabase
css/style.css         visual
supabase/setup.sql    banco de dados + regras de segurança
.github/workflows/    automação que mantém o Supabase ativo
```
