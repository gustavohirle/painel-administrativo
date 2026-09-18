import { SeloSincronizacaoCliente } from "@/components/SeloSincronizacaoCliente";

/**
 * Hora da ultima sincronizacao com a Nuvemshop, no cabecalho.
 *
 * Ocupa o MESMO lugar do selo de demonstracao, e o par nao e coincidencia: os
 * dois respondem "de onde vem o numero que estou lendo". Em demonstracao, que
 * ele e ficticio; em producao, de quando ele e. Antes essa informacao existia
 * so no rodape, depois da tela inteira -- longe demais de quem abre o painel
 * para conferir se a venda de agora ha pouco ja entrou.
 *
 * A hora e ABSOLUTA ("13:46"), nunca "ha 4 minutos": e hora de relogio, que a
 * pessoa compara com o proprio, e nao um numero que envelhece em silencio.
 *
 * Este componente so busca o estado INICIAL, para a pagina ja chegar com a
 * hora certa. Quem a mantem viva e `SeloSincronizacaoCliente`, que pergunta de
 * minuto em minuto -- ate 18/09/2026 a hora so mudava ao trocar de aba ou
 * recarregar, e o dono reparou.
 */
export async function SeloSincronizacao() {
  // Import dinamico, como no rodape: o modo demonstracao nunca carrega o cache.
  const { estadoDaSincronizacao } = await import("@/data/cachePedidos");
  const estado = await estadoDaSincronizacao();

  return <SeloSincronizacaoCliente inicial={estado} agoraDoServidor={Date.now()} />;
}
