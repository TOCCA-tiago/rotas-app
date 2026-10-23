// Geocodificação com Nominatim (OpenStreetMap) e BrasilAPI (CEP).
// Os resultados ficam na tabela rotas_geocache, compartilhada por todos os usuários.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Endereco } from "@/lib/tiny";

const USER_AGENT = "TOCCA-Rotas/1.0 (rotas.tocca.com.br)";

export type Ponto = { lat: number; lon: number; precisao: string };

export function chaveEndereco(e: Endereco) {
  return [e.logradouro, e.numero, e.bairro, e.cidade, e.uf, e.cep]
    .map((s) =>
      String(s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .join("|");
}

async function nominatim(params: Record<string, string>) {
  const qs = new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "br", ...params });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const [hit] = await res.json();
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
}

async function brasilApiCep(cep: string) {
  if (cep.length !== 8) return null;
  const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { cache: "no-store" });
  if (!res.ok) return null;
  const c = (await res.json())?.location?.coordinates;
  return c?.latitude && c?.longitude ? { lat: Number(c.latitude), lon: Number(c.longitude) } : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geocodificarSemCache(e: Endereco): Promise<Ponto | null> {
  const cepFmt = e.cep.length === 8 ? `${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : "";
  const tentativas: [string, () => Promise<{ lat: number; lon: number } | null>][] = [
    ["endereco", () => nominatim({ street: `${e.numero} ${e.logradouro}`.trim(), city: e.cidade, state: e.uf, country: "Brasil" })],
    ["endereco", () => nominatim({ q: [`${e.logradouro} ${e.numero}`.trim(), e.bairro, e.cidade, e.uf, "Brasil"].filter(Boolean).join(", ") })],
    ["rua", () => nominatim({ street: e.logradouro, city: e.cidade, state: e.uf, country: "Brasil" })],
    ["cep", () => brasilApiCep(e.cep)],
    ["cep", async () => (cepFmt ? nominatim({ postalcode: cepFmt, country: "Brasil" }) : null)],
    ["bairro", async () => (e.bairro ? nominatim({ q: [e.bairro, e.cidade, e.uf, "Brasil"].join(", ") }) : null)],
    ["cidade", () => nominatim({ city: e.cidade, state: e.uf, country: "Brasil" })],
  ];

  for (const [precisao, fn] of tentativas) {
    try {
      const hit = await fn();
      if (hit) return { ...hit, precisao };
    } catch (err) {
      console.warn(`[geocode] ${precisao}:`, err);
    }
    await sleep(1000); // limite de uso do Nominatim: 1 consulta por segundo
  }
  return null;
}

export async function geocodificar(supabase: SupabaseClient, e: Endereco) {
  const chave = chaveEndereco(e);
  const { data } = await supabase
    .from("rotas_geocache")
    .select("lat, lon, precisao")
    .eq("chave", chave)
    .maybeSingle();
  if (data) return { ...data, cache: true };

  const ponto = await geocodificarSemCache(e);
  if (ponto) {
    await supabase.from("rotas_geocache").upsert({ chave, ...ponto, atualizado_em: new Date().toISOString() });
  }
  return ponto ? { ...ponto, cache: false } : null;
}

export async function salvarManual(supabase: SupabaseClient, chave: string, lat: number, lon: number) {
  const { error } = await supabase
    .from("rotas_geocache")
    .upsert({ chave, lat, lon, precisao: "manual", atualizado_em: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function geocodificarTexto(supabase: SupabaseClient, endereco: string) {
  const chave = `texto|${endereco.toLowerCase().trim()}`;
  const { data } = await supabase.from("rotas_geocache").select("lat, lon, precisao").eq("chave", chave).maybeSingle();
  if (data) return data;
  const hit = await nominatim({ q: endereco }).catch(() => null);
  if (!hit) return null;
  const ponto = { ...hit, precisao: "endereco" };
  await supabase.from("rotas_geocache").upsert({ chave, ...ponto, atualizado_em: new Date().toISOString() });
  return ponto;
}
