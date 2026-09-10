import { redirect } from "next/navigation";

import { FormularioLogin } from "@/components/FormularioLogin";
import { SeloDemonstracao } from "@/components/Cabecalho";
import { CREDENCIAIS_DEMO } from "@/data/seeds";
import { modoDemonstracao } from "@/lib/config";
import { usuarioAtual } from "@/lib/sessao";
import { DESCRICAO_PERFIL, ROTA_INICIAL, ROTULO_PERFIL } from "@/types/usuario";

export const dynamic = "force-dynamic";

export default async function PaginaEntrar() {
  // Ja autenticado nao ve tela de login: vai direto para a propria area.
  const usuario = await usuarioAtual();
  if (usuario) redirect(ROTA_INICIAL[usuario.perfil]);

  const demo = modoDemonstracao();

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-start gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tinta text-base font-bold text-white">
            PA
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-tinta">
              Painel Administrativo
            </h1>
            <p className="mt-1 text-sm text-tinta-media">
              Entre para ver o resultado da operacao.
            </p>
          </div>
          {demo && <SeloDemonstracao />}
        </div>

        <FormularioLogin
          credenciais={
            demo
              ? CREDENCIAIS_DEMO.map((c) => ({
                  usuario: c.usuario,
                  senha: c.senha,
                  rotulo: ROTULO_PERFIL[c.perfil],
                  descricao: DESCRICAO_PERFIL[c.perfil],
                }))
              : []
          }
        />
      </div>
    </div>
  );
}
