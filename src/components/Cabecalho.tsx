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
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-3 px-6 py-3">
        <Link href={ROTA_INICIAL[usuario.perfil]} className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tinta text-sm font-bold text-white">
            PA
          </span>
          <span className="hidden text-base font-semibold tracking-tight text-tinta sm:inline">
            Painel Administrativo
          </span>
        </Link>

        <NavegacaoPrincipal areas={areasDoPerfil(usuario.perfil)} />

        <div className="ml-auto flex flex-wrap items-center gap-3">
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

function MenuUsuario({ usuario }: { usuario: UsuarioPublico }) {
  return (
    <div className="flex items-center gap-3 border-l border-borda pl-3">
      <div className="text-right">
        <p className="text-sm font-semibold leading-tight text-tinta">
          {usuario.nome}
        </p>
        <p className="text-xs leading-tight text-tinta-fraca">
          {ROTULO_PERFIL[usuario.perfil]}
        </p>
      </div>
      <form action={sair}>
        <button
          type="submit"
          className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta-media transition-colors hover:text-tinta"
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
      title="Os numeros desta tela sao ficticios, gerados para demonstracao. Nenhum dado real da loja foi utilizado."
      className="listrado-demo inline-flex items-center gap-2 rounded-full border border-alerta-borda bg-alerta-fundo px-3 py-1.5 text-xs font-semibold text-naopago"
    >
      <span className="h-2 w-2 rounded-full bg-naopago" />
      Dados de demonstracao
    </span>
  );
}
