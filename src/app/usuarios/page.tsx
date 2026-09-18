import { Cabecalho } from "@/components/Cabecalho";
import { Cartao } from "@/components/Cartao";
import { GestaoUsuarios, type UsuarioNaTela } from "@/components/GestaoUsuarios";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { mesDaTela } from "@/lib/mesDaTelaServidor";
import { mesesDisponiveis } from "@/lib/metrics";
import { exigirArea } from "@/lib/sessao";
import { ordenarUsuarios } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/**
 * Cadastro de usuarios. Area `usuarios`: so o administrador.
 *
 * A lista vem SEM hash e sem sal -- `UsuarioNaTela` existe para isso. Passar o
 * registro inteiro para um componente publicaria o hash da senha no HTML da
 * pagina, que e o acidente classico deste tipo de tela.
 */
export default async function PaginaUsuarios({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const usuario = await exigirArea("usuarios");
  const { mes: mesPedido } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();
  const [pedidos, cadastrados] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarUsuarios(),
  ]);

  const meses = mesesDisponiveis(pedidos);
  const mesSelecionado = await mesDaTela(meses, mesPedido);

  const usuarios: UsuarioNaTela[] = ordenarUsuarios(cadastrados).map((u) => ({
    id: u.id,
    nome: u.nome,
    usuario: u.usuario,
    perfil: u.perfil,
    ativo: u.ativo,
    criadoEm: u.criadoEm,
    atualizadoEm: u.atualizadoEm,
  }));

  const administradores = usuarios.filter((u) => u.perfil === "dono" && u.ativo).length;

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
            Usuários
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            Quem entra no painel e o que cada um enxerga. {usuarios.length} pessoa(s)
            cadastrada(s), {administradores} com acesso de administrador.
          </p>
        </div>

        <Cartao
          titulo="Pessoas com acesso"
          descricao="A função decide as telas. Trocar a senha de alguém não derruba a sessão aberta dele."
        >
          <GestaoUsuarios usuarios={usuarios} idDeQuemVe={usuario.id} />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
