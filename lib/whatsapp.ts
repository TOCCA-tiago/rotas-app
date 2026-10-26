// Link do WhatsApp avisando o cliente da previsão de chegada.

// Telefone do Tiny ("(51) 98203-1760", "051982031760"…) para o formato do wa.me (5551982031760).
export function foneWhatsApp(fone: string | null | undefined): string | null {
  let d = String(fone ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  d = d.replace(/^0+/, "");
  if (d.length !== 10 && d.length !== 11) return null;
  return `55${d}`;
}

// Janela de meia hora a partir da previsão arredondada para baixo (ex.: 14:07 → "14:00 e 14:30")
function janelaMeiaHora(chegadaSeg: number) {
  const min = Math.floor(chegadaSeg / 60 / 15) * 15;
  const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${fmt(min)} e ${fmt(min + 30)}`;
}

export function mensagemPrevisao(cliente: string, numeroNf: string, chegadaSeg: number | null) {
  const nome = cliente.trim().split(/\s+/)[0] ?? "";
  const saudacao = nome && nome === nome.toUpperCase() && nome.length > 3 ? "Olá!" : `Olá, ${nome}!`;
  const quando = chegadaSeg != null ? ` A previsão de chegada é entre ${janelaMeiaHora(chegadaSeg)}.` : "";
  return `${saudacao} Aqui é da TOCCA. Sua entrega (NF ${Number(numeroNf) || numeroNf}) está a caminho.${quando} Qualquer coisa, é só responder esta mensagem.`;
}

export function linkWhatsApp(fone: string | null | undefined, texto: string) {
  const numero = foneWhatsApp(fone);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null;
}
