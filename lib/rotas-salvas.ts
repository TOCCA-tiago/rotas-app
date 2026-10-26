import type { Nota } from "@/lib/tiny";
import type { ResultadoRota } from "@/lib/osrm";

export type ParadaSalva = Nota & { lat: number; lon: number; precisao: string | null };

export type RotaSalvaResumo = {
  id: string;
  nome: string;
  data_entrega: string | null;
  qtd_paradas: number;
  distancia_total: number | null;
  duracao_total: number | null;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
  entregas?: Entregas;
};

export type Entrega = { status: "entregue" | "nao_entregue"; em: string; por?: string | null; obs?: string | null };
export type Entregas = Record<string, Entrega>;

export type RotaSalva = RotaSalvaResumo & {
  entregas?: Entregas;
  origem: { endereco: string; lat: number; lon: number; manual?: boolean };
  retornar: boolean;
  paradas: ParadaSalva[];
  resultado: ResultadoRota;
};

// Valida o corpo enviado pela tela e monta as colunas da tabela rotas_salvas.
export function dadosRotaSalva(body: any) {
  const nome = String(body?.nome ?? "").trim();
  const origem = body?.origem;
  const paradas = body?.paradas;
  const resultado = body?.resultado;
  if (!nome) return { erro: "Informe um nome para a rota" };
  if (!origem || !Number.isFinite(origem.lat) || !Number.isFinite(origem.lon)) return { erro: "Rota sem ponto de saída" };
  if (!Array.isArray(paradas) || !paradas.length || !Array.isArray(resultado?.ordem)) return { erro: "Rota sem paradas" };
  const data = String(body?.data_entrega ?? "");
  return {
    nome: nome.slice(0, 200),
    data_entrega: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null,
    origem: { endereco: String(origem.endereco ?? ""), lat: origem.lat, lon: origem.lon, manual: !!origem.manual },
    retornar: !!body.retornar,
    paradas,
    resultado,
    qtd_paradas: paradas.length,
    distancia_total: Number(resultado.distanciaTotal) || null,
    duracao_total: Number(resultado.duracaoTotal) || null,
  };
}
