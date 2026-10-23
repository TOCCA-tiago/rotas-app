// Leitura de notas fiscais na API v2 do Tiny (mesmo token do CRM: TINY_API_TOKEN).

const TINY_BASE = "https://api.tiny.com.br/api2";

// Situações de NF que nunca viram entrega: 3 Cancelada, 5 Rejeitada, 10 Denegada
const SITUACOES_IGNORADAS = new Set(["3", "5", "10"]);

export type Endereco = {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  cidade: string;
  uf: string;
};

export type Nota = {
  id: string;
  numero: string;
  serie: string;
  dataEmissao: string;
  cliente: string;
  fone: string;
  valor: number;
  situacao: string;
  descricaoSituacao: string;
  fonteEndereco: "entrega" | "cliente" | null;
  endereco: Endereco | null;
  enderecoTexto: string;
};

type Retorno = Record<string, any>;

export class TinyErro extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tiny(metodo: string, params: Record<string, string>): Promise<Retorno | null> {
  const token = process.env.TINY_API_TOKEN;
  if (!token) throw new TinyErro("TINY_API_TOKEN não configurado");
  const body = new URLSearchParams({ token, formato: "json", ...params });

  for (let tentativa = 1; ; tentativa++) {
    const res = await fetch(`${TINY_BASE}/${metodo}.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!res.ok) throw new TinyErro(`Tiny respondeu HTTP ${res.status} em ${metodo}`);
    const json = await res.json();
    const ret: Retorno = json?.retorno ?? {};
    if (ret.status === "OK") return ret;

    const codigo = String(ret.codigo_erro ?? "");
    const msgs = (Array.isArray(ret.erros) ? ret.erros : [ret.erros])
      .filter(Boolean)
      .map((e: any) => (typeof e === "string" ? e : e.erro))
      .join("; ");
    // 20 = "A consulta não retornou registros"
    if (codigo === "20") return null;
    // 6 = API bloqueada por excesso de acessos: espera um pouco e tenta de novo
    if (codigo === "6" && tentativa < 3) {
      await sleep(5000 * tentativa);
      continue;
    }
    throw new TinyErro(`Tiny (${metodo}) erro ${codigo}: ${msgs || "desconhecido"}`);
  }
}

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const texto = (s: unknown) => String(s ?? "").trim();

function montarEndereco(src: any): Endereco | null {
  if (!src) return null;
  const e: Endereco = {
    logradouro: texto(src.endereco),
    numero: texto(src.numero),
    complemento: texto(src.complemento),
    bairro: texto(src.bairro),
    cep: soDigitos(src.cep),
    cidade: texto(src.cidade),
    uf: texto(src.uf).toUpperCase(),
  };
  return e.logradouro && (e.cidade || e.cep) ? e : null;
}

export function enderecoTexto(e: Endereco | null): string {
  if (!e) return "";
  const cep = e.cep.length === 8 ? `${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : e.cep;
  return [
    [e.logradouro, e.numero].filter(Boolean).join(", "),
    e.complemento,
    e.bairro,
    [e.cidade, e.uf].filter(Boolean).join(" - "),
    cep,
  ]
    .filter(Boolean)
    .join(", ");
}

function normalizarNota(nf: any): Nota {
  // Prioriza o endereço de entrega; se não houver, usa o do cliente
  const entrega = montarEndereco(nf.endereco_entrega);
  const cliente = montarEndereco(nf.cliente);
  const endereco = entrega ?? cliente;
  return {
    id: String(nf.id),
    numero: texto(nf.numero ?? nf.numero_nota),
    serie: texto(nf.serie),
    dataEmissao: texto(nf.data_emissao),
    cliente: texto(nf.endereco_entrega?.nome_destinatario || nf.cliente?.nome || nf.nome),
    fone: texto(nf.endereco_entrega?.fone || nf.cliente?.fone),
    valor: Number(nf.valor ?? nf.valor_nota ?? 0),
    situacao: texto(nf.situacao),
    descricaoSituacao: texto(nf.descricao_situacao),
    fonteEndereco: entrega ? "entrega" : cliente ? "cliente" : null,
    endereco,
    enderecoTexto: enderecoTexto(endereco),
  };
}

function isoParaBr(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export async function pesquisarNotas(filtros: {
  dataInicial?: string;
  dataFinal?: string;
  situacao?: string;
  cliente?: string;
  numero?: string;
  pagina: number;
}): Promise<{ notas: Nota[]; numeroPaginas: number }> {
  const params: Record<string, string> = { tipoNota: "S", pagina: String(filtros.pagina) };
  if (filtros.dataInicial) params.dataInicial = isoParaBr(filtros.dataInicial);
  if (filtros.dataFinal) params.dataFinal = isoParaBr(filtros.dataFinal);
  if (filtros.situacao) params.situacao = filtros.situacao;
  if (filtros.cliente) params.cliente = filtros.cliente;
  if (filtros.numero) params.numero = filtros.numero;

  const ret = await tiny("notas.fiscais.pesquisa", params);
  if (!ret) return { notas: [], numeroPaginas: 0 };
  const notas = (ret.notas_fiscais ?? [])
    .map((item: any) => normalizarNota(item.nota_fiscal ?? item))
    .filter((n: Nota) => !SITUACOES_IGNORADAS.has(n.situacao));
  return { notas, numeroPaginas: Number(ret.numero_paginas ?? 1) };
}

export async function obterNota(id: string): Promise<Nota | null> {
  const ret = await tiny("nota.fiscal.obter", { id });
  return ret?.nota_fiscal ? normalizarNota({ ...ret.nota_fiscal, id }) : null;
}
