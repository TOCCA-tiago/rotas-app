import { notFound, redirect } from "next/navigation";
import { usuarioAtivo } from "@/lib/auth";
import { Motorista } from "@/components/motorista";
import type { RotaSalva } from "@/lib/rotas-salvas";

export const dynamic = "force-dynamic";

export const metadata = { title: "Modo motorista · TOCCA Rotas" };

export default async function MotoristaPage({ params }: { params: { id: string } }) {
  const { supabase, user, profile } = await usuarioAtivo();
  if (!user) redirect(`/login?next=/motorista/${params.id}`);
  if (!profile) redirect("/");

  const { data } = await supabase.from("rotas_salvas").select("*").eq("id", params.id).maybeSingle();
  if (!data) notFound();
  return <Motorista rota={data as RotaSalva} />;
}
