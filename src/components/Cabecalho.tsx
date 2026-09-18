import Link from "next/link";

import { sair } from "@/app/entrar/actions";
import { SeletorMes } from "@/components/SeletorMes";
import { NavegacaoPrincipal } from "@/components/NavegacaoPrincipal";
import {
  areasDoPerfil,
  ROTA_INICIAL,
  ROTULO_PERFIL,
  type UsuarioPublico,
} from "@/types/usuario";

interface CabecalhoProps {
  demonstracao: boolean;
  usuario: UsuarioPublico;
  meses?: string[];
  mesSelecionado?: string;
}

/**
 * Barra superior fixa.
 *
 * O selo de demonstracao mora aqui: discreto, mas SEMPRE visivel. Deixar
 * duvida sobre a origem dos numeros seria pior do que nao mostrar nada.
 */
export function Cabecalho({
  demonstracao,
  usuario,
  meses,
  mesSelecionado,
}: CabecalhoProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-borda bg-superficie/95 backdrop-blur">
      {/*
        * Tres blocos num `flex-wrap`, nesta ordem: logo, faixa de abas, canto
        * do usuario. No celular a faixa se joga para a linha de baixo sozinha
        * (`order-last w-full`, dentro da propria NavegacaoPrincipal) e as duas
        * linhas ficam alinhadas pela mesma margem.
        *
        * O canto do usuario NAO quebra (`flex-nowrap`): antes ele era o
        * terceiro a disputar espaco com as abas na mesma linha, e o "Sair"
        * caia sozinho numa terceira fileira.
        */}
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:gap-x-5 sm:gap-y-3 sm:px-6 sm:py-3">
        <Link
          href={ROTA_INICIAL[usuario.perfil]}
          className="flex shrink-0 items-center gap-3"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tinta text-sm font-bold text-white">
            PA
          </span>
          <span className="hidden text-base font-semibold tracking-tight text-tinta sm:inline">
            Painel Administrativo
          </span>
        </Link>

        <NavegacaoPrincipal areas={areasDoPerfil(usuario.perfil)} />

        <div className="ml-auto flex min-w-0 shrink items-center gap-2 sm:gap-3">
          {meses && mesSelecionado && (
            <SeletorMes meses={meses} mesSelecionado={mesSelecionado} />
          )}
          {demonstracao && <SeloDemonstracao />}
          <MenuUsuario usuario={usuario} />
        </div>
      </div>
    </header>
  );
}

/** Duas iniciais do nome, para o avatar de celular. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

function MenuUsuario({ usuario }: { usuario: UsuarioPublico }) {
  return (
    <div className="flex items-center gap-2 border-l border-borda pl-2 sm:gap-3 sm:pl-3">
      <Link
        href="/conta"
        className="hidden rounded-lg px-2 py-1 text-right transition-colors hover:bg-fundo sm:block"
        title={`${usuario.nome} -- ${ROTULO_PERFIL[usuario.perfil]}. Abrir minha conta.`}
      >
        <p className="text-sm font-semibold leading-tight text-tinta">
          {usuario.nome}
        </p>
        <p className="text-xs leading-tight text-tinta-fraca">
          {ROTULO_PERFIL[usuario.perfil]} · minha conta
        </p>
      </Link>
      {/* No celular so as iniciais: o nome inteiro empurrava o Sair para outra linha. */}
      <Link
        href="/conta"
        title={`${usuario.nome} -- ${ROTULO_PERFIL[usuario.perfil]}. Abrir minha conta.`}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-fundo text-xs font-bold text-tinta-media sm:hidden"
      >
        {iniciais(usuario.nome)}
      </Link>
      <form action={sair}>
        <button
          type="submit"
          className="rounded-lg border border-borda-forte px-2.5 py-1 text-sm font-medium text-tinta-media transition-colors hover:text-tinta sm:px-3 sm:py-1.5"
        >
          Sair
        </button>
      </form>
    </div>
  );
}

/** Selo permanente. Nao remover sem que os dados sejam reais. */
export function SeloDemonstracao() {
  return (
    <span
      title="Os números desta tela são fictícios, gerados para demonstração. Nenhum dado real da loja foi utilizado."
      className="listrado-demo inline-flex items-center gap-1.5 rounded-full border border-alerta-borda bg-alerta-fundo px-2.5 py-1 text-xs font-semibold text-naopago sm:gap-2 sm:px-3 sm:py-1.5"
    >
      <span className="h-2 w-2 rounded-full bg-naopago" />
      <span className="sm:hidden">Demonstração</span>
      <span className="hidden sm:inline">Dados de demonstração</span>
    </span>
  );
}
