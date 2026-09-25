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
  /**
   * Os canais que sincronizam por conta propria, fora da Nuvemshop -- hoje, o
   * TikTok Shop (secao 15). Vazio quando nenhum esta configurado. Cada um ganha
   * o seu selo ao lado do da Nuvemshop.
   */
  canais: CopiaDeCanal[];
}

/** De quando e a copia de um canal de marketplace. */
export interface CopiaDeCanal {
  /** "TikTok", como aparece no selo. */
  rotulo: string;
  /** A copia mais velha entre as contas do canal. `null` se nenhuma foi buscada. */
  atualizadoEm: string | null;
  /** Contas configuradas que ainda nao tem copia. */
  contasPendentes: string[];
  /**
   * Acima disto o selo fica vermelho. E do canal, e nao do selo, porque cada
   * canal tem o seu timer: o da Nuvemshop roda de 5 em 5 minutos, o do TikTok
   * de hora em hora.
   */
  atrasoQuePreocupaMs: number;
  /** A frase que diz de quanto em quanto tempo o servidor busca. */
  frequencia: string;
}
