// Roteirização com OSRM: "trip" otimiza a ordem, "route" segue a ordem informada.
// Com horários marcados, a ordem vem de lib/horarios.ts (sobre a matriz de tempos do OSRM).
import { hhmmParaSeg, ordenarComHorarios, temJanelas, type Horarios } from "@/lib/horarios";

type LatLon = { lat: number; lon: number };
export type ParadaRota = LatLon & { id: string };

export type ResultadoRota = {
  ordem: { id: string; distanciaTrecho: number; duracaoTrecho: number }[];
  retorno: { distancia: number; duracao: number } | null;
  distanciaTotal: number;
  duracaoTotal: number;
  geometria: GeoJSON.LineString;
  horarios?: Horarios; // saída, tempo por parada e janelas usados (vão junto ao salvar)
};

const osrmBase = () => (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");
const fmtCoords = (pontos: LatLon[]) =>
  pontos.map((p) => `${Number(p.lon).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(";");

async function matrizTempos(pontos: LatLon[]): Promise<number[][]> {
  const res = await fetch(`${osrmBase()}/table/v1/driving/${fmtCoords(pontos)}?annotations=duration`, {
    headers: { "User-Agent": "TOCCA-Rotas/1.0" },
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (j.code !== "Ok") throw new Error(`OSRM: ${j.message || j.code || `HTTP ${res.status}`}`);
  return j.durations.map((linha: (number | null)[]) => linha.map((v) => v ?? 1e7));
}

export async function calcularRota(input: {
  origem: LatLon;
  paradas: ParadaRota[];
  retornar: boolean;
  otimizar: boolean;
  horarios?: Horarios | null;
}): Promise<ResultadoRota> {
  const { origem, paradas, retornar, otimizar, horarios } = input;
  if (!origem || !paradas?.length) throw new Error("Informe a origem e ao menos uma parada");

  if (otimizar && temJanelas(horarios) && paradas.length > 1) {
    const h = horarios!;
    const tempos = await matrizTempos([origem, ...paradas]);
    const ordem = ordenarComHorarios({
      tempos,
      inicio: paradas.map((p) => hhmmParaSeg(h.janelas[p.id]?.inicio)),
      fim: paradas.map((p) => hhmmParaSeg(h.janelas[p.id]?.fim)),
      saida: hhmmParaSeg(h.saida) ?? 8 * 3600,
      parada: Math.max(0, Number(h.parada) || 0) * 60,
      retornar,
    });
    return calcularRota({ origem, paradas: ordem.map((i) => paradas[i]), retornar, otimizar: false, horarios });
  }

  const pontos: LatLon[] = [origem, ...paradas];
  if (!otimizar && retornar) pontos.push(origem);
  const coords = pontos.map((p) => `${Number(p.lon).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(";");

  const qs = new URLSearchParams({ overview: "full", geometries: "geojson", steps: "false" });
  if (otimizar) {
    qs.set("source", "first");
    qs.set("roundtrip", String(retornar));
    if (!retornar) qs.set("destination", "any");
  }

  const res = await fetch(`${osrmBase()}/${otimizar ? "trip" : "route"}/v1/driving/${coords}?${qs}`, {
    headers: { "User-Agent": "TOCCA-Rotas/1.0" },
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (j.code !== "Ok") throw new Error(`OSRM: ${j.message || j.code || `HTTP ${res.status}`}`);

  const percurso = otimizar ? j.trips[0] : j.routes[0];
  const ordem: number[] = otimizar
    ? j.waypoints
        .map((w: any, i: number) => ({ i, pos: w.waypoint_index }))
        .filter((w: { i: number }) => w.i > 0)
        .sort((a: { pos: number }, b: { pos: number }) => a.pos - b.pos)
        .map((w: { i: number }) => w.i - 1)
    : paradas.map((_, i) => i);

  return {
    ordem: ordem.map((idx, k) => ({
      id: paradas[idx].id,
      distanciaTrecho: percurso.legs[k].distance,
      duracaoTrecho: percurso.legs[k].duration,
    })),
    retorno: retornar
      ? { distancia: percurso.legs[ordem.length].distance, duracao: percurso.legs[ordem.length].duration }
      : null,
    distanciaTotal: percurso.distance,
    duracaoTotal: percurso.duration,
    geometria: percurso.geometry,
    ...(horarios ? { horarios } : {}),
  };
}
