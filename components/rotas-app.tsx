"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Nota } from "@/lib/tiny";
import type { ResultadoRota } from "@/lib/osrm";
import type { PinoMapa } from "@/components/mapa";

const Mapa = dynamic(() => import("@/components/mapa"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-500">Carregando mapa…</div>,
});

type Origem = { endereco: string; lat: number | null; lon: number | null };
type Coord = { lat: number | null; lon: number | null; precisao: string | null };

const SITUACOES = [
  { valor: "", rotulo: "Todas (exceto canceladas)" },
  { valor: "6", rotulo: "Autorizada" },
  { valor: "7", rotulo: "Emitida DANFE" },
  { valor: "2", rotulo: "Emitida" },
  { valor: "1", rotulo: "Pendente" },
];

const PRECISAO: Record<string, [string, string]> = {
  endereco: ["text-green-700 border-green-700", "localizado"],
  manual: ["text-green-700 border-green-700", "ajuste manual"],
  rua: ["text-amber-700 border-amber-700", "aprox. rua"],
  cep: ["text-amber-700 border-amber-700", "aprox. CEP"],
  bairro: ["text-amber-700 border-amber-700", "aprox. bairro"],
  cidade: ["text-red-700 border-red-700", "só cidade"],
};

const fmtKm = (m: number) => `${(m / 1000).toFixed(1).replace(".", ",")} km`;
const fmtTempo = (s: number) => {
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
};
const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) window.location.href = "/login";
  if (!res.ok) throw new Error(json.erro || `HTTP ${res.status}`);
  return json as T;
}

