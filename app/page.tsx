import { redirect } from "next/navigation";
import { usuarioAtivo } from "@/lib/auth";
import { geocodificarTexto } from "@/lib/geocode";
import { LogoutButton } from "@/components/logout-button";
import { RotasApp } from "@/components/rotas-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { supabase, user, profile } = await usuarioAtivo();
  if (!user) redirect("/login");

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-marca-amarelo px-4">
        <div className="max-w-sm space-y-3 rounded-xl border border-marca-borda bg-white p-8 text-center">
          <h1 className="titulo text-3xl">Acesso não liberado</h1>
          <p className="text-sm text-slate-600">
            Seu usuário ainda não está ativo no CRM da TOCCA. Peça a liberação a um administrador.
          </p>
          <LogoutButton />
        </div>
      </main>
    );
  }

  const origemEndereco = (process.env.ORIGEM_ENDERECO ?? "").trim();
  const origemPonto = origemEndereco ? await geocodificarTexto(supabase, origemEndereco) : null;

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center justify-between bg-marca px-5 py-2.5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icone-tocca.png" alt="TOCCA" className="h-9 w-9 rounded-lg" />
          <p className="titulo text-2xl text-white">Rotas de entrega</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-white/80 sm:inline">{profile.full_name ?? user.email}</span>
          <div className="[&>button]:border-white/30 [&>button]:text-white [&>button:hover]:bg-white/10">
            <LogoutButton />
          </div>
        </div>
      </header>
      <RotasApp
        origemInicial={
          origemEndereco
            ? { endereco: origemEndereco, lat: origemPonto?.lat ?? null, lon: origemPonto?.lon ?? null }
            : null
        }
        tinyConfigurado={!!process.env.TINY_API_TOKEN}
      />
    </div>
  );
}
