/**
 * Estados brasileiros, regiao e aliquota interna de ICMS.
 *
 * AVISO QUE VALE PARA O ARQUIVO INTEIRO: as aliquotas semeadas sao PONTO DE
 * PARTIDA, nao apuracao. Varios estados mexeram nas suas entre 2023 e 2025, e
 * algumas ja incluem fundo de combate a pobreza enquanto outras nao. Toda
 * aliquota nasce com `confirmadoPeloContador: false` e e editavel na tela --
 * o painel nunca apresenta numero fiscal como definitivo.
 */

export type UF =
  | "AC" | "AL" | "AM" | "AP" | "BA" | "CE" | "DF" | "ES" | "GO"
  | "MA" | "MG" | "MS" | "MT" | "PA" | "PB" | "PE" | "PI" | "PR"
  | "RJ" | "RN" | "RO" | "RR" | "RS" | "SC" | "SE" | "SP" | "TO";

export type Regiao = "norte" | "nordeste" | "centro-oeste" | "sudeste" | "sul";

export interface EstadoBrasileiro {
  uf: UF;
  nome: string;
  regiao: Regiao;
  /**
   * Aliquota interna modal de ICMS, em percentual.
   *
   * Onde o estado cobra fundo de combate a pobreza sobre a operacao, o valor
   * ja vem somado -- e por isso alguns aparecem com casa decimal.
   */
  aliquotaInterna: number;
}

/**
 * Tabela base. Ordem alfabetica por UF.
 *
 * Serve para semear o cadastro editavel; depois de semeado, quem manda e o
 * cadastro. Trocar um valor aqui nao muda um banco ja populado.
 */
export const ESTADOS: EstadoBrasileiro[] = [
  { uf: "AC", nome: "Acre", regiao: "norte", aliquotaInterna: 19 },
  { uf: "AL", nome: "Alagoas", regiao: "nordeste", aliquotaInterna: 20 },
  { uf: "AM", nome: "Amazonas", regiao: "norte", aliquotaInterna: 20 },
  { uf: "AP", nome: "Amapa", regiao: "norte", aliquotaInterna: 18 },
  { uf: "BA", nome: "Bahia", regiao: "nordeste", aliquotaInterna: 20.5 },
  { uf: "CE", nome: "Ceara", regiao: "nordeste", aliquotaInterna: 20 },
  { uf: "DF", nome: "Distrito Federal", regiao: "centro-oeste", aliquotaInterna: 20 },
  { uf: "ES", nome: "Espirito Santo", regiao: "sudeste", aliquotaInterna: 17 },
  { uf: "GO", nome: "Goias", regiao: "centro-oeste", aliquotaInterna: 19 },
  { uf: "MA", nome: "Maranhao", regiao: "nordeste", aliquotaInterna: 23 },
  { uf: "MG", nome: "Minas Gerais", regiao: "sudeste", aliquotaInterna: 18 },
  { uf: "MS", nome: "Mato Grosso do Sul", regiao: "centro-oeste", aliquotaInterna: 17 },
  { uf: "MT", nome: "Mato Grosso", regiao: "centro-oeste", aliquotaInterna: 17 },
  { uf: "PA", nome: "Para", regiao: "norte", aliquotaInterna: 19 },
  { uf: "PB", nome: "Paraiba", regiao: "nordeste", aliquotaInterna: 20 },
  { uf: "PE", nome: "Pernambuco", regiao: "nordeste", aliquotaInterna: 20.5 },
  { uf: "PI", nome: "Piaui", regiao: "nordeste", aliquotaInterna: 21 },
  { uf: "PR", nome: "Parana", regiao: "sul", aliquotaInterna: 19.5 },
  { uf: "RJ", nome: "Rio de Janeiro", regiao: "sudeste", aliquotaInterna: 20 },
  { uf: "RN", nome: "Rio Grande do Norte", regiao: "nordeste", aliquotaInterna: 20 },
  { uf: "RO", nome: "Rondonia", regiao: "norte", aliquotaInterna: 19.5 },
  { uf: "RR", nome: "Roraima", regiao: "norte", aliquotaInterna: 20 },
  { uf: "RS", nome: "Rio Grande do Sul", regiao: "sul", aliquotaInterna: 17 },
  { uf: "SC", nome: "Santa Catarina", regiao: "sul", aliquotaInterna: 17 },
  { uf: "SE", nome: "Sergipe", regiao: "nordeste", aliquotaInterna: 20 },
  { uf: "SP", nome: "Sao Paulo", regiao: "sudeste", aliquotaInterna: 18 },
  { uf: "TO", nome: "Tocantins", regiao: "norte", aliquotaInterna: 20 },
];

const POR_UF = new Map(ESTADOS.map((e) => [e.uf, e]));

export function estadoPorUF(uf: string): EstadoBrasileiro | null {
  return POR_UF.get(uf.toUpperCase() as UF) ?? null;
}

export function nomeDoEstado(uf: string): string {
  return estadoPorUF(uf)?.nome ?? uf;
}

/**
 * Nome por extenso -> sigla, sem acento e sem depender de maiuscula.
 *
 * A Nuvemshop devolve `province` ora como "SP", ora como "Sao Paulo", ora com
 * acento ("São Paulo"). Normalizar num lugar so evita o estado virar tres
 * linhas diferentes no relatorio.
 */
const POR_NOME = new Map(
  ESTADOS.map((e) => [
    e.nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase(),
    e.uf,
  ]),
);

/** Devolve a sigla, ou `null` quando nao reconhece. */
export function normalizarUF(province: string | null | undefined): UF | null {
  if (!province) return null;

  const limpo = province.trim();
  if (limpo === "") return null;

  const comoSigla = limpo.toUpperCase();
  if (POR_UF.has(comoSigla as UF)) return comoSigla as UF;

  const semAcento = limpo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  return POR_NOME.get(semAcento) ?? null;
}

/**
 * Aliquota interestadual de ICMS, em percentual.
 *
 * Regra da Resolucao do Senado 22/1989: 12% em toda operacao interestadual,
 * caindo para 7% SOMENTE quando a origem esta no Sul ou Sudeste (exceto ES) e
 * o destino esta no Norte, Nordeste, Centro-Oeste ou ES.
 *
 * Para uma fabrica em Goias, que e Centro-Oeste, a resposta e sempre 12% --
 * mas a funcao trata o caso geral porque a UF de origem e cadastro do
 * influencer, e pode mudar.
 */
export function aliquotaInterestadual(ufOrigem: string, ufDestino: string): number {
  const origem = estadoPorUF(ufOrigem);
  const destino = estadoPorUF(ufDestino);
  if (!origem || !destino) return 12;

  const origemSulSudeste =
    (origem.regiao === "sul" || origem.regiao === "sudeste") && origem.uf !== "ES";

  const destinoFavorecido =
    destino.regiao === "norte" ||
    destino.regiao === "nordeste" ||
    destino.regiao === "centro-oeste" ||
    destino.uf === "ES";

  return origemSulSudeste && destinoFavorecido ? 7 : 12;
}
