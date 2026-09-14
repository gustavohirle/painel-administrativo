import "server-only";

import type { OrdemFabricacao } from "@/types/ordemFabricacao";

/**
 * Serve os bytes do PDF guardado.
 *
 * Duas escolhas que valem o comentario:
 *
 * `inline`, nao `attachment`: no celular, `attachment` empurra o arquivo para
 * a pasta de downloads e a pessoa some da pagina para procura-lo. `inline`
 * abre no visualizador do proprio navegador, com o botao de salvar ali.
 *
 * Cache `immutable` com ETag do hash: o documento e congelado por definicao --
 * uma vez assinado, aqueles bytes nunca mudam. E o unico recurso do painel em
 * que isso e verdade, e por isso o unico com cache longo.
 */
export function respostaDoDocumento(ordem: OrdemFabricacao): Response {
  const documento = ordem.documento;

  if (!documento || documento.base64 === "") {
    return new Response("Esta ordem ainda nao tem documento assinado.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const bytes = Buffer.from(documento.base64, "base64");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.length),
      "content-disposition": `inline; filename="${ordem.numero}.pdf"`,
      etag: `"${documento.sha256}"`,
      "cache-control": "private, max-age=31536000, immutable",
      // Nao e para ninguem indexar um documento assinado.
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
