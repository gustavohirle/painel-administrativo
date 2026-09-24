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
 * 1. **So aparece com o mes ATUAL no cabecalho** (24/09/2026, pedido do dono).
 *    Ate entao ele ficava na tela olhando qualquer mes, com uma frase dizendo
 *    que "nao segue o mes escolhido" -- mas "hoje" olhando julho nao responde
 *    pergunta nenhuma. Nos outros meses fica so o grafico de vendas por dia.
 * 2. **O valor grande e o BRUTO do dia**, com o que ja foi pago ao lado. As
 *    duas coisas, porque no dia em que o pedido nasce quase nada esta pago
 *    ainda: boleto e pix levam horas. So o bruto exagera o dia; so o recebido
 *    faria parecer que ninguem comprou. A tese da secao 1 vale aqui tambem.
 * 3. **Nenhuma conta nova**: e `reconciliar` sobre os pedidos do dia, a mesma
 *    funcao da tela inicial.
 * 4. **A lista por marca repete as tres colunas de cima** -- vendas, valor e
 *    ja pago (23/09/2026, pedido do dono). Antes so trazia o valor vendido, e
 *    ali a pergunta e a mesma do topo: o dia ainda esta acontecendo e o que
 *    interessa e quanto ja entrou. Sem o pago por marca, so o total respondia
 *    isso -- e uma marca de boleto podia estar puxando o dia inteiro para
 *    baixo sem aparecer.
 */
export function VendasDeHoje({ pedidos, dia, marca, porMarca = false }: VendasDeHojeProps) {
  const r = reconciliar(pedidos);
  const houve = r.quantidade.total > 0;

  const linhas = porMarca
    ? [...new Set(pedidos.map((p) => p.marca))]
        .map((nome) => {
          const dela = reconciliar(pedidos.filter((p) => p.marca === nome));
          return {
            marca: nome,
            pedidos: dela.quantidade.total,
            valor: dela.bruto,
            pago: dela.recebido,
          };
        })
        .sort((a, b) => b.valor - a.valor)
    : [];

  return (
    <Cartao
      titulo={marca ? `Vendas de hoje — ${marca}` : "Vendas de hoje"}
      descricao={`Pedidos criados desde a meia-noite de ${dataCalendario(dia)}, no horário de Brasília.`}
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
        <div className="mt-5 border-t border-borda text-sm">
          {/*
            Cabecalho so na tela grande. No celular ele consumiria uma linha
            para tres rotulos que nao cabem alinhados -- la cada valor carrega o
            proprio rotulo, embaixo do nome da marca.
          */}
          <div className="hidden border-b border-borda py-2 text-xs font-semibold uppercase tracking-wider text-tinta-fraca sm:flex sm:items-baseline sm:gap-3">
            <span className="min-w-0 flex-1">Marca</span>
            <span className="w-20 shrink-0 text-right">Vendas</span>
            <span className="w-28 shrink-0 text-right">Valor</span>
            <span className="w-28 shrink-0 text-right">Já pago</span>
          </div>

          <ul className="divide-y divide-borda">
            {linhas.map((linha) => (
              <li key={linha.marca} className="py-2 sm:flex sm:items-baseline sm:gap-3">
                <span className="block min-w-0 truncate font-medium text-tinta sm:flex-1">
                  {linha.marca}
                </span>

                {/* Celular: os tres valores numa linha propria, cada um com o
                    seu rotulo, porque sem cabecalho eles nao se explicam. */}
                <span className="numerico mt-0.5 flex items-baseline gap-3 text-tinta-media sm:hidden">
                  <span>{inteiro(linha.pedidos)} venda(s)</span>
                  <span>{moedaRedonda(linha.valor)}</span>
                  <span className="font-semibold text-real">
                    {moedaRedonda(linha.pago)} pago
                  </span>
                </span>

                <span className="numerico hidden w-20 shrink-0 text-right text-tinta-media sm:block">
                  {inteiro(linha.pedidos)}
                </span>
                <span className="numerico hidden w-28 shrink-0 text-right text-tinta-media sm:block">
                  {moedaRedonda(linha.valor)}
                </span>
                {/* Verde, o mesmo do cartao "Ja pago hoje": as duas coisas sao
                    o mesmo numero, em escalas diferentes. */}
                <span className="numerico hidden w-28 shrink-0 text-right font-semibold text-real sm:block">
                  {moedaRedonda(linha.pago)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Cartao>
  );
}
