import { obterRepositorioCadastros } from "@/data";
import { respostaDoDocumento } from "@/lib/documento";
import { usuarioAtual } from "@/lib/sessao";
import { podeAcessar } from "@/types/usuario";

/**
 * Baixa o PDF assinado, para quem esta logado no painel.
 *
 * A permissao e conferida aqui, e nao so na tela que mostra o botao: um
 * manipulador de rota e endereco publico, exatamente como uma Server Action
 * (secao 5.13). Quem nao tem a area recebe 403 e nao um redirecionamento --
 * isto entrega um arquivo, nao uma pagina para navegar.
 */
export async function GET(
  _requisicao: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const usuario = await usuarioAtual();
  if (!usuario || !podeAcessar(usuario.perfil, "produtos")) {
    return new Response("Sem acesso a este documento.", { status: 403 });
  }

  const { id } = await params;
  const repositorio = await obterRepositorioCadastros();
  const ordem = await repositorio.buscarOrdemPorId(id);

  if (!ordem) return new Response("Ordem nao encontrada.", { status: 404 });
  return respostaDoDocumento(ordem);
}
