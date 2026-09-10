"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Area } from "@/types/usuario";

const ITENS: Array<{ href: string; rotulo: string; area: Area }> = [
  { href: "/", rotulo: "Painel", area: "financeiro" },
  { href: "/custos", rotulo: "Custos", area: "custos" },
  { href: "/comissoes", rotulo: "Comissoes", area: "financeiro" },
  { href: "/impostos", rotulo: "Impostos", area: "fiscal" },
  { href: "/produtos", rotulo: "Produtos", area: "produtos" },
  { href: "/estoque", rotulo: "Estoque", area: "estoque" },
];

/**
 * Menu filtrado pelas areas do perfil.
 *
 * Esconder o link e conveniencia, NAO seguranca -- quem digitar a URL e barrado
 * no servidor por `exigirArea`. As duas coisas existem porque um link que leva
 * a um redirecionamento e uma promessa quebrada.
 */
export function NavegacaoPrincipal({ areas }: { areas: Area[] }) {
  const pathname = usePathname();
  const visiveis = ITENS.filter((item) => areas.includes(item.area));

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {visiveis.map((item) => {
        const ativo =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              ativo
                ? "bg-tinta text-white"
                : "text-tinta-media hover:bg-fundo hover:text-tinta"
            }`}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
