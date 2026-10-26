import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/auth";
import { calcularRota } from "@/lib/osrm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(
      await calcularRota({
        origem: body.origem,
        paradas: body.paradas,
        retornar: !!body.retornar,
        otimizar: body.otimizar !== false,
        horarios: body.horarios ?? null,
      })
    );
  } catch (err) {
    return respostaErro(err);
  }
}
