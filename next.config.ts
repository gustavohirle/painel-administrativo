import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

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
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
