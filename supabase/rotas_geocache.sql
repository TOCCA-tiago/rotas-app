-- ROTAS: cache de endereços já localizados no mapa.
-- Rodar uma vez no SQL Editor do projeto Supabase do CRM.
-- Tabela isolada (prefixo rotas_): não altera nada do CRM.

create table if not exists public.rotas_geocache (
  chave text primary key,            -- endereço normalizado
  lat double precision not null,
  lon double precision not null,
  precisao text not null,            -- endereco | rua | cep | bairro | cidade | manual
  atualizado_em timestamptz not null default now()
);

alter table public.rotas_geocache enable row level security;

-- Qualquer usuário ativo do CRM (perfil com empresa e status 'ativo') pode ler e gravar.
drop policy if exists rotas_geocache_usuarios_ativos on public.rotas_geocache;
create policy rotas_geocache_usuarios_ativos on public.rotas_geocache
  for all to authenticated
  using (public.current_org_id() is not null)
  with check (public.current_org_id() is not null);
