import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/auth";
import { geocodificar } from "@/lib/geocode";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  const { endereco } = await request.json().catch(() => ({}));
  if (!endereco?.logradouro) return NextResponse.json({ erro: "Endereço inválido" }, { status: 400 });
  try {
    const ponto = await geocodificar(auth.supabase, endereco);
    return NextResponse.json(ponto ?? { lat: null, lon: null, precisao: null });
  } catch (err) {
    return respostaErro(err);
  }
}
