import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/auth";
import { chaveEndereco, salvarManual } from "@/lib/geocode";

export const dynamic = "force-dynamic";

// Pino arrastado no mapa: a posição corrigida vale para as próximas rotas.
export async function POST(request: Request) {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  const { endereco, lat, lon } = await request.json().catch(() => ({}));
  if (!endereco?.logradouro || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  }
  try {
    await salvarManual(auth.supabase, chaveEndereco(endereco), lat, lon);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
