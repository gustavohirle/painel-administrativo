import { Cabecalho } from "@/components/Cabecalho";
import { Cartao } from "@/components/Cartao";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";
import { TrocaDeSenha } from "@/components/TrocaDeSenha";

import { obterFonteDePedidos } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { mesDaTela } from "@/lib/mesDaTelaServidor";
import { mesesDisponiveis } from "@/lib/metrics";
import { exigirUsuario } from "@/lib/sessao";
import { areasDoPerfil, DESCRICAO_PERFIL, ROTULO_PERFIL } from "@/types/usuario";

export const dynamic = "force-dynamic";

/**
 * Minha conta.
 *
 * Unica tela do painel sem area: quem esta logado entra, inclusive a producao,
 * que nao enxerga o cadastro de usuarios. Trocar a propria senha nao pode
 * depender de pedir a alguem.
 */
export default async function PaginaConta({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const usuario = await exigirUsuario();
  const { mes: mesPedido } = await searchParams;

  const meses = mesesDisponiveis(await obterFonteDePedidos().listarPedidos());
  const mesSelecionado = await mesDaTela(meses, mesPedido);

  return (
    <div className="min-h-screen">
      <Cabecalho
        demonstracao={modoDemonstracao()}
        usuario={usuario}
        meses={meses}
        mesSelecionado={mesSelecionado}
      />

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-7 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-tinta xl:text-3xl">
            Minha conta
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            {usuario.nome}, entrando como <strong>{usuario.usuario}</strong>.
          </p>
        </div>

        <Cartao
          titulo="Sua função"
          descricao={`${ROTULO_PERFIL[usuario.perfil]} — ${DESCRICAO_PERFIL[usuario.perfil]}`}
        >
          <p className="text-sm text-tinta-media">
            Você enxerga: {areasDoPerfil(usuario.perfil).join(", ")}. Para mudar
            isso, fale com um administrador.
          </p>
        </Cartao>

        <Cartao
          titulo="Trocar a senha"
          descricao="Se você esqueceu a senha atual, um administrador redefine para você."
        >
          <TrocaDeSenha />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
