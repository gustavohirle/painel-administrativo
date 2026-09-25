import { Cartao } from "@/components/Cartao";
import { NumerosDoDia } from "@/components/NumerosDoDia";
import { dataCalendario } from "@/lib/format";
import { resumirDia } from "@/lib/metrics";
import type { Pedido } from "@/types/nuvemshop";

interface VendasDeHojeProps {
  /** Pedidos criados HOJE, ja filtrados por `filtrarPorDia`. */
  pedidos: Pedido[];
  /** Chave "2026-09-18". */
  dia: string;
  /** Nome do que esta sendo somado; ausente = a operacao inteira. */
  marca?: string | null;
}

/**
 * Vendas de hoje, do zero da meia-noite.
 *
 * Pedido do cliente: numero de vendas e soma do valor "comecando a meia-noite",
 * e nao das ultimas 24 horas -- ele acompanha o dia enquanto ele acontece, e
 * uma janela movel misturaria a noite de ontem com a manha de hoje.
 *
 * Quatro decisoes:
 *
 * 1. **So aparece com o mes ATUAL no cabecalho** (24/09/2026, pedido do dono).
 *    Ate entao ele ficava na tela olhando qualquer mes, com uma frase dizendo
 *    que "nao segue o mes escolhido" -- mas "hoje" olhando julho nao responde
 *    pergunta nenhuma. Nos outros meses fica so o grafico de vendas por dia.
 * 2. **O valor grande e o BRUTO do dia**, com o que ja foi pago ao lado. As
 *    duas coisas, porque no dia em que o pedido nasce quase nada esta pago
 *    ainda: boleto e pix levam horas. So o bruto exagera o dia; so o recebido
 *    faria parecer que ninguem comprou. A tese da secao 1 vale aqui tambem.
 * 3. **Nenhuma conta nova**: e `resumirDia`, que e `reconciliar` sobre os
 *    pedidos do dia -- a mesma funcao da tela inicial, e a mesma que monta o
 *    quadro do dia clicado no grafico logo abaixo.
 * 4. **A lista por marca repete as tres colunas de cima** -- vendas, valor e
 *    ja pago (23/09/2026, pedido do dono). Sem o pago por marca, so o total
 *    dizia quanto ja entrou, e uma marca de boleto podia estar puxando o dia
 *    inteiro para baixo sem aparecer.
 */
export function VendasDeHoje({ pedidos, dia, marca }: VendasDeHojeProps) {
  return (
    <Cartao
      titulo={marca ? `Vendas de hoje — ${marca}` : "Vendas de hoje"}
      descricao={`Pedidos criados desde a meia-noite de ${dataCalendario(dia)}, no horário de Brasília.`}
    >
      <NumerosDoDia resumo={resumirDia(dia, pedidos)} hoje />
    </Cartao>
  );
}
