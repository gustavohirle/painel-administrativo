/**
 * Situacao da copia dos pedidos, na forma que a TELA usa.
 *
 * Mora aqui, e nao em `data/cachePedidos.ts`, porque o selo do cabecalho e
 * componente de navegador: importar o tipo de la traria o modulo do cache
 * junto, e com ele o `node:fs`. E a mesma armadilha do
 * `TAMANHO_MINIMO_SENHA` (secao 5.13.2).
 */
export interface SincronizacaoNaTela {
  /** Copia mais velha entre as lojas ja buscadas. `null` enquanto nao houve busca. */
  atualizadoEm: string | null;
  /** Lojas configuradas que ainda nao tem copia. */
  lojasPendentes: string[];
  sincronizando: boolean;
  ultimoErro: string | null;
}
