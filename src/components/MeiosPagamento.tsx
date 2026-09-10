import { inteiro, moeda, percentual, rotuloMetodo } from "@/lib/format";
import type { LinhaMetodoPagamento } from "@/lib/metrics";

/*
 * De onde vem o vazamento.
 *
 * Boleto tem taxa de abandono altissima no Brasil: o pedido entra no
 * faturamento no instante em que o boleto e emitido, e muitas vezes nunca e
 * pago. Esta tabela explica boa parte da distancia entre bruto e recebido.
 */
export function MeiosPagamento({ linhas }: { linhas: LinhaMetodoPagamento[] }) {
  const piorTaxa = Math.max(...linhas.map((l) => l.taxaNaoPagamento), 0.01);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
            <th className="py-2.5 pr-4 font-semibold">Meio de pagamento</th>
            <th className="py-2.5 pr-4 text-right font-semibold">Pedidos</th>
            <th className="py-2.5 pr-4 text-right font-semibold">Participacao</th>
            <th className="py-2.5 pr-4 text-right font-semibold">Bruto</th>
            <th className="py-2.5 pr-4 text-right font-semibold">Recebido</th>
            <th className="py-2.5 font-semibold">Nao pago</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.metodo} className="border-b border-borda">
              <td className="py-3 pr-4 font-semibold text-tinta">
                {rotuloMetodo(l.metodo)}
              </td>
              <td className="numerico py-3 pr-4 text-right text-tinta-media">
                {inteiro(l.quantidadePedidos)}
              </td>
              <td className="numerico py-3 pr-4 text-right text-tinta-media">
                {percentual(l.participacao)}
              </td>
              <td className="numerico py-3 pr-4 text-right text-tinta-media">
                {moeda(l.bruto)}
              </td>
              <td className="numerico py-3 pr-4 text-right font-semibold text-real">
                {moeda(l.recebido)}
              </td>
              <td className="py-3">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-full max-w-[180px] overflow-hidden rounded-full bg-fundo">
                    <div
                      className="h-full rounded-full bg-naopago"
                      style={{
                        width: `${Math.min(100, (l.taxaNaoPagamento / piorTaxa) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="numerico w-14 text-right text-sm font-semibold text-naopago">
                    {percentual(l.taxaNaoPagamento)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
