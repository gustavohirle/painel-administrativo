/**
 * Implementacao de `FonteDePedidos` sobre o gerador de dados ficticios.
 *
 * E assincrona de proposito, mesmo sem I/O: assim a assinatura e identica a
 * da fonte real e nenhum componente precisa mudar quando a troca acontecer.
 */

import type { CarrinhoAbandonado, Pedido } from "@/types/nuvemshop";
import { baseDemonstracao } from "@/data/geradorPedidos";
import { dentroDoPeriodo, type FonteDePedidos, type Periodo } from "@/data/source";

export class FonteDemonstracao implements FonteDePedidos {
  readonly tipo = "demo" as const;

  async listarPedidos(periodo?: Periodo): Promise<Pedido[]> {
    const { pedidos } = baseDemonstracao();
    if (!periodo) return pedidos;
    return pedidos.filter((p) => dentroDoPeriodo(p.created_at, periodo));
  }

  async listarCarrinhosAbandonados(
    periodo?: Periodo,
  ): Promise<CarrinhoAbandonado[]> {
    const { carrinhos } = baseDemonstracao();
    if (!periodo) return carrinhos;
    return carrinhos.filter((c) => dentroDoPeriodo(c.created_at, periodo));
  }
}
