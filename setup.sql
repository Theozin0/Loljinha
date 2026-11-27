-- =====================================================================
--  Loja TCG — configuração do banco no Supabase
--  Cole TODO este arquivo em: Supabase → SQL Editor → New query → Run
--  Pode rodar de novo sem problemas (não apaga dados).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Administradores
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Produtos
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id          bigint generated always as identity primary key,
  type        text not null check (type in ('avulsa', 'lacrado')),
  name        text not null check (char_length(name) between 1 and 150),
  set_name    text not null default '' check (char_length(set_name) <= 100),
  card_number text not null default '' check (char_length(card_number) <= 30),
  condition   text not null default '' check (char_length(condition) <= 40),
  language    text not null default '' check (char_length(language) <= 40),
  rarity      text not null default '' check (char_length(rarity) <= 60),
  description text not null default '' check (char_length(description) <= 2000),
  price_cents integer not null check (price_cents between 0 and 100000000),
  stock       integer not null default 0 check (stock between 0 and 100000),
  image       text not null default '' check (image = '' or (image ~ '^https://[^\s"''<>]+$' and char_length(image) <= 400)),
  active      boolean not null default true,
  featured    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

alter table public.products enable row level security;
drop policy if exists "vitrine le produtos ativos" on public.products;
create policy "vitrine le produtos ativos" on public.products for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "admin cria produtos" on public.products;
create policy "admin cria produtos" on public.products for insert to authenticated with check (public.is_admin());
drop policy if exists "admin edita produtos" on public.products;
create policy "admin edita produtos" on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin exclui produtos" on public.products;
create policy "admin exclui produtos" on public.products for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Pedidos (o cliente NUNCA acessa a tabela direto: só pelas funções abaixo)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id             bigint generated always as identity primary key,
  code           text unique not null,
  customer_name  text not null,
  phone          text not null,
  email          text not null default '',
  cep            text not null,
  street         text not null,
  number         text not null,
  complement     text not null default '',
  district       text not null,
  city           text not null,
  state          text not null,
  notes          text not null default '',
  items          jsonb not null,
  subtotal_cents integer not null,
  free_shipping  boolean not null default false,
  shipping_cents integer,
  status         text not null default 'pendente'
                 check (status in ('pendente','confirmado','enviado','concluido','recusado','cancelado')),
  admin_note     text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists orders_created_idx on public.orders (created_at);
