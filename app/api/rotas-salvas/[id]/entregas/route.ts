import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/auth";
import type { Entregas } from "@/lib/rotas-salvas";

export const dynamic = "force-dynamic";

// Modo motorista: marca uma parada como entregue / não entregue (status null desfaz).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await exigirUsuario();
  if (auth.erro) return auth.erro;
  const { notaId, status, obs } = await request.json().catch(() => ({}));
  if (!notaId || ![null, "entregue", "nao_entregue"].includes(status ?? null)) {
    return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  }
  try {
    const { data, error } = await auth.supabase.from("rotas_salvas").select("entregas").eq("id", params.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ erro: "Rota não encontrada" }, { status: 404 });

    const entregas: Entregas = { ...(data.entregas ?? {}) };
    if (status) {
      entregas[notaId] = {
        status,
        em: new Date().toISOString(),
        por: auth.profile.full_name ?? auth.user.email ?? null,
        obs: obs ? String(obs).slice(0, 500) : null,
      };
    } else {
      delete entregas[notaId];
    }
    const { error: erroUpdate } = await auth.supabase.from("rotas_salvas").update({ entregas }).eq("id", params.id);
    if (erroUpdate) throw new Error(erroUpdate.message);
    return NextResponse.json({ entregas });
  } catch (err) {
    return respostaErro(err);
  }
}
