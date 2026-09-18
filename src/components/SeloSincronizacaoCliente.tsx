"use client";

import { useEffect, useState } from "react";

import { dataHora, horaCurta } from "@/lib/format";
import type { SincronizacaoNaTela } from "@/types/sincronizacao";

/**
 * Acima disto o selo fica vermelho.
 *
 * No servidor a busca roda de 5 em 5 minutos (`painel-sincroniza.timer`, secao
 * 14) e o caminho da propria pagina tenta a cada 25. Meia hora sem copia nova
 * nao e demora: e o timer parado, a chave recusada ou a Nuvemshop fora do ar.
 */
const ATRASO_QUE_PREOCUPA_MS = 30 * 60 * 1000;

/** De quanto em quanto tempo o selo pergunta ao servidor. */
const INTERVALO_MS = 60 * 1000;

/**
 * O selo que se atualiza sozinho.
 *
 * A pagina e montada no servidor e nao se refaz: sem isto, a hora so mudava ao
 * trocar de aba ou recarregar. Recarregar a pagina inteira (`router.refresh`)
 * resolveria e custaria reler a base de 40 mil pedidos a cada minuto -- por
 * isso o que se consulta e um endereco proprio, que so olha a data do arquivo.
 *
 * `agora` comeca com o relogio DO SERVIDOR, passado como propriedade. Se
 * comecasse com `Date.now()` do navegador, o primeiro desenho poderia divergir
 * do que veio pronto do servidor -- os dois relogios nunca batem ao segundo --
 * e o React reclamaria da hidratacao. O relogio local so assume depois de
 * montado.
 *
 * Com a aba escondida nao adianta perguntar: o intervalo para, e a volta da
 * aba dispara uma consulta na hora. Era justamente nesse momento que o dono
 * percebia a hora velha.
 */
export function SeloSincronizacaoCliente({
  inicial,
  agoraDoServidor,
}: {
  inicial: SincronizacaoNaTela;
  agoraDoServidor: number;
}) {
  const [estado, setEstado] = useState(inicial);
  const [agora, setAgora] = useState(agoraDoServidor);

  useEffect(() => {
    let vivo = true;
    let temporizador: ReturnType<typeof setInterval> | undefined;

    async function consultar() {
      setAgora(Date.now());
      try {
        const resposta = await fetch("/api/sincronizacao", { cache: "no-store" });
        if (!resposta.ok) return;
        const novo = (await resposta.json()) as SincronizacaoNaTela | null;
        // Falha silenciosa: o selo fica com o ultimo estado conhecido em vez
        // de piscar um erro. Quem esta lendo o painel nao tem o que fazer com
        // "a consulta do selo falhou".
        if (vivo && novo) setEstado(novo);
      } catch {
        /* rede caiu, ou a aba esta sendo fechada */
      }
    }

    function ligar() {
      desligar();
      temporizador = setInterval(consultar, INTERVALO_MS);
    }
    function desligar() {
      if (temporizador) clearInterval(temporizador);
      temporizador = undefined;
    }
    function aoTrocarVisibilidade() {
      if (document.hidden) desligar();
      else {
        void consultar();
        ligar();
      }
    }

    void consultar();
    ligar();
    document.addEventListener("visibilitychange", aoTrocarVisibilidade);

    return () => {
      vivo = false;
      desligar();
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
    };
  }, []);

  const atraso = estado.atualizadoEm
    ? agora - new Date(estado.atualizadoEm).getTime()
    : null;
  const preocupa =
    estado.ultimoErro !== null ||
    estado.lojasPendentes.length > 0 ||
    atraso === null ||
    atraso > ATRASO_QUE_PREOCUPA_MS;

  const explicacao = [
    estado.atualizadoEm
      ? `Pedidos lidos da Nuvemshop em ${dataHora(estado.atualizadoEm)}.`
      : "Os pedidos ainda não foram buscados na Nuvemshop.",
    estado.sincronizando ? "Uma busca está acontecendo agora." : null,
    estado.lojasPendentes.length > 0
      ? `Ainda sem cópia: ${estado.lojasPendentes.join(", ")}.`
      : null,
    estado.ultimoErro ? `A última atualização falhou: ${estado.ultimoErro}` : null,
    preocupa && !estado.ultimoErro && !estado.sincronizando && atraso !== null
      ? "A cópia parou de ser atualizada: já passou de meia hora."
      : null,
    "O servidor busca novidades de 5 em 5 minutos, e este selo confere a cada minuto.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      title={explicacao}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold sm:gap-2 sm:px-3 sm:py-1.5 ${
        preocupa
          ? "border-alerta-borda bg-alerta-fundo text-naopago"
          : "border-borda bg-fundo text-tinta-media"
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${estado.sincronizando ? "animate-pulse" : ""}`}
        style={{ backgroundColor: preocupa ? "var(--color-naopago)" : "var(--color-real)" }}
      />
      {/* No celular sobra a hora: o rotulo tomaria a linha do botao de sair. */}
      <span className="hidden sm:inline">Nuvemshop</span>
      <span className="numerico">
        {estado.atualizadoEm ? horaCurta(estado.atualizadoEm, new Date(agora)) : "sem cópia"}
      </span>
    </span>
  );
}
