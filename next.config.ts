import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Nao anunciar a versao do framework na resposta.
  poweredByHeader: false,

  // O painel precisa rodar em apresentacao sem internet: nada de assets remotos.
  images: { unoptimized: true },

  /*
   * Diretorios de saida separados para desenvolvimento e producao.
   *
   * Os dois formatos de build sao incompativeis. Rodar `npm run build` com o
   * `npm run dev` ligado sobrescrevia a pasta compartilhada e o servidor de
   * desenvolvimento passava a responder 500 com "Cannot find module
   * './833.js'" -- erro que nao aponta para a causa e custa tempo.
   *
   * `next dev` avalia este arquivo com NODE_ENV=development; `next build` e
   * `next start`, com production. Cada um fica com a sua pasta.
   */
  /*
   * A aba "Comissoes" virou "Influencers" e mudou de endereco. Favorito, link
   * salvo e historico do navegador continuam chegando; os parametros (?mes=)
   * passam junto.
   */
  async redirects() {
    return [{ source: "/comissoes", destination: "/influencers", permanent: false }];
  },

  /*
   * PAINEL_DIST_DIR permite montar um build novo em outra pasta enquanto o
   * servidor de producao continua no ar lendo `.next` (mesmo problema acima,
   * entre dois builds de producao).
   */
  distDir:
    process.env.PAINEL_DIST_DIR ||
    (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
};

export default nextConfig;
