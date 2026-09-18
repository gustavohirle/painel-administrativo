import { dataHora, horaCurta } from "@/lib/format";

/**
 * Acima disto o selo fica vermelho.
 *
 * No servidor a busca roda de 5 em 5 minutos (`painel-sincroniza.timer`, secao
 * 14) e o caminho da propria pagina tenta a cada 25. Meia hora sem copia nova
 * nao e demora: e o timer parado, a chave recusada ou a Nuvemshop fora do ar.
 */
const ATRASO_QUE_PREOCUPA_MS = 30 * 60 * 1000;

/**
 * Hora da ultima sincronizacao com a Nuvemshop, no cabecalho.
 *
 * Ocupa o MESMO lugar do selo de demonstracao, e o par nao e coincidencia: os
 * dois respondem "de onde vem o numero que estou lendo". Em demonstracao, que
 * ele e ficticio; em producao, de quando ele e. Antes essa informacao existia
 * so no rodape, depois da tela inteira -- longe demais de quem abre o painel
 * para conferir se a venda de agora ha pouco ja entrou.
 *
 * A hora e ABSOLUTA ("13:46"), nunca "ha 4 minutos". A pagina e montada no
 * servidor e nao se atualiza sozinha: um "ha 4 minutos" deixado aberto na tela
 * continuaria dizendo 4 minutos duas horas depois. A hora cheia envelhece
 * sozinha, a vista de quem le.
 */
export async function SeloSincronizacao() {
  // Import dinamico, como no rodape: o modo demonstracao nunca carrega o cache.
  const { estadoDaSincronizacao } = await import("@/data/cachePedidos");
  const estado = await estadoDaSincronizacao();

  const atraso = estado.atualizadoEm
    ? Date.now() - new Date(estado.atualizadoEm).getTime()
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
    // Sem esta frase, o selo vermelho obriga a pessoa a fazer a conta da hora
    // de cabeca para descobrir por que ele esta vermelho.
    preocupa && !estado.ultimoErro && !estado.sincronizando && atraso !== null
      ? "A cópia parou de ser atualizada: já passou de meia hora."
      : null,
    "O servidor busca novidades de 5 em 5 minutos.",
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
        className={`h-2 w-2 shrink-0 rounded-full ${
          estado.sincronizando ? "animate-pulse" : ""
        }`}
        style={{ backgroundColor: preocupa ? "var(--color-naopago)" : "var(--color-real)" }}
      />
      {/* No celular sobra a hora: o rotulo tomaria a linha do botao de sair. */}
      <span className="hidden sm:inline">Nuvemshop</span>
      <span className="numerico">
        {estado.atualizadoEm ? horaCurta(estado.atualizadoEm) : "sem cópia"}
      </span>
    </span>
  );
}
