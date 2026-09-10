import { inteiro, moedaRedonda, percentual } from "@/lib/format";
import type { SinaisAdicionais as Sinais } from "@/lib/metrics";

/*
 * Rodape discreto, tres numeros sem grafico.
 *
 * Existem para abrir a conversa sobre as proximas fases (recuperacao de
 * carrinho e recompra). Nao sao para desenvolver agora -- por isso ficam
 * pequenos e sem destaque visual.
 */
export function SinaisAdicionais({ sinais }: { sinais: Sinais }) {
  const itens = [
    {
      rotulo: "Carrinhos abandonados no mes",
      valor: inteiro(sinais.carrinhosAbandonados),
      apoio: `${moedaRedonda(sinais.valorCarrinhosAbandonados)} em produtos que ficaram no carrinho`,
    },
    {
      rotulo: "Clientes que compraram mais de uma vez",
      valor: percentual(sinais.taxaRecompra),
      apoio: "Sobre os clientes com pedido pago nos 6 meses",
    },
    {
      rotulo: "Intervalo medio entre compras",
      valor: `${Math.round(sinais.cicloMedioRecompraDias)} dias`,
      apoio: "De um pedido pago ao seguinte, do mesmo cliente, nos 6 meses",
    },
  ];

  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {itens.map((item) => (
        <div key={item.rotulo}>
          <p className="text-xs font-medium uppercase tracking-wider text-tinta-fraca">
            {item.rotulo}
          </p>
          <p className="numerico mt-1 text-2xl font-semibold text-tinta">
            {item.valor}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-tinta-fraca">
            {item.apoio}
          </p>
        </div>
      ))}
    </div>
  );
}