export function RotasApp({ origemInicial, tinyConfigurado }: { origemInicial: Origem | null; tinyConfigurado: boolean }) {
  const [filtros, setFiltros] = useState(() => {
    const hoje = new Date();
    return { dataInicial: isoLocal(new Date(hoje.getTime() - 7 * 864e5)), dataFinal: isoLocal(hoje), situacao: "", cliente: "" };
  });
  const [notas, setNotas] = useState<Nota[]>([]);
  const [buscou, setBuscou] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [selecionadas, setSelecionadas] = useState<string[]>([]); // ordem de marcação
  const [coords, setCoords] = useState<Record<string, Coord>>({});
  const [filtroLista, setFiltroLista] = useState("");
  const [otimizar, setOtimizar] = useState(true);
  const [retornar, setRetornar] = useState(true);
  const [origem, setOrigem] = useState(origemInicial);
  const [progresso, setProgresso] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRota | null>(null);
  const [focar, setFocar] = useState<{ lat: number; lon: number } | null>(null);
  const [aba, setAba] = useState<"lista" | "mapa">("lista"); // só no celular
  const [numerosTexto, setNumerosTexto] = useState("");
  const [buscandoNumeros, setBuscandoNumeros] = useState(false);
  const [origemTexto, setOrigemTexto] = useState(origemInicial?.endereco ?? "");
  const [localizandoOrigem, setLocalizandoOrigem] = useState(false);

  // Endereço de saída escolhido na tela fica salvo neste navegador
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem("rotas-origem") ?? "null");
      if (salvo?.endereco && salvo.lat != null) {
        setOrigem(salvo);
        setOrigemTexto(salvo.endereco);
      }
    } catch {}
  }, []);

  async function localizarOrigem() {
    const endereco = origemTexto.trim();
    if (!endereco) return;
    setLocalizandoOrigem(true);
    try {
      const p = await api<Coord>("/api/origem", { endereco });
      if (p.lat == null) {
        alert("Não encontrei esse endereço. Tente com rua, número, cidade, UF e CEP.");
        return;
      }
      const nova = { endereco, lat: p.lat, lon: p.lon };
      setOrigem(nova);
      setResultado(null);
      setFocar({ lat: p.lat, lon: p.lon! });
      try {
        localStorage.setItem("rotas-origem", JSON.stringify(nova));
      } catch {}
    } catch (err) {
      alert(`Erro ao localizar o endereço de saída: ${(err as Error).message}`);
    } finally {
      setLocalizandoOrigem(false);
    }
  }

  const notaPorId = useMemo(() => new Map(notas.map((n) => [n.id, n])), [notas]);
  const selecionadasAtuais = selecionadas;
  const notaPorIdAtual = notaPorId;

  // Busca cada número de NF digitado, seleciona as encontradas e já monta a rota
  async function roteirizarNumeros(e: React.FormEvent) {
    e.preventDefault();
    const numeros = [...new Set(numerosTexto.split(/[^0-9]+/).filter(Boolean).map((n) => String(Number(n))))];
    if (!numeros.length) return;
    setBuscandoNumeros(true);
    const encontradas: Nota[] = [];
    const naoEncontradas: string[] = [];
    try {
      for (const [i, numero] of numeros.entries()) {
        setProgresso(`Buscando NF ${numero} no Tiny… ${i + 1}/${numeros.length}`);
        const r = await api<{ notas: Nota[] }>(`/api/notas?numero=${numero}&pagina=1`);
        const nota = r.notas.find((n) => String(Number(n.numero)) === numero);
        if (!nota) {
          naoEncontradas.push(numero);
          continue;
        }
        if (!nota.endereco) {
          const { nota: completa } = await api<{ nota: Nota | null }>(`/api/notas/${nota.id}`).catch(() => ({ nota: null }));
          if (completa) Object.assign(nota, completa);
        }
        encontradas.push(nota);
      }
      const ids = encontradas.filter((n) => n.endereco).map((n) => n.id);
      const semEndereco = encontradas.filter((n) => !n.endereco).map((n) => n.numero);
      const novasNotas = [...encontradas, ...notas.filter((n) => !encontradas.some((x) => x.id === n.id))];
      setNotas(novasNotas);
      setSelecionadas(ids);
      setBuscou(true);
      const avisos = [
        naoEncontradas.length && `NF não encontrada(s) no Tiny: ${naoEncontradas.join(", ")}`,
        semEndereco.length && `NF sem endereço: ${semEndereco.join(", ")}`,
      ].filter(Boolean);
      if (avisos.length) alert(avisos.join("\n"));
      if (ids.length) await montarRota(ids, new Map(novasNotas.map((n) => [n.id, n])));
      else setProgresso("");
    } catch (err) {
      setProgresso("");
      alert(`Erro ao buscar as notas: ${(err as Error).message}`);
    } finally {
      setBuscandoNumeros(false);
    }
  }

  const visiveis = useMemo(() => {
    const f = filtroLista.trim().toLowerCase();
    return f ? notas.filter((n) => `${n.numero} ${n.cliente} ${n.enderecoTexto}`.toLowerCase().includes(f)) : notas;
  }, [notas, filtroLista]);

  async function buscarNotas(e: React.FormEvent) {
    e.preventDefault();
    setBuscando(true);
    setProgresso("");
    try {
      const todas: Nota[] = [];
      for (let pagina = 1; pagina <= 20; pagina++) {
        const qs = new URLSearchParams({ ...filtros, pagina: String(pagina) });
        for (const [k, v] of [...qs]) if (!v) qs.delete(k);
        const r = await api<{ notas: Nota[]; numeroPaginas: number }>(`/api/notas?${qs}`);
        todas.push(...r.notas);
        setProgresso(r.numeroPaginas > 1 ? `Página ${pagina} de ${r.numeroPaginas}…` : "");
        if (pagina >= r.numeroPaginas) break;
      }
      // Notas sem endereço na pesquisa: busca a nota completa
      const semEndereco = todas.filter((n) => !n.endereco);
      for (const [i, n] of semEndereco.entries()) {
        setProgresso(`Buscando endereço das notas ${i + 1}/${semEndereco.length}…`);
        try {
          const { nota } = await api<{ nota: Nota | null }>(`/api/notas/${n.id}`);
          if (nota) Object.assign(n, nota);
        } catch {
          // segue sem endereço; a nota aparece desabilitada na lista
        }
      }
      setNotas(todas);
      setSelecionadas([]);
      setResultado(null);
      setBuscou(true);
      setProgresso("");
    } catch (err) {
      setProgresso("");
      alert(`Erro ao buscar notas: ${(err as Error).message}`);
    } finally {
      setBuscando(false);
    }
  }

  function alternar(id: string) {
    setResultado(null);
    setSelecionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    const c = coords[id];
    if (c?.lat != null && c.lon != null) setFocar({ lat: c.lat, lon: c.lon });
  }

  const elegiveisVisiveis = visiveis.filter((n) => n.endereco);
  const todasMarcadas = elegiveisVisiveis.length > 0 && elegiveisVisiveis.every((n) => selecionadas.includes(n.id));

  function alternarTodas() {
    setResultado(null);
    const ids = elegiveisVisiveis.map((n) => n.id);
    setSelecionadas((s) => (todasMarcadas ? s.filter((id) => !ids.includes(id)) : [...s, ...ids.filter((id) => !s.includes(id))]));
  }

  async function montarRota(selecionadas: string[] = selecionadasAtuais, notaPorId = notaPorIdAtual) {
    if (!origem || origem.lat == null || origem.lon == null) {
      alert("Informe o endereço de saída e clique em Localizar (seção Rota).");
      return;
    }
    setCalculando(true);
    setResultado(null);
    try {
      const novas = { ...coords };
      const pendentes = selecionadas.filter((id) => !novas[id] && notaPorId.get(id)?.endereco);
      for (const [i, id] of pendentes.entries()) {
        setProgresso(`Localizando endereços… ${i + 1}/${pendentes.length}`);
        try {
          const c = await api<Coord & { cache?: boolean }>("/api/geocode", { endereco: notaPorId.get(id)!.endereco });
          novas[id] = c;
          if (!c.cache) await sleep(1000); // limite do Nominatim
        } catch {
          novas[id] = { lat: null, lon: null, precisao: null };
        }
        setCoords({ ...novas });
      }

      const paradas = selecionadas
        .filter((id) => novas[id]?.lat != null)
        .map((id) => ({ id, lat: novas[id].lat!, lon: novas[id].lon! }));
      if (!paradas.length) throw new Error("Nenhum endereço selecionado pôde ser localizado no mapa.");

      setProgresso("Calculando rota…");
      const r = await api<ResultadoRota>("/api/rota", {
        origem: { lat: origem.lat, lon: origem.lon },
        paradas,
        otimizar,
        retornar,
      });
      setResultado(r);
      setAba("mapa");
      const fora = selecionadas.length - paradas.length;
      setProgresso(fora ? `${fora} endereço(s) não localizado(s) ficaram fora da rota.` : "");
    } catch (err) {
      setProgresso("");
      alert(`Erro ao montar rota: ${(err as Error).message}`);
    } finally {
      setCalculando(false);
    }
  }

  const moverPino = useCallback(
    (id: string, lat: number, lon: number) => {
      setCoords((c) => ({ ...c, [id]: { lat, lon, precisao: "manual" } }));
      setResultado(null);
      const nota = notaPorId.get(id);
      if (nota?.endereco) api("/api/geocode/manual", { endereco: nota.endereco, lat, lon }).catch(() => {});
    },
    [notaPorId]
  );

  const moverOrigem = useCallback((lat: number, lon: number) => {
    setOrigem((o) => (o ? { ...o, lat, lon } : o));
    setResultado(null);
  }, []);

  const pinos: PinoMapa[] = useMemo(() => {
    const ordem = new Map(resultado?.ordem.map((p, k) => [p.id, k + 1]) ?? []);
    return selecionadas.flatMap((id) => {
      const c = coords[id];
      const n = notaPorId.get(id);
      if (!n || c?.lat == null || c.lon == null) return [];
      const k = ordem.get(id);
      return [{
        id,
        lat: c.lat,
        lon: c.lon,
        rotulo: k ? String(k) : null,
        tooltip: `NF ${n.numero} — ${n.cliente}<br>${n.enderecoTexto}<br><small>Arraste para corrigir a posição</small>`,
      }];
    });
  }, [selecionadas, coords, notaPorId, resultado]);

  const origemMapa = origem?.lat != null && origem.lon != null ? { lat: origem.lat, lon: origem.lon, endereco: origem.endereco } : null;

  const linksGoogle = useMemo(() => {
    if (!resultado || !origemMapa) return [];
    // Google Maps aceita origem + 9 paradas + destino por link: divide rotas longas
    const pontos = [origemMapa, ...resultado.ordem.map((p) => coords[p.id] as { lat: number; lon: number })];
    if (resultado.retorno) pontos.push(origemMapa);
    const ll = (p: { lat: number; lon: number }) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
    const links: string[] = [];
    for (let i = 0; i < pontos.length - 1; i += 10) {
      const trecho = pontos.slice(i, i + 11);
      const qs = new URLSearchParams({ api: "1", travelmode: "driving", origin: ll(trecho[0]), destination: ll(trecho[trecho.length - 1]) });
      if (trecho.length > 2) qs.set("waypoints", trecho.slice(1, -1).map(ll).join("|"));
      links.push(`https://www.google.com/maps/dir/?${qs}`);
    }
    return links;
  }, [resultado, coords, origemMapa]);

  const [recalculando, setRecalculando] = useState(false);
  const [arrastando, setArrastando] = useState<number | null>(null);

  // Troca manual da ordem: recalcula o trajeto seguindo exatamente a nova sequência
  async function reordenar(ids: string[]) {
    if (!resultado || !origem || origem.lat == null || origem.lon == null || recalculando) return;
    setRecalculando(true);
    try {
      const r = await api<ResultadoRota>("/api/rota", {
        origem: { lat: origem.lat, lon: origem.lon },
        paradas: ids.map((id) => ({ id, lat: coords[id].lat!, lon: coords[id].lon! })),
        otimizar: false,
        retornar: !!resultado.retorno,
      });
      setResultado(r);
    } catch (err) {
      alert(`Erro ao recalcular a rota: ${(err as Error).message}`);
    } finally {
      setRecalculando(false);
    }
  }

  function moverParada(de: number, para: number) {
    if (!resultado || de === para || para < 0 || para >= resultado.ordem.length) return;
    const ids = resultado.ordem.map((p) => p.id);
    const [id] = ids.splice(de, 1);
    ids.splice(para, 0, id);
    reordenar(ids);
  }

  function exportarCsv() {
    if (!resultado) return;
    const linhas: (string | number)[][] = [["Ordem", "NF", "Cliente", "Telefone", "Endereço", "Valor", "Km trecho", "Min trecho"]];
    resultado.ordem.forEach((p, k) => {
      const n = notaPorId.get(p.id)!;
      linhas.push([k + 1, n.numero, n.cliente, n.fone, n.enderecoTexto, n.valor.toFixed(2).replace(".", ","),
        (p.distanciaTrecho / 1000).toFixed(1).replace(".", ","), Math.round(p.duracaoTrecho / 60)]);
    });
    const csv = linhas.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `rota-${isoLocal(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const campo = "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-marca focus:outline-none";

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* Abas no celular */}
      <div className="flex border-b border-marca-borda md:hidden print:hidden">
        {(["lista", "mapa"] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)}
            className={`flex-1 py-2 text-sm font-medium ${aba === a ? "border-b-2 border-marca text-marca" : "text-slate-500"}`}>
            {a === "lista" ? `Notas (${selecionadas.length})` : "Mapa e roteiro"}
          </button>
        ))}
      </div>

      <aside className={`${aba === "lista" ? "flex" : "hidden"} min-h-0 w-full flex-col gap-3 overflow-y-auto bg-[#faf8f6] p-3 md:flex md:w-[400px] md:shrink-0 md:border-r md:border-marca-borda print:hidden`}>
        {!tinyConfigurado && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">TINY_API_TOKEN não configurado na Vercel.</p>
        )}

        <form onSubmit={roteirizarNumeros} className="space-y-2 rounded-xl border border-marca-borda bg-white p-3">
          <h2 className="font-semibold">Roteirizar por número da NF</h2>
          <textarea rows={3} className={campo} placeholder="Ex.: 1234, 1240, 1251 (separe por vírgula, espaço ou uma por linha)"
            value={numerosTexto} onChange={(e) => setNumerosTexto(e.target.value)} />
          <button type="submit" disabled={buscandoNumeros || calculando || !numerosTexto.trim()}
            className="w-full rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50">
            {buscandoNumeros ? "Buscando no Tiny…" : "Montar rota com estas NF"}
          </button>
          {progresso && (buscandoNumeros || calculando) && <p className="text-xs text-slate-600">{progresso}</p>}
        </form>

        <form onSubmit={buscarNotas} className="space-y-2 rounded-xl border border-marca-borda bg-white p-3">
          <h2 className="font-semibold">Ou buscar por período</h2>
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-slate-600">De
              <input type="date" required className={campo} value={filtros.dataInicial}
                onChange={(e) => setFiltros({ ...filtros, dataInicial: e.target.value })} />
            </label>
            <label className="flex-1 text-xs text-slate-600">Até
              <input type="date" required className={campo} value={filtros.dataFinal}
                onChange={(e) => setFiltros({ ...filtros, dataFinal: e.target.value })} />
            </label>
          </div>
          <label className="block text-xs text-slate-600">Situação
            <select className={campo} value={filtros.situacao} onChange={(e) => setFiltros({ ...filtros, situacao: e.target.value })}>
              {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
            </select>
          </label>
          <label className="block text-xs text-slate-600">Cliente
            <input type="text" className={campo} placeholder="Nome ou parte do nome" value={filtros.cliente}
              onChange={(e) => setFiltros({ ...filtros, cliente: e.target.value })} />
          </label>
          <button type="submit" disabled={buscando}
            className="w-full rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50">
            {buscando ? "Buscando no Tiny…" : "Buscar notas"}
          </button>
        </form>

        <section className="flex min-h-[240px] flex-1 flex-col gap-2 rounded-xl border border-marca-borda bg-white p-3">
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} disabled={!elegiveisVisiveis.length} />
              Selecionar todas
            </label>
            <span className="text-xs text-slate-500">{selecionadas.length} de {notas.length} selecionada(s)</span>
          </div>
          <input type="search" className={campo} placeholder="Filtrar (cliente, cidade, bairro, NF)"
            value={filtroLista} onChange={(e) => setFiltroLista(e.target.value)} />
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {!visiveis.length && (
              <li className="py-6 text-center text-sm text-slate-500">
                {!buscou ? "Busque as notas para começar." : notas.length ? "Nenhuma nota corresponde ao filtro." : "Nenhuma nota encontrada no período."}
              </li>
            )}
            {visiveis.map((n) => {
              const c = coords[n.id];
              const marcado = selecionadas.includes(n.id);
              let tag: [string, string] | null = null;
              if (!n.endereco) tag = ["text-red-700 border-red-700", "sem endereço"];
              else if (c && c.lat == null) tag = ["text-red-700 border-red-700", "não localizado"];
              else if (c?.precisao) tag = PRECISAO[c.precisao] ?? PRECISAO.endereco;
              return (
                <li key={n.id} onClick={() => n.endereco && alternar(n.id)}
                  className={`flex cursor-pointer gap-2 border-b border-marca-borda px-1 py-2 hover:bg-marca-cinza/40 ${n.endereco ? "" : "cursor-default opacity-60"} ${marcado ? "bg-marca-amarelo/20" : ""}`}>
                  <input type="checkbox" checked={marcado} disabled={!n.endereco} readOnly className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2 text-sm font-semibold">
                      <span className="truncate">NF {n.numero} · {n.cliente}</span>
                      {tag && <span className={`shrink-0 self-start rounded-full border px-1.5 text-[11px] font-normal ${tag[0]}`}>{tag[1]}</span>}
                    </div>
                    <p className="break-words text-xs text-slate-600">{n.enderecoTexto || "Endereço não informado na nota"}</p>
                    <p className="text-xs text-slate-500">
                      {n.dataEmissao} · {fmtMoeda(n.valor)}
                      {n.descricaoSituacao && ` · ${n.descricaoSituacao}`}
                      {n.fonteEndereco === "entrega" && " · end. de entrega"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-2 rounded-xl border border-marca-borda bg-white p-3 text-sm">
          <h2 className="font-semibold">Rota</h2>
          <label className="block text-xs text-slate-600">Endereço de saída
            <div className="flex gap-2">
              <input type="text" className={campo} placeholder="Rua, número, cidade - UF, CEP" value={origemTexto}
                onChange={(e) => setOrigemTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); localizarOrigem(); } }} />
              <button type="button" onClick={localizarOrigem} disabled={localizandoOrigem || !origemTexto.trim()}
                className="shrink-0 rounded-md border border-marca-borda px-2.5 text-sm hover:bg-marca-cinza disabled:opacity-50">
                {localizandoOrigem ? "…" : "Localizar"}
              </button>
            </div>
          </label>
          <p className={`text-xs ${origem?.lat != null && origem.endereco === origemTexto.trim() ? "text-green-700" : "text-amber-700"}`}>
            {origem?.lat != null && origem.endereco === origemTexto.trim()
              ? "✓ Saída localizada no mapa (⌂). Arraste o ícone se precisar ajustar."
              : "Digite o endereço de saída e clique em Localizar."}
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={otimizar} onChange={(e) => { setOtimizar(e.target.checked); setResultado(null); }} />
            Otimizar ordem das entregas
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={retornar} onChange={(e) => { setRetornar(e.target.checked); setResultado(null); }} />
            Voltar ao ponto de saída no final
          </label>
          <button onClick={() => montarRota()} disabled={!selecionadas.length || calculando}
            className="w-full rounded-md bg-marca px-3 py-2 font-medium text-white hover:bg-marca-escuro disabled:opacity-50">
            {calculando ? "Montando…" : `Montar rota (${selecionadas.length})`}
          </button>
          {progresso && !buscandoNumeros && <p className="text-xs text-slate-600">{progresso}</p>}
        </section>
      </aside>

      <section className={`${aba === "mapa" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col md:flex print:flex`}>
        <div className="min-h-[50vh] flex-1 print:hidden">
          <Mapa origem={origemMapa} pinos={pinos} geometria={resultado?.geometria ?? null}
            onMoverPino={moverPino} onMoverOrigem={moverOrigem} focar={focar} />
        </div>

        {resultado && (
          <div className="max-h-[42vh] overflow-y-auto border-t border-marca-borda bg-white p-4 print:max-h-none print:overflow-visible print:border-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="titulo text-2xl">Roteiro de entregas</h2>
                <p className="text-sm text-slate-600">
                  {resultado.ordem.length} entrega(s) · {fmtKm(resultado.distanciaTotal)} · {fmtTempo(resultado.duracaoTotal)} de direção (sem contar as paradas){recalculando && " · recalculando…"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
                {linksGoogle.map((u, i) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer"
                    className="rounded-lg bg-marca-azul px-3 py-1.5 font-medium text-white hover:opacity-90">
                    Abrir no Google Maps{linksGoogle.length > 1 ? ` (parte ${i + 1})` : ""}
                  </a>
                ))}
                <button onClick={() => resultado && reordenar(resultado.ordem.map((p) => p.id).reverse())} disabled={recalculando}
                  className="rounded-lg border border-marca-borda px-3 py-1.5 hover:bg-marca-cinza disabled:opacity-50">⇅ Inverter sentido</button>
                <button onClick={exportarCsv} className="rounded-lg border border-marca-borda px-3 py-1.5 hover:bg-marca-cinza">Exportar CSV</button>
                <button onClick={() => window.print()} className="rounded-lg border border-marca-borda px-3 py-1.5 hover:bg-marca-cinza">Imprimir romaneio</button>
              </div>
            </div>
            <ol className="mt-3 list-decimal space-y-0 pl-6 text-sm">
              {resultado.ordem.map((p, k) => {
                const n = notaPorId.get(p.id)!;
                const total = resultado.ordem.length;
                const botao = "h-7 w-7 rounded-md border border-marca-borda leading-none hover:bg-marca-cinza disabled:opacity-30";
                return (
                  <li key={p.id}
                    draggable={!recalculando}
                    onDragStart={() => setArrastando(k)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (arrastando != null) moverParada(arrastando, k); setArrastando(null); }}
                    onDragEnd={() => setArrastando(null)}
                    className={`border-b border-marca-borda py-2 ${arrastando === k ? "opacity-40" : ""} ${recalculando ? "opacity-60" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <strong>{n.cliente}</strong> — NF {n.numero}{n.fone && ` · ${n.fone}`}
                        <br />
                        {n.enderecoTexto}
                        <br />
                        <span className="text-xs text-slate-500">+{fmtKm(p.distanciaTrecho)} · {fmtTempo(p.duracaoTrecho)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 print:hidden" title="Arraste a linha ou use as setas para mudar a ordem">
                        <button className={botao} disabled={recalculando || k === 0} onClick={() => moverParada(k, k - 1)} aria-label="Subir">↑</button>
                        <button className={botao} disabled={recalculando || k === total - 1} onClick={() => moverParada(k, k + 1)} aria-label="Descer">↓</button>
                        <select value={k} disabled={recalculando} onChange={(e) => moverParada(k, Number(e.target.value))}
                          className="h-7 rounded-md border border-marca-borda bg-white px-1 text-xs" aria-label="Mover para a posição">
                          {resultado.ordem.map((_, i) => <option key={i} value={i}>{i + 1}º</option>)}
                        </select>
                        <span className="cursor-grab select-none px-1 text-slate-400" aria-hidden>⋮⋮</span>
                      </div>
                    </div>
                  </li>
                );
              })}
              {resultado.retorno && (
                <li className="list-none py-2 text-slate-600">
                  <em>Retorno ao ponto de saída</em>{" "}
                  <span className="text-xs text-slate-500">+{fmtKm(resultado.retorno.distancia)} · {fmtTempo(resultado.retorno.duracao)}</span>
                </li>
              )}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
