import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/auth";
import { geocodificarTexto } from "@/lib/geocode";

export const dynamic = "force-dynamic";

// Localiza o endereço de saída digitado na tela.
export async function POST(request: Request) {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  const { endereco } = await request.json().catch(() => ({}));
  if (!endereco || String(endereco).trim().length < 5) {
    return NextResponse.json({ erro: "Informe o endereço de saída" }, { status: 400 });
  }
  try {
    const ponto = await geocodificarTexto(auth.supabase, String(endereco).trim());
    return NextResponse.json(ponto ?? { lat: null, lon: null, precisao: null });
  } catch (err) {
    return respostaErro(err);
  }
}
