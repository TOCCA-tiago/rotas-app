import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/auth";
import { obterNota } from "@/lib/tiny";

export const dynamic = "force-dynamic";

// Nota completa, para quando a pesquisa não trouxer o endereço.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  try {
    return NextResponse.json({ nota: await obterNota(params.id) });
  } catch (err) {
    return respostaErro(err);
  }
}
