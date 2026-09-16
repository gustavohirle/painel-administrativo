"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { Area } from "@/types/usuario";

const ITENS: Array<{ href: string; rotulo: string; area: Area }> = [
  { href: "/", rotulo: "Painel", area: "financeiro" },
  { href: "/custos", rotulo: "Custos", area: "custos" },
  { href: "/influencers", rotulo: "Influencers", area: "financeiro" },
  { href: "/relatorios", rotulo: "Relatórios", area: "financeiro" },
  { href: "/simulador", rotulo: "Simulador", area: "financeiro" },
  { href: "/impostos", rotulo: "Impostos", area: "fiscal" },
  { href: "/difal", rotulo: "DIFAL", area: "fiscal" },
  { href: "/produtos", rotulo: "Produtos", area: "produtos" },
  { href: "/kits", rotulo: "Kits", area: "produtos" },
  { href: "/ordens", rotulo: "Ordens", area: "produtos" },
  { href: "/estoque", rotulo: "Estoque", area: "estoque" },
];

/**
 * Menu filtrado pelas areas do perfil.
 *
 * Esconder o link e conveniencia, NAO seguranca -- quem digitar a URL e barrado
 * no servidor por `exigirArea`. As duas coisas existem porque um link que leva
 * a um redirecionamento e uma promessa quebrada.
 *
 * No celular a faixa ROLA de lado, em vez de quebrar em varias linhas.
 *
 * Ate aqui as abas dividiam a linha do cabecalho com o logo e o menu do
 * usuario, num `flex-wrap` unico: com nove itens, elas quebravam no meio da
 * lista e a segunda fileira comecava embaixo do logo, desalinhada de tudo. O
 * problema nao era o espaco -- era a barra tentar ser uma linha so quando nao
 * cabe em uma. Agora a faixa ocupa a largura inteira, numa linha propria
 * abaixo do logo, e rola.
 *
 * Rolar tem um custo: as ultimas abas nascem fora da tela. Dai o ajuste no
 * `useEffect` -- a aba ativa e trazida para o campo de visao, senao quem esta
 * em "Estoque" abre o painel e nao ve nenhuma marca de onde esta.
 */
export function NavegacaoPrincipal({ areas }: { areas: Area[] }) {
  const pathname = usePathname();
  /*
   * Aba clicada, marcada ANTES de a tela nova chegar. A pagina e montada no
   * servidor e leva algumas centenas de milissegundos; sem isto a aba antiga
   * continuava acesa nesse intervalo e o clique parecia nao ter pegado.
   */
  const [destino, setDestino] = useState<string | null>(null);
  useEffect(() => setDestino(null), [pathname]);
  const rotaMarcada = destino ?? pathname;
  const faixa = useRef<HTMLElement>(null);
  const ativoRef = useRef<HTMLAnchorElement>(null);

  const visiveis = ITENS.filter((item) => areas.includes(item.area));

  useEffect(() => {
    const caixa = faixa.current;
    const aba = ativoRef.current;
    if (!caixa || !aba) return;

    /*
     * `scrollLeft` na mao, e nao `scrollIntoView`.
     *
     * `scrollIntoView` sobe pela arvore e rola a PAGINA junto -- num cabecalho
     * grudado no topo, isso empurra o conteudo para baixo assim que a tela
     * carrega. Aqui so a faixa se move.
     */
    const alvo = aba.offsetLeft - (caixa.clientWidth - aba.offsetWidth) / 2;
    caixa.scrollLeft = Math.max(0, alvo);
  }, [pathname]);

  return (
    <nav
      ref={faixa}
      aria-label="Seções do painel"
      className="faixa-de-abas -mx-1 order-last w-full overflow-x-auto px-1 sm:order-none sm:mx-0 sm:w-auto sm:px-0"
    >
      <div className="flex w-max items-center gap-1 sm:w-auto sm:flex-wrap">
        {visiveis.map((item) => {
          const ativo =
            item.href === "/" ? rotaMarcada === "/" : rotaMarcada.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              ref={ativo ? ativoRef : undefined}
              onClick={() => {
                if (item.href !== pathname) setDestino(item.href);
              }}
              aria-current={ativo ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors sm:px-3 sm:text-sm ${
                ativo
                  ? "bg-tinta text-white"
                  : "text-tinta-media hover:bg-fundo hover:text-tinta"
              }`}
            >
              {item.rotulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
