import { obterRepositorioCadastros } from "@/data";
import { respostaDoDocumento } from "@/lib/documento";

/**
 * Baixa o PDF pelo TOKEN, sem login.
 *
 * Existe separada de `/ordens/[id]/pdf` de proposito. Poderiam ser uma rota so
 * com "aceita login OU token", mas duas regras de acesso no mesmo lugar sao
 * duas chances de a errada valer. Aqui a regra e uma: o token do link abre o
 * documento daquela ordem, e de nenhuma outra.
 *
 * Quem aprovou precisa disto: assinou pelo celular, sem conta no painel, e sai
 * da pagina com o documento na mao em vez de ter que pedir uma copia.
 */
export async function GET(
  _requisicao: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const repositorio = await obterRepositorioCadastros();
  const ordem = await repositorio.buscarOrdemPorToken(decodeURIComponent(token));

  if (!ordem) return new Response("Este link não vale mais.", { status: 404 });
  return respostaDoDocumento(ordem);
}
