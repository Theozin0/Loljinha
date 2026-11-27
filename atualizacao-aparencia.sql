-- =====================================================================
--  Atualização: aba "Aparência" do painel (logo, cores, textos)
--  Rode UMA vez em: Supabase → SQL Editor → (Role: postgres) → Run
--  Pode rodar de novo sem problemas.
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
