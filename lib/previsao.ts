// Chegada prevista em cada parada a partir do horário de saída, do tempo de direção de
// cada trecho (OSRM, sem trânsito), do tempo por parada e das janelas combinadas.
import { hhmmParaSeg, type Horarios } from "@/lib/horarios";
import type { ResultadoRota } from "@/lib/osrm";

export type PrevisaoParada = { id: string; chegada: number; espera: number; atraso: number };

export function calcularChegadas(
  resultado: ResultadoRota,
  horarios: Horarios,
  // Modo motorista: recomeça a conta de um ponto já feito (ex.: última entrega às 10:40)
  aPartirDe?: { indice: number; hora: number }
) {
  const parada = Math.max(0, Number(horarios.parada) || 0) * 60;
  let t = hhmmParaSeg(horarios.saida) ?? 8 * 3600;
  const lista: PrevisaoParada[] = [];
  resultado.ordem.forEach((p, k) => {
    if (aPartirDe && k === aPartirDe.indice + 1) t = aPartirDe.hora;
    t += p.duracaoTrecho;
    const j = horarios.janelas?.[p.id];
    const ini = hhmmParaSeg(j?.inicio);
    const fim = hhmmParaSeg(j?.fim);
    const espera = ini != null && t < ini ? ini - t : 0;
    t += espera;
    const chegada = t;
    lista.push({ id: p.id, chegada, espera, atraso: fim != null && chegada > fim ? chegada - fim : 0 });
    t += parada;
  });
  const fim = resultado.retorno ? t + resultado.retorno.duracao : t;
  return { paradas: new Map(lista.map((x) => [x.id, x])), fim, atrasos: lista.filter((x) => x.atraso > 0).length };
}

export const segParaHhmm = (s: number) => {
  const m = Math.round(s / 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export const agoraEmSeg = () => {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
};
