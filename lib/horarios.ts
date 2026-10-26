// Ordem de entrega respeitando horários ("chegar entre X e Y").
// O OSRM "trip" não conhece horários, então aqui buscamos a ordem com uma busca local
// (realocar e inverter trechos) sobre a matriz de tempos do OSRM. Atraso pesa muito mais
// que tempo de direção, então a ordem só atrasa uma janela se não houver outro jeito.

export type Janela = { inicio?: string; fim?: string }; // "HH:MM"
export type Horarios = { saida: string; parada: number; janelas: Record<string, Janela> };

export const hhmmParaSeg = (h?: string) => {
  const m = String(h ?? "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : null;
};

export const temJanelas = (h?: Horarios | null) =>
  !!h && Object.values(h.janelas ?? {}).some((j) => hhmmParaSeg(j.inicio) != null || hhmmParaSeg(j.fim) != null);

type Problema = {
  tempos: number[][]; // [origem, ...paradas] x [origem, ...paradas], em segundos
  inicio: (number | null)[]; // por parada
  fim: (number | null)[];
  saida: number;
  parada: number;
  retornar: boolean;
};

const PESO_ATRASO = 50;

function custo(ordem: number[], p: Problema) {
  let t = p.saida;
  let atual = 0;
  let atraso = 0;
  for (const i of ordem) {
    t += p.tempos[atual][i + 1];
    const ini = p.inicio[i];
    const fim = p.fim[i];
    if (ini != null && t < ini) t = ini; // chegou cedo: espera
    if (fim != null && t > fim) atraso += t - fim;
    t += p.parada;
    atual = i + 1;
  }
  if (p.retornar) t += p.tempos[atual][0];
  return t - p.saida + PESO_ATRASO * atraso;
}

function buscaLocal(ordem: number[], p: Problema) {
  let melhor = ordem.slice();
  let melhorCusto = custo(melhor, p);
  const n = melhor.length;
  for (let melhorou = true; melhorou; ) {
    melhorou = false;
    // Realocar uma parada para outra posição
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const c = melhor.slice();
        const [x] = c.splice(i, 1);
        c.splice(j, 0, x);
        const v = custo(c, p);
        if (v < melhorCusto - 1e-6) {
          melhor = c;
          melhorCusto = v;
          melhorou = true;
        }
      }
    }
    // Inverter um trecho (2-opt)
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const c = [...melhor.slice(0, i), ...melhor.slice(i, j + 1).reverse(), ...melhor.slice(j + 1)];
        const v = custo(c, p);
        if (v < melhorCusto - 1e-6) {
          melhor = c;
          melhorCusto = v;
          melhorou = true;
        }
      }
    }
  }
  return { ordem: melhor, custo: melhorCusto };
}

function vizinhoMaisProximo(p: Problema, n: number) {
  const ordem: number[] = [];
  const livres = new Set(Array.from({ length: n }, (_, i) => i));
  let atual = 0;
  while (livres.size) {
    let melhor = -1;
    for (const i of livres) if (melhor < 0 || p.tempos[atual][i + 1] < p.tempos[atual][melhor + 1]) melhor = i;
    ordem.push(melhor);
    livres.delete(melhor);
    atual = melhor + 1;
  }
  return ordem;
}

export function ordenarComHorarios(p: Problema): number[] {
  const n = p.inicio.length;
  const porPrazo = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (p.fim[a] ?? p.inicio[a] ?? Infinity) - (p.fim[b] ?? p.inicio[b] ?? Infinity)
  );
  const partidas = [vizinhoMaisProximo(p, n), porPrazo];
  // Algumas partidas aleatórias para escapar de soluções ruins
  for (let k = 0; k < 12; k++) partidas.push([...porPrazo].sort(() => Math.random() - 0.5));
  let melhor = { ordem: partidas[0], custo: Infinity };
  for (const partida of partidas) {
    const r = buscaLocal(partida, p);
    if (r.custo < melhor.custo) melhor = r;
  }
  return melhor.ordem;
}
