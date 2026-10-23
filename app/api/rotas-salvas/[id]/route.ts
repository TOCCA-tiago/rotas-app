import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/auth";
import { dadosRotaSalva } from "@/lib/rotas-salvas";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_request: Request, { params }: Ctx) {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  const { data, error } = await auth.supabase.from("rotas_salvas").select("*").eq("id", params.id).maybeSingle();
  if (error) return respostaErro(new Error(error.message));
  if (!data) return NextResponse.json({ erro: "Rota não encontrada" }, { status: 404 });
  return NextResponse.json({ rota: data });
}

export async function PUT(request: Request, { params }: Ctx) {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  const dados = dadosRotaSalva(await request.json().catch(() => ({})));
  if ("erro" in dados) return NextResponse.json(dados, { status: 400 });
  const { data, error } = await auth.supabase
    .from("rotas_salvas")
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq("id", params.id)
    .select("id")
    .maybeSingle();
  if (error) return respostaErro(new Error(error.message));
  if (!data) return NextResponse.json({ erro: "Rota não encontrada" }, { status: 404 });
  return NextResponse.json({ id: data.id });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  const { error } = await auth.supabase.from("rotas_salvas").delete().eq("id", params.id);
  if (error) return respostaErro(new Error(error.message));
  return NextResponse.json({ ok: true });
}
