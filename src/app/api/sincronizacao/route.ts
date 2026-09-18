import { usuarioAtual } from "@/lib/sessao";
import { modoDemonstracao } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Situacao da copia dos pedidos, para o selo do cabecalho se atualizar sozinho.
 *
 * Existe porque a pagina e montada no servidor e nao se refaz: sem isto, a
 * hora da ultima sincronizacao so mudava quando alguem trocava de aba ou dava
 * F5 -- e o dono reparou. Recarregar a pagina inteira de minuto em minuto
 * custaria ler a base de 40 mil pedidos de novo; aqui sai um `stat` de arquivo.
 *
 * Um manipulador de rota e ENDERECO PUBLICO, como uma Server Action (secao
 * 5.13): a sessao e conferida aqui dentro. Quem nao esta logado leva 401 --
 * nao um redirecionamento, porque isto responde a um `fetch`, nao a uma
 * navegacao. E o que sai daqui diz de quando sao os numeros da empresa.
 */
export async function GET() {
  const usuario = await usuarioAtual();
  if (!usuario) return new Response("Sem sessao.", { status: 401 });

  // Em demonstracao nao ha copia nenhuma, e o cache nunca e carregado.
  if (modoDemonstracao()) return Response.json(null);

  const { estadoDaSincronizacao } = await import("@/data/cachePedidos");
  const estado = await estadoDaSincronizacao();

  return Response.json(estado, { headers: { "Cache-Control": "no-store" } });
}
