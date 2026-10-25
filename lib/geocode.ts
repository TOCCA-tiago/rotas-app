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

// ---------------------------------------------------------------------------
// Google Geocoding (usado quando GOOGLE_MAPS_API_KEY existir; bem mais preciso no Brasil)

const usarGoogle = () => !!process.env.GOOGLE_MAPS_API_KEY;

function precisaoGoogle(r: any): string {
  const tipo = r.geometry?.location_type;
  const tipos: string[] = r.types ?? [];
  if (!r.partial_match && (tipo === "ROOFTOP" || tipo === "RANGE_INTERPOLATED")) return "endereco";
  if (tipos.includes("street_address") || tipos.includes("premise") || tipos.includes("subpremise")) {
    return r.partial_match ? "rua" : "endereco";
  }
  if (tipos.includes("route")) return "rua";
  if (tipos.includes("postal_code")) return "cep";
  if (tipos.some((t) => t.startsWith("sublocality") || t === "neighborhood")) return "bairro";
  return "cidade";
}

async function google(endereco: string): Promise<Ponto | null> {
  const qs = new URLSearchParams({
    address: endereco,
    components: "country:BR",
    region: "br",
    language: "pt-BR",
    key: process.env.GOOGLE_MAPS_API_KEY!,
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`, { cache: "no-store" });
  const j = await res.json().catch(() => ({}));
  if (j.status === "ZERO_RESULTS") return null;
  if (j.status !== "OK") throw new Error(`Google Geocoding: ${j.status} ${j.error_message ?? ""}`.trim());
  const r = j.results[0];
  return { lat: r.geometry.location.lat, lon: r.geometry.location.lng, precisao: precisaoGoogle(r) };
}

function textoGoogle(e: Endereco) {
  const cep = e.cep.length === 8 ? `${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : e.cep;
  return [[e.logradouro, e.numero].filter(Boolean).join(", "), e.bairro, [e.cidade, e.uf].filter(Boolean).join(" - "), cep]
    .filter(Boolean)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Cache: ajuste manual (pino arrastado) > resultado do Google > resultado do OpenStreetMap.
// O Google grava com prefixo "g|", então endereços já localizados pelo OpenStreetMap
// são refeitos pelo Google na primeira vez em que aparecerem.

async function lerCache(supabase: SupabaseClient, chaves: string[]) {
  const { data } = await supabase.from("rotas_geocache").select("chave, lat, lon, precisao").in("chave", chaves);
  return new Map((data ?? []).map((d) => [d.chave as string, d as { lat: number; lon: number; precisao: string }]));
}

async function gravarCache(supabase: SupabaseClient, chave: string, p: Ponto) {
  await supabase.from("rotas_geocache").upsert({ chave, ...p, atualizado_em: new Date().toISOString() });
}

export async function geocodificar(supabase: SupabaseClient, e: Endereco) {
  const chave = chaveEndereco(e);
  const chaveG = `g|${chave}`;
  const cache = await lerCache(supabase, [chave, chaveG]);
  const manual = cache.get(chave);
  if (manual?.precisao === "manual") return { lat: manual.lat, lon: manual.lon, precisao: "manual", cache: true };

  let erroGoogle: string | undefined;
  if (usarGoogle()) {
    const g = cache.get(chaveG);
    if (g) return { lat: g.lat, lon: g.lon, precisao: g.precisao, fonte: "google", cache: true };
    try {
      const ponto = await google(textoGoogle(e));
      if (ponto) {
        await gravarCache(supabase, chaveG, ponto);
        return { ...ponto, fonte: "google", cache: true }; // Google não precisa da pausa do Nominatim
      }
    } catch (err) {
      erroGoogle = err instanceof Error ? err.message : String(err);
      console.warn("[geocode] google:", erroGoogle); // cai para o OpenStreetMap
    }
  }

  // A tela mostra erroGoogle, para ficar claro quando a chave não está funcionando
  const osm = cache.get(chave);
  if (osm) return { lat: osm.lat, lon: osm.lon, precisao: osm.precisao, fonte: "osm", cache: true, erroGoogle };
  const ponto = await geocodificarSemCache(e);
  if (ponto) await gravarCache(supabase, chave, ponto);
  return ponto
    ? { ...ponto, fonte: "osm", cache: false, erroGoogle }
    : { lat: null, lon: null, precisao: null, fonte: null, cache: false, erroGoogle };
}

export async function salvarManual(supabase: SupabaseClient, chave: string, lat: number, lon: number) {
  const { error } = await supabase
    .from("rotas_geocache")
    .upsert({ chave, lat, lon, precisao: "manual", atualizado_em: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function geocodificarTexto(supabase: SupabaseClient, endereco: string) {
  const base = `texto|${endereco.toLowerCase().trim()}`;
  const chave = usarGoogle() ? `g|${base}` : base;
  const cache = await lerCache(supabase, [chave]);
  const salvo = cache.get(chave);
  if (salvo) return { lat: salvo.lat, lon: salvo.lon, precisao: salvo.precisao };

  let ponto: Ponto | null = null;
  if (usarGoogle()) ponto = await google(endereco).catch((err) => (console.warn("[geocode] google:", err), null));
  if (!ponto) {
    const hit = await nominatim({ q: endereco }).catch(() => null);
    ponto = hit ? { ...hit, precisao: "endereco" } : null;
  }
  if (ponto) await gravarCache(supabase, chave, ponto);
  return ponto;
}
