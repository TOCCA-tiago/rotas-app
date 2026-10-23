import { NextResponse, type NextRequest } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/auth";
import { pesquisarNotas } from "@/lib/tiny";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Uma página do Tiny por chamada (100 notas); o navegador pede as próximas.
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  const q = request.nextUrl.searchParams;
  try {
    const r = await pesquisarNotas({
      dataInicial: q.get("dataInicial") ?? undefined,
      dataFinal: q.get("dataFinal") ?? undefined,
      situacao: q.get("situacao") ?? undefined,
      cliente: q.get("cliente") ?? undefined,
      numero: q.get("numero") ?? undefined,
      pagina: Math.max(1, Number(q.get("pagina")) || 1),
    });
    return NextResponse.json(r);
  } catch (err) {
    return respostaErro(err);
  }
}
