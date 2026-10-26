"use client";

import { useEffect, useMemo, useState } from "react";
import type { Entregas, RotaSalva } from "@/lib/rotas-salvas";
import { hhmmParaSeg, type Horarios } from "@/lib/horarios";
import { agoraEmSeg, calcularChegadas, segParaHhmm } from "@/lib/previsao";
import { enderecoGoogle } from "@/lib/endereco-google";
import { linkWhatsApp, mensagemPrevisao } from "@/lib/whatsapp";

const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const segDoDia = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
};
const ehHoje = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function Motorista({ rota }: { rota: RotaSalva }) {
  const [entregas, setEntregas] = useState<Entregas>(rota.entregas ?? {});
  const [salvando, setSalvando] = useState(false);
  const ordem = rota.resultado.ordem;
  const paradaPorId = useMemo(() => new Map(rota.paradas.map((p) => [p.id, p])), [rota.paradas]);
  const horarios: Horarios = rota.resultado.horarios ?? { saida: "08:00", parada: 10, janelas: {} };

  const [atual, setAtual] = useState(() => Math.max(0, ordem.findIndex((p) => !(rota.entregas ?? {})[p.id])));

  // Atualiza a previsão a cada minuto
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Previsão: recomeça da última parada marcada hoje (o motorista saiu de lá naquela hora).
  // Sem nada marcado e já passada a hora de saída, conta a partir de agora.
  const previsao = useMemo(() => {
    let base: { indice: number; hora: number } | undefined;
    ordem.forEach((x, k) => {
      const e = entregas[x.id];
      if (e && ehHoje(e.em) && (!base || segDoDia(e.em) >= base.hora)) base = { indice: k, hora: segDoDia(e.em) };
    });
    const saida = hhmmParaSeg(horarios.saida) ?? 8 * 3600;
    if (!base && agoraEmSeg() > saida) base = { indice: -1, hora: agoraEmSeg() };
    return calcularChegadas(rota.resultado, horarios, base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregas, rota.resultado, tick]);

  const feitas = ordem.filter((p) => entregas[p.id]).length;
  const entregues = ordem.filter((p) => entregas[p.id]?.status === "entregue").length;
  const p = ordem[atual];
  const n = p ? paradaPorId.get(p.id)! : null;
  const prev = p ? previsao.paradas.get(p.id) : undefined;
  const estado = p ? entregas[p.id] : undefined;
  const janela = p ? horarios.janelas?.[p.id] : undefined;

  async function marcar(status: "entregue" | "nao_entregue" | null) {
    if (!p) return;
    let obs: string | null = null;
    if (status === "nao_entregue") {
      obs = prompt("Motivo (opcional): cliente ausente, endereço não encontrado…") ?? null;
      if (obs === null && !confirm("Marcar como NÃO entregue sem motivo?")) return;
    }
    setSalvando(true);
    try {
      const res = await fetch(`/api/rotas-salvas/${rota.id}/entregas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notaId: p.id, status, obs }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) window.location.href = `/login?next=/motorista/${rota.id}`;
      if (!res.ok) throw new Error(j.erro || `HTTP ${res.status}`);
      setEntregas(j.entregas);
      if (status) {
        // Vai para a próxima pendente
        const prox = ordem.findIndex((x, k) => k > atual && !j.entregas[x.id]);
        const qualquer = ordem.findIndex((x) => !j.entregas[x.id]);
        setAtual(prox >= 0 ? prox : qualquer >= 0 ? qualquer : atual);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      alert(`Não foi possível salvar: ${(err as Error).message}. Verifique a internet e tente de novo.`);
    } finally {
      setSalvando(false);
    }
  }

  const linkNavegar = (alvo: { lat: number; lon: number; precisao: string | null; endereco: any } | null) => {
    if (!alvo) return "#";
    const destino = alvo.precisao === "manual" || !alvo.endereco ? `${alvo.lat},${alvo.lon}` : enderecoGoogle(alvo.endereco);
    return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", travelmode: "driving", destination: destino })}`;
  };
  const linkVolta = () => {
    const o = rota.origem;
    const destino = o.manual || !o.endereco ? `${o.lat},${o.lon}` : o.endereco;
    return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", travelmode: "driving", destination: destino })}`;
  };

  const whats = n ? linkWhatsApp(n.fone, mensagemPrevisao(n.cliente, n.numero, prev?.chegada ?? null)) : null;
  const tel = n?.fone ? `tel:${n.fone.replace(/[^\d+]/g, "")}` : null;
  const concluida = feitas === ordem.length && ordem.length > 0;
  const botao = "flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-base font-semibold";

  return (
    <div className="min-h-screen bg-[#faf8f6] pb-10">
      <header className="sticky top-0 z-10 bg-marca px-4 py-3 text-white shadow">
        <div className="flex items-center justify-between gap-3">
          <a href="/" className="text-sm text-white/80">‹ Rotas</a>
          <p className="truncate text-sm font-semibold">{rota.nome}</p>
          <span className="text-sm">{feitas}/{ordem.length}</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/20">
          <div className="h-1.5 rounded-full bg-marca-amarelo transition-all" style={{ width: `${(feitas / Math.max(1, ordem.length)) * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        {concluida ? (
          <section className="space-y-3 rounded-2xl border border-marca-borda bg-white p-5 text-center">
            <p className="titulo text-3xl">Rota concluída</p>
            <p className="text-slate-600">{entregues} entregue(s), {feitas - entregues} não entregue(s).</p>
            {rota.retornar && (
              <a href={linkVolta()} target="_blank" rel="noopener noreferrer" className={`${botao} bg-marca-azul text-white`}>
                📍 Voltar para {rota.origem.endereco.includes("Hohendorff") ? "a TOCCA" : "a saída"}
              </a>
            )}
          </section>
        ) : null}

        {n && p && (
          <section className="space-y-3 rounded-2xl border border-marca-borda bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {estado ? "Parada" : "Próxima entrega"} · {atual + 1}ª de {ordem.length}
              </p>
              {prev && !estado && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${prev.atraso > 0 ? "bg-red-100 text-red-700" : "bg-marca-amarelo/40"}`}>
                  previsão ~{segParaHhmm(prev.chegada)}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">{n.cliente}</h1>
              <p className="mt-1 text-base">{n.enderecoTexto}</p>
              <p className="mt-1 text-sm text-slate-600">NF {n.numero} · {fmtMoeda(n.valor)}{n.fone && ` · ${n.fone}`}</p>
              {(janela?.inicio || janela?.fim) && (
                <p className="mt-1 text-sm font-medium text-marca">
                  ⏰ Combinado {janela.inicio && janela.fim ? `entre ${janela.inicio} e ${janela.fim}` : janela.inicio ? `a partir das ${janela.inicio}` : `até ${janela.fim}`}
                </p>
              )}
            </div>

            <a href={linkNavegar(n)} target="_blank" rel="noopener noreferrer" className={`${botao} w-full bg-marca-azul text-white`}>
              📍 Navegar até aqui
            </a>
            <div className="grid grid-cols-2 gap-2">
              <a href={tel ?? undefined} aria-disabled={!tel}
                className={`${botao} border border-marca-borda bg-white ${tel ? "" : "pointer-events-none opacity-40"}`}>📞 Ligar</a>
              <a href={whats ?? undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!whats}
                className={`${botao} bg-[#25D366] text-white ${whats ? "" : "pointer-events-none opacity-40"}`}>💬 WhatsApp</a>
            </div>
            {!n.fone && <p className="text-center text-xs text-slate-500">Sem telefone cadastrado na nota.</p>}

            {estado ? (
              <div className={`rounded-xl p-3 text-center ${estado.status === "entregue" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                <p className="font-semibold">
                  {estado.status === "entregue" ? "✓ Entregue" : "✗ Não entregue"} às {segParaHhmm(segDoDia(estado.em))}
                </p>
                {estado.obs && <p className="text-sm">{estado.obs}</p>}
                <button onClick={() => marcar(null)} disabled={salvando} className="mt-2 text-sm underline">Desfazer</button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => marcar("entregue")} disabled={salvando}
                  className={`${botao} col-span-2 bg-green-600 text-white disabled:opacity-50`}>✓ Entregue</button>
                <button onClick={() => marcar("nao_entregue")} disabled={salvando}
                  className={`${botao} border border-red-300 bg-white text-red-700 disabled:opacity-50`}>✗ Não</button>
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-marca-borda bg-white">
          <h2 className="border-b border-marca-borda px-4 py-2 text-sm font-semibold">Todas as paradas</h2>
          <ol>
            {ordem.map((x, k) => {
              const nx = paradaPorId.get(x.id)!;
              const ex = entregas[x.id];
              const px = previsao.paradas.get(x.id);
              return (
                <li key={x.id}>
                  <button onClick={() => { setAtual(k); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className={`flex w-full items-center gap-3 border-b border-marca-borda px-4 py-2.5 text-left last:border-0 ${k === atual ? "bg-marca-amarelo/20" : ""}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${ex?.status === "entregue" ? "bg-green-600" : ex ? "bg-red-600" : "bg-marca"}`}>
                      {ex?.status === "entregue" ? "✓" : ex ? "✗" : k + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-medium ${ex ? "text-slate-500 line-through" : ""}`}>{nx.cliente}</span>
                      <span className="block truncate text-xs text-slate-500">{nx.endereco?.bairro || nx.enderecoTexto}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {ex ? segParaHhmm(segDoDia(ex.em)) : px ? `~${segParaHhmm(px.chegada)}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {!concluida && (
          <p className="text-center text-xs text-slate-500">
            Previsões sem trânsito, com {horarios.parada} min em cada parada. Elas se ajustam a cada entrega marcada.
          </p>
        )}
      </main>
    </div>
  );
}
