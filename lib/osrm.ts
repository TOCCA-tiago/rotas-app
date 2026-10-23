// Roteirização com OSRM: "trip" otimiza a ordem, "route" segue a ordem informada.

type LatLon = { lat: number; lon: number };
export type ParadaRota = LatLon & { id: string };

export type ResultadoRota = {
  ordem: { id: string; distanciaTrecho: number; duracaoTrecho: number }[];
  retorno: { distancia: number; duracao: number } | null;
  distanciaTotal: number;
  duracaoTotal: number;
  geometria: GeoJSON.LineString;
};

export async function calcularRota(input: {
  origem: LatLon;
  paradas: ParadaRota[];
  retornar: boolean;
  otimizar: boolean;
}): Promise<ResultadoRota> {
  const { origem, paradas, retornar, otimizar } = input;
  if (!origem || !paradas?.length) throw new Error("Informe a origem e ao menos uma parada");

  const pontos: LatLon[] = [origem, ...paradas];
  if (!otimizar && retornar) pontos.push(origem);
  const coords = pontos.map((p) => `${Number(p.lon).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(";");

  const qs = new URLSearchParams({ overview: "full", geometries: "geojson", steps: "false" });
  if (otimizar) {
    qs.set("source", "first");
    qs.set("roundtrip", String(retornar));
    if (!retornar) qs.set("destination", "any");
  }

  const base = (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");
  const res = await fetch(`${base}/${otimizar ? "trip" : "route"}/v1/driving/${coords}?${qs}`, {
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
  };
}
