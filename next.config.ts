import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O painel precisa rodar em apresentacao sem internet: nada de assets remotos.
  images: { unoptimized: true },
};

export default nextConfig;
