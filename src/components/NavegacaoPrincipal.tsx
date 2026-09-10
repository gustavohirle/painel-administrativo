"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/", rotulo: "Painel" },
  { href: "/custos", rotulo: "Custos de fabricacao" },
  { href: "/comissoes", rotulo: "Comissoes" },
] as const;

export function NavegacaoPrincipal() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {ITENS.map((item) => {
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