alter table public.orders enable row level security;
revoke insert, update, delete on public.orders from anon, authenticated;
revoke select on public.orders from anon;
drop policy if exists "admin le pedidos" on public.orders;
create policy "admin le pedidos" on public.orders for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Sugestões
-- ---------------------------------------------------------------------
create table if not exists public.suggestions (
  id         bigint generated always as identity primary key,
  name       text not null,
  contact    text not null default '',
  product    text not null,
  details    text not null default '',
  status     text not null default 'nova' check (status in ('nova','vista','atendida','arquivada')),
  created_at timestamptz not null default now()
);
alter table public.suggestions enable row level security;
revoke insert on public.suggestions from anon, authenticated;
revoke select, update, delete on public.suggestions from anon;
drop policy if exists "admin le sugestoes" on public.suggestions;
create policy "admin le sugestoes" on public.suggestions for select to authenticated using (public.is_admin());
drop policy if exists "admin edita sugestoes" on public.suggestions;
create policy "admin edita sugestoes" on public.suggestions for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin exclui sugestoes" on public.suggestions;
create policy "admin exclui sugestoes" on public.suggestions for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------
create or replace function public._txt(v text, field text, maxlen int, required boolean default false, minlen int default 0)
returns text language plpgsql immutable as $$
declare s text := btrim(regexp_replace(coalesce(v, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
begin
  if required and s = '' then raise exception 'Campo obrigatório: %', field; end if;
  if char_length(s) < minlen then raise exception '% muito curto', field; end if;
  if char_length(s) > maxlen then raise exception '% muito longo (máx. %)', field, maxlen; end if;
  return s;
end $$;

create or replace function public._norm(v text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(btrim(coalesce(v, ''))), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g');
$$;

create or replace function public._public_order(o public.orders) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'code', o.code, 'status', o.status, 'created_at', o.created_at, 'items', o.items,
    'subtotal_cents', o.subtotal_cents, 'free_shipping', o.free_shipping,
    'shipping_cents', case when o.free_shipping then 0 else o.shipping_cents end,
    'total_cents', case when o.free_shipping then o.subtotal_cents
                        when o.shipping_cents is null then null
                        else o.subtotal_cents + o.shipping_cents end,
    'admin_note', o.admin_note, 'city', o.city, 'state', o.state);
$$;

-- ---------------------------------------------------------------------
-- Cliente: criar pedido (preço e estoque calculados aqui, nunca no navegador)
-- ---------------------------------------------------------------------
create or replace function public.place_order(p_customer jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_name text; c_phone text; c_email text; c_cep text; c_street text; c_number text;
  c_complement text; c_district text; c_city text; c_state text; c_notes text;
  digits text; rec record; p public.products; items jsonb := '[]'::jsonb; subtotal int := 0;
  free boolean; new_code text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; o public.orders;
begin
  c_name       := _txt(p_customer->>'name', 'nome', 100, true, 3);
  c_phone      := regexp_replace(_txt(p_customer->>'phone', 'telefone', 20, true), '[^0-9+() -]', '', 'g');
  c_email      := _txt(p_customer->>'email', 'e-mail', 120);
  c_cep        := regexp_replace(_txt(p_customer->>'cep', 'CEP', 9, true), '\D', '', 'g');
  c_street     := _txt(p_customer->>'street', 'rua', 150, true);
  c_number     := _txt(p_customer->>'number', 'número', 20, true);
  c_complement := _txt(p_customer->>'complement', 'complemento', 80);
  c_district   := _txt(p_customer->>'district', 'bairro', 80, true);
  c_city       := _txt(p_customer->>'city', 'cidade', 80, true);
  c_state      := upper(_txt(p_customer->>'state', 'estado', 2, true));
  c_notes      := _txt(p_customer->>'notes', 'observações', 500);
  digits := regexp_replace(c_phone, '\D', '', 'g');
  if char_length(digits) < 10 then raise exception 'Telefone inválido (inclua o DDD)'; end if;
  if char_length(c_cep) <> 8 then raise exception 'CEP inválido'; end if;
  if c_email <> '' and c_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'E-mail inválido'; end if;

  -- anti-abuso: limita pedidos por telefone e no total
  if (select count(*) from orders where created_at > now() - interval '1 hour'
        and regexp_replace(phone, '\D', '', 'g') = digits) >= 5 then
    raise exception 'Muitos pedidos seguidos. Fale com a loja pelo WhatsApp.';
  end if;
  if (select count(*) from orders where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Muitos pedidos no momento. Tente novamente em alguns minutos.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Carrinho vazio ou inválido';
  end if;

  for rec in
    select (e->>'id')::bigint as id, sum((e->>'qty')::int) as qty
    from jsonb_array_elements(p_items) e group by 1 order by 1
  loop
    if rec.qty is null or rec.qty < 1 or rec.qty > 100 then raise exception 'Quantidade inválida'; end if;
    select * into p from products where id = rec.id and active for update;
    if not found then raise exception 'Um dos produtos não está mais disponível. Atualize o carrinho.'; end if;
    if p.stock < rec.qty then
      raise exception 'Estoque insuficiente para "%" (disponível: %).', p.name, p.stock;
    end if;
    update products set stock = stock - rec.qty where id = p.id;
    items := items || jsonb_build_object(
      'id', p.id, 'name', p.name, 'type', p.type, 'qty', rec.qty, 'price_cents', p.price_cents,
      'detail', concat_ws(' · ', nullif(p.set_name, ''), nullif(p.card_number, ''), nullif(p.condition, ''), nullif(p.language, '')));
    subtotal := subtotal + p.price_cents * rec.qty;
  end loop;

  free := _norm(c_city) in ('jundiai', 'varzea paulista') and c_state = 'SP';

  loop
    b := uuid_send(gen_random_uuid());
    new_code := 'PK-';
    for i in 0..5 loop new_code := new_code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from orders where code = new_code);
  end loop;

  insert into orders (code, customer_name, phone, email, cep, street, number, complement, district, city, state, notes,
                      items, subtotal_cents, free_shipping, shipping_cents)
  values (new_code, c_name, c_phone, c_email, c_cep, c_street, c_number, c_complement, c_district, c_city, c_state, c_notes,
          items, subtotal, free, case when free then 0 end)
  returning * into o;
  return _public_order(o);
end $$;

-- Cliente: consultar pedido (código + 4 últimos dígitos do telefone)
create or replace function public.lookup_order(p_code text, p_phone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  select * into o from orders where code = upper(btrim(coalesce(p_code, '')));
  if not found or char_length(d) < 4 or right(regexp_replace(o.phone, '\D', '', 'g'), 4) <> right(d, 4) then
    raise exception 'Pedido não encontrado. Confira o código e o telefone.';
  end if;
  return _public_order(o);
end $$;

-- Cliente: enviar sugestão
create or replace function public.submit_suggestion(p_name text, p_contact text, p_product text, p_details text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from suggestions where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Muitas sugestões no momento. Tente mais tarde.';
  end if;
  insert into suggestions (name, contact, product, details) values (
    _txt(p_name, 'nome', 80, true), _txt(p_contact, 'contato', 120),
    _txt(p_product, 'produto', 150, true, 2), _txt(p_details, 'detalhes', 1000));
end $$;

-- ---------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------
create or replace function public._require_admin() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
end $$;

create or replace function public.admin_update_order(p_id bigint, p_shipping_cents int, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  perform _require_admin();
  select * into o from orders where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if o.status not in ('pendente', 'confirmado') then raise exception 'Este pedido não pode mais ser alterado'; end if;
  if p_shipping_cents is not null and (p_shipping_cents < 0 or p_shipping_cents > 10000000) then raise exception 'Frete inválido'; end if;
  update orders set
    shipping_cents = case when o.free_shipping then 0 else p_shipping_cents end,
    admin_note = _txt(p_note, 'observação', 500), updated_at = now()
  where id = p_id;
end $$;

create or replace function public.admin_set_order_status(p_id bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; it jsonb; allowed text[];
begin
  perform _require_admin();
  select * into o from orders where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  allowed := case o.status
    when 'pendente' then array['confirmado', 'recusado']
    when 'confirmado' then array['enviado', 'cancelado']
    when 'enviado' then array['concluido']
    else array[]::text[] end;
  if not (p_status = any(allowed)) then
    raise exception 'Não é possível mudar de "%" para "%"', o.status, p_status;
  end if;
  if p_status = 'confirmado' and not o.free_shipping and o.shipping_cents is null then
    raise exception 'Informe o valor do frete antes de confirmar';
  end if;
  if p_status in ('recusado', 'cancelado') then
    for it in select * from jsonb_array_elements(o.items) loop
      update products set stock = stock + (it->>'qty')::int where id = (it->>'id')::bigint;
    end loop;
  end if;
  update orders set status = p_status, updated_at = now() where id = p_id;
end $$;

create or replace function public.admin_adjust_stock(p_id bigint, p_delta int)
returns int language plpgsql security definer set search_path = public as $$
declare s int;
begin
  perform _require_admin();
  if p_delta not between -100000 and 100000 then raise exception 'Ajuste inválido'; end if;
  update products set stock = least(100000, greatest(0, stock + p_delta)) where id = p_id returning stock into s;
  if not found then raise exception 'Produto não encontrado'; end if;
  return s;
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_admin();
  return jsonb_build_object(
    'pending', (select count(*) from orders where status = 'pendente'),
    'newSuggestions', (select count(*) from suggestions where status = 'nova'),
    'lowStock', (select count(*) from products where active and stock <= 1));
end $$;

-- Permissões das funções
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.place_order(jsonb, jsonb), public.lookup_order(text, text),
  public.submit_suggestion(text, text, text, text), public.is_admin() to anon, authenticated;
grant execute on function public.admin_update_order(bigint, int, text), public.admin_set_order_status(bigint, text),
  public.admin_adjust_stock(bigint, int), public.admin_stats() to authenticated;

-- ---------------------------------------------------------------------
-- Fotos dos produtos (Storage) — leitura pública, envio só pelo admin
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "admin ve fotos" on storage.objects;
create policy "admin ve fotos" on storage.objects for select to authenticated
  using (bucket_id = 'produtos' and public.is_admin());
drop policy if exists "admin envia fotos" on storage.objects;
create policy "admin envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and public.is_admin());
drop policy if exists "admin altera fotos" on storage.objects;
create policy "admin altera fotos" on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and public.is_admin());
drop policy if exists "admin apaga fotos" on storage.objects;
create policy "admin apaga fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and public.is_admin());

-- =====================================================================
-- DEPOIS de rodar: crie seu usuário em Authentication → Users → Add user
-- e rode a linha abaixo trocando o e-mail (vira administrador):
--
--   insert into public.admins (user_id) select id from auth.users where email = 'SEU@EMAIL.COM';
-- =====================================================================

-- ---------------------------------------------------------------------
-- Aparência do site (aba "Aparência" do painel)
-- ---------------------------------------------------------------------
-- =====================================================================
create table if not exists public.site_settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) < 30000),
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings enable row level security;
revoke insert, delete on public.site_settings from anon, authenticated;
revoke update on public.site_settings from anon;

drop policy if exists "todos leem aparencia" on public.site_settings;
create policy "todos leem aparencia" on public.site_settings for select to anon, authenticated using (true);
drop policy if exists "admin altera aparencia" on public.site_settings;
create policy "admin altera aparencia" on public.site_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();
