/**
 * Formatacao pt-BR. Tudo que aparece na tela passa por aqui.
 *
 * O cliente tem ~55 anos e vai ler isso a distancia numa reuniao.
 * Numero grande sem separador de milhar e ilegivel; centavo em titulo e ruido.
 */

const MOEDA_CHEIA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MOEDA_REDONDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const DECIMAL_1 = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const MES_ANO_LONGO = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

/*
 * O fuso e FIXO, nao o da maquina.
 *
 * A hora de uma assinatura sai impressa num documento que vai para outra
 * pessoa. Se ela seguisse o fuso do servidor, o mesmo PDF diria 16:05 aqui e
 * 19:05 num deploy em Londres -- e o horario de um documento assinado nao pode
 * depender de onde o processo esta rodando. A operacao inteira e brasileira.
 */
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const NOMES_MES_CURTO = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/** R$ 3.142.800,00 -- use em tabela, onde o centavo importa. */
export function moeda(valor: number): string {
  return MOEDA_CHEIA.format(valor);
}

/** R$ 3.142.800 -- use em numero grande de destaque. */
export function moedaRedonda(valor: number): string {
  return MOEDA_REDONDA.format(valor);
}

/**
 * R$ 3,1 mi -- use quando o espaco e apertado (rotulo de grafico, eixo).
 * Abaixo de mil reais mostra o valor cheio arredondado.
 */
export function moedaCompacta(valor: number): string {
  const abs = Math.abs(valor);
  const sinal = valor < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sinal}R$ ${DECIMAL_1.format(abs / 1_000_000)} mi`;
  if (abs >= 1_000) return `${sinal}R$ ${DECIMAL_1.format(abs / 1_000)} mil`;
  return MOEDA_REDONDA.format(valor);
}

/** 8.400 */
export function inteiro(valor: number): string {
  return INTEIRO.format(valor);
}

/**
 * 14,2% -- recebe a FRACAO (0.142), nao o numero ja multiplicado.
 * Divisao por zero devolve "0,0%" em vez de "NaN%".
 */
export function percentual(fracao: number, casas = 1): string {
  const seguro = Number.isFinite(fracao) ? fracao : 0;
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(seguro * 100)}%`;
}

/** 05/09/2026 */
export function data(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return DATA_CURTA.format(d);
}

/**
 * "12/10/2026" a partir de "aaaa-mm-dd", sem passar por fuso nenhum.
 *
 * `data()` acima serve para INSTANTE -- um `paid_at`, um `criadoEm` -- e ali
 * converter para o fuso local e o certo. Data de CALENDARIO e outra coisa:
 * "2026-10-12" nao tem hora, e `new Date("2026-10-12")` produz meia-noite em
 * UTC, que no Brasil ainda e dia 11. A data de lancamento de uma ordem
 * assinada nao pode andar um dia para tras dependendo de quem abre o PDF.
 */
export function dataCalendario(aaaammdd: string): string {
  const [ano, mes, dia] = aaaammdd.split("-");
  if (!ano || !mes || !dia) return aaaammdd;
  return `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}/${ano}`;
}

/** "12/09/2026 14:22" -- instante, sempre no horario de Brasilia. */
export function dataHora(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return DATA_HORA.format(d);
}

/**
 * "Set/26" -- recebe a chave "2026-09".
 *
 * Formatado a mao em vez de via Intl: o `month: "short"` do pt-BR produz
 * "set. de 26", que fica comprido demais para rotulo de eixo e le mal.
 */
export function mesAno(chave: string): string {
  const [ano, mes] = chave.split("-");
  const indice = Number(mes) - 1;
  if (!ano || Number.isNaN(indice) || indice < 0 || indice > 11) return chave;
  return `${NOMES_MES_CURTO[indice]}/${ano.slice(2)}`;
}

/** "Setembro de 2026" -- para titulo de pagina, onde ha espaco. */
export function mesAnoLongo(chave: string): string {
  const [ano, mes] = chave.split("-");
  const d = new Date(Number(ano), Number(mes) - 1, 1);
  if (Number.isNaN(d.getTime())) return chave;
  const texto = MES_ANO_LONGO.format(d);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Escala com marcas "redondas" para eixo de grafico.
 *
 * Dividir o maximo em 4 partes iguais produz rotulos como "R$ 871,2 mil", que
 * o olho nao ancora. Aqui o passo e arredondado para 1, 2, 2,5 ou 5 vezes uma
 * potencia de 10.
 */
export function escalaAgradavel(
  maximo: number,
  divisoes = 4,
): { topo: number; marcas: number[] } {
  if (!Number.isFinite(maximo) || maximo <= 0) {
    return { topo: 1, marcas: [0, 1] };
  }

  const bruto = maximo / divisoes;
  const magnitude = 10 ** Math.floor(Math.log10(bruto));
  const normalizado = bruto / magnitude;
  // Passos intermediarios (3, 4, 6, 8) evitam sobrar espaco morto no topo:
  // com so [1, 2, 2.5, 5, 10], um maximo de R$ 3,1 mi viraria eixo ate
  // R$ 4 mi e achataria as linhas na metade de cima do grafico.
  const fator =
    [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((f) => normalizado <= f) ?? 10;
  const passo = fator * magnitude;

  const topo = passo * divisoes;
  const marcas = Array.from({ length: divisoes + 1 }, (_, i) => passo * i);
  return { topo, marcas };
}

/** Divisao que nao explode em zero. */
export function razaoSegura(numerador: number, denominador: number): number {
  if (!denominador) return 0;
  const r = numerador / denominador;
  return Number.isFinite(r) ? r : 0;
}

/** Rotulos em portugues para os meios de pagamento da API. */
export const ROTULO_METODO_PAGAMENTO: Record<string, string> = {
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  boleto: "Boleto",
  pix: "Pix",
  wire_transfer: "Transferencia",
  other: "Outros",
};

/**
 * Rotulo do meio de pagamento.
 *
 * Metodo desconhecido devolve o PROPRIO valor, nao "Outros". Se a API do
 * cliente mandar um nome que o painel nunca viu, o nome cru na tela e o que
 * permite mapea-lo; escondido atras de "Outros" ele viraria indistinguivel do
 * metodo `other`, que e uma escolha legitima de pagamento.
 */
export function rotuloMetodo(metodo: string | null | undefined): string {
  if (!metodo || metodo === "nao_informado") return "Nao informado";
  return ROTULO_METODO_PAGAMENTO[metodo] ?? metodo;
}

/**
 * Valor digitado em reais -> numero. "1.234,56", "1234,56", "R$ 1.234,56" e
 * "1234.56" viram 1234.56.
 *
 * Texto vazio ou que nao e numero devolve `null`, nunca zero: `Number("")` vale
 * 0, e um campo em branco virando custo zero faria a simulacao dizer que da
 * lucro (armadilha 8 da secao 8).
 */
export function lerReais(texto: string): number | null {
  const limpo = texto
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  if (limpo === "") return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}
