-- ROTAS: rotas montadas e salvas.
-- Rodar uma vez no SQL Editor do projeto Supabase do CRM.
-- Tabela isolada (prefixo rotas_): não altera nada do CRM.

create table if not exists public.rotas_salvas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  nome text not null,
  data_entrega date,
  origem jsonb not null,             -- { endereco, lat, lon }
  retornar boolean not null default true,
  paradas jsonb not null,            -- notas na ordem de entrega, com lat/lon
  resultado jsonb not null,          -- km/tempo de cada trecho e o trajeto no mapa
  qtd_paradas int not null,
  distancia_total double precision,  -- metros
  duracao_total double precision,    -- segundos
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists rotas_salvas_org_data_idx
  on public.rotas_salvas (organization_id, data_entrega desc, criado_em desc);

alter table public.rotas_salvas enable row level security;

-- Só usuários ativos da própria empresa veem e editam as rotas.
create policy rotas_salvas_mesma_empresa on public.rotas_salvas
  for all to authenticated
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
