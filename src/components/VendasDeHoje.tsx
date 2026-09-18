import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { dataCalendario, inteiro, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import { reconciliar } from "@/lib/metrics";
import type { Pedido } from "@/types/nuvemshop";

interface VendasDeHojeProps {
  /** Pedidos criados HOJE, ja filtrados por `filtrarPorDia`. */
  pedidos: Pedido[];
  /** Chave "2026-09-18", so para escrever a data na tela. */
  dia: string;
  /** Nome do que esta sendo somado; ausente = a operacao inteira. */
  marca?: string | null;
  /** Uma linha por marca abaixo dos numeros. So faz sentido na visao geral. */
  porMarca?: boolean;
}

/**
 * Vendas de hoje, do zero da meia-noite.
 *
 * Pedido do cliente: numero de vendas e soma do valor "comecando a meia-noite",
 * e nao das ultimas 24 horas -- ele acompanha o dia enquanto ele acontece, e
 * uma janela movel misturaria a noite de ontem com a manha de hoje.
 *
 * Tres decisoes:
 *
 * 1. **Nao segue o mes do cabecalho.** Hoje e hoje mesmo olhando julho. A
 *    descricao diz isso, senao o quadro pareceria contradizer a tela.
 * 2. **O valor grande e o BRUTO do dia**, com o que ja foi pago ao lado. As
 *    duas coisas, porque no dia em que o pedido nasce quase nada esta pago
 *    ainda: boleto e pix levam horas. So o bruto exagera o dia; so o recebido
 *    faria parecer que ninguem comprou. A tese da secao 1 vale aqui tambem.
 * 3. **Nenhuma conta nova**: e `reconciliar` sobre os pedidos do dia, a mesma
 *    funcao da tela inicial.
 */
export function VendasDeHoje({ pedidos, dia, marca, porMarca = false }: VendasDeHojeProps) {
  const r = reconciliar(pedidos);
  const houve = r.quantidade.total > 0;

  const linhas = porMarca
    ? [...new Set(pedidos.map((p) => p.marca))]
        .map((nome) => {
          const dela = reconciliar(pedidos.filter((p) => p.marca === nome));
          return { marca: nome, pedidos: dela.quantidade.total, valor: dela.bruto };
        })
        .sort((a, b) => b.valor - a.valor)
    : [];

  return (
    <Cartao
      titulo={marca ? `Vendas de hoje — ${marca}` : "Vendas de hoje"}
      descricao={`Pedidos criados desde a meia-noite de ${dataCalendario(dia)}, no horário de Brasília. Este quadro não segue o mês escolhido no topo.`}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <NumeroDestaque
          rotulo="Vendas hoje"
          valor={inteiro(r.quantidade.total)}
          apoio={
            houve
              ? `${inteiro(r.quantidade.recebido)} já paga(s)`
              : "Nenhum pedido ainda hoje"
          }
        />
        <NumeroDestaque
          rotulo="Valor de hoje"
          valor={moedaRedonda(r.bruto)}
          apoio="Tudo que foi vendido hoje, pago ou não"
        />
        <NumeroDestaque
          rotulo="Já pago hoje"
          valor={moedaRedonda(r.recebido)}
          apoio={
            houve
              ? `${percentual(razaoSegura(r.recebido, r.bruto))} do valor de hoje; o resto ainda pode entrar`
              : "—"
          }
          cor="var(--color-real)"
        />
      </div>

      {linhas.length > 1 && (
        <ul className="mt-5 divide-y divide-borda border-t border-borda text-sm">
          {linhas.map((linha) => (
            <li key={linha.marca} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0 truncate font-medium text-tinta">{linha.marca}</span>
              <span className="numerico shrink-0 text-tinta-media">
                {inteiro(linha.pedidos)} venda(s) · {moedaRedonda(linha.valor)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
