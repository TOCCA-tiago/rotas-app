-- ROTAS: situação de cada parada no modo motorista (entregue / não entregue).
-- Rodar uma vez no SQL Editor do projeto Supabase do CRM. Só acrescenta uma coluna em rotas_salvas.

alter table public.rotas_salvas
  add column if not exists entregas jsonb not null default '{}'::jsonb;
-- Formato: { "<id da nota>": { "status": "entregue" | "nao_entregue", "em": "<data/hora ISO>",
--                              "por": "<nome>", "obs": "<motivo, se não entregue>" } }
