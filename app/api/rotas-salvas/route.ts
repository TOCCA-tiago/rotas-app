import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/auth";
import { dadosRotaSalva } from "@/lib/rotas-salvas";

export const dynamic = "force-dynamic";

const CAMPOS_LISTA =
  "id, nome, data_entrega, qtd_paradas, distancia_total, duracao_total, criado_por_nome, criado_em, atualizado_em";

export async function GET() {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  const { data, error } = await auth.supabase
    .from("rotas_salvas")
    .select(CAMPOS_LISTA)
    .order("data_entrega", { ascending: false, nullsFirst: false })
    .order("criado_em", { ascending: false })
    .limit(200);
  if (error) return respostaErro(new Error(error.message));
  return NextResponse.json({ rotas: data });
}

export async function POST(request: Request) {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  const dados = dadosRotaSalva(await request.json().catch(() => ({})));
  if ("erro" in dados) return NextResponse.json(dados, { status: 400 });
  try {
    const { data, error } = await auth.supabase
      .from("rotas_salvas")
      .insert({ ...dados, criado_por_nome: auth.profile.full_name ?? auth.user.email })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return respostaErro(err);
  }
}
