import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Mesmo critério do CRM: usuário logado, com empresa e perfil ativo.
export async function usuarioAtivo() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, organization_id, status")
    .eq("id", user.id)
    .single();

  const ativo = !!profile?.organization_id && profile.status !== "pendente";
  return { supabase, user, profile: ativo ? profile : null };
}

// Para Route Handlers: devolve o cliente Supabase do usuário ou uma resposta 401/403.
export async function exigirUsuario() {
  const { supabase, user, profile } = await usuarioAtivo();
  if (!user) return { erro: NextResponse.json({ erro: "Faça login novamente" }, { status: 401 }) };
  if (!profile) return { erro: NextResponse.json({ erro: "Acesso não liberado" }, { status: 403 }) };
  return { supabase };
}

export function respostaErro(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(err);
  return NextResponse.json({ erro: msg }, { status: 502 });
}
