import { moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import type { DemonstrativoResultado } from "@/lib/costing";

/*
 * A cascata e o heroi da tela: em 10 segundos ela precisa mostrar o caminho
 * inteiro, do que foi pedido ate o que sobra.
 *
 * Feita em SVG na mao de proposito. Nenhuma biblioteca de grafico faz cascata
 * bem, e aqui a geometria e simples: cada barra comeca onde a anterior parou.
 */

const LARGURA = 1200;
const ALTURA = 476;
const MARGEM_LATERAL = 16;
const TOPO_GRAFICO = 88;
const BASE_GRAFICO = 372;
const ALTURA_GRAFICO = BASE_GRAFICO - TOPO_GRAFICO;
const LARGURA_BARRA = 72;

/**
 * Altura minima de barra, em pixels.
 *
 * Reembolso costuma ser ~1% do bruto: proporcional, viraria uma linha de 3px
 * que ninguem enxerga num projetor. A barra ganha um piso visual; o VALOR
 * exibido continua exato -- e ele que o cliente vai conferir.
 */
const ALTURA_MINIMA_BARRA = 8;

type TipoEtapa = "abertura" | "deducao" | "subtotal" | "resultado";

interface Etapa {
  rotulo: string;
  apoio: string;
  valor: number;
  base: number;
  topo: number;
  tipo: TipoEtapa;
  cor: string;
}

/**
 * Valor curto o suficiente para caber na coluna.
 *
 * Sao onze barras: numa tela de reuniao, cada coluna tem pouco mais de 100px.
 * "R$ 441,2 mil" nao cabe; "R$ 441 mil" cabe. O centavo perdido aqui nao muda
 * nenhuma decisao -- e a tabela logo abaixo tem o valor cheio.
 */
function valorCurto(valor: number): string {
  const abs = Math.abs(valor);
  const sinal = valor < 0 ? "−" : "";

  if (abs >= 1_000_000) {
    return `${sinal}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} mi`;
  }
  if (abs >= 1_000) {
    return `${sinal}R$ ${Math.round(abs / 1_000).toLocaleString("pt-BR")} mil`;
  }
  return `${sinal}${moedaRedonda(abs)}`;
}

/** Quebra o rotulo em duas linhas quando ele nao cabe numa coluna. */
function duasLinhas(rotulo: string): [string, string?] {
  if (rotulo.length <= 12) return [rotulo];
  const meio = rotulo.lastIndexOf(" ", Math.ceil(rotulo.length / 2) + 4);
  if (meio <= 0) return [rotulo];
  return [rotulo.slice(0, meio), rotulo.slice(meio + 1)];
}

function montarEtapas(dre: DemonstrativoResultado): Etapa[] {
  const r = dre.reconciliacao;

  const aposNaoPago = r.bruto - r.naoPago;
  const aposCancelado = aposNaoPago - r.cancelado;

  /*
   * Todo apoio e medido sobre o FATURAMENTO BRUTO, e nao sobre a etapa
   * anterior.
   *
   * Duas razoes: numa cascata a leitura natural e "quanto do bolo inicial cada
   * pedaco leva", e bases diferentes a cada coluna obrigariam a escrever qual
   * era a base -- texto que nao cabe em onze colunas e que, na versao
   * anterior, estava literalmente colidindo com o da coluna vizinha.
   */
  const doBruto = (valor: number) => percentual(razaoSegura(valor, r.bruto));

  return [
    {
      rotulo: "Faturamento bruto",
      apoio: "100% do faturado",
      valor: r.bruto,
      base: 0,
      topo: r.bruto,
      tipo: "abertura",
      cor: "var(--color-bruto)",
    },
    {
      rotulo: "Nao pagos",
      apoio: doBruto(r.naoPago),
      valor: -r.naoPago,
      base: aposNaoPago,
      topo: r.bruto,
      tipo: "deducao",
      cor: "var(--color-naopago)",
    },
    {
      rotulo: "Cancelados",
      apoio: doBruto(r.cancelado),
      valor: -r.cancelado,
      base: aposCancelado,
      topo: aposNaoPago,
      tipo: "deducao",
      cor: "var(--color-cancelado)",
    },
    {
      rotulo: "Reembolsados",
      apoio: doBruto(r.reembolsado),
      valor: -r.reembolsado,
      base: r.recebido,
      topo: aposCancelado,
      tipo: "deducao",
      cor: "var(--color-reembolsado)",
    },
    {
      rotulo: "Recebido",
      apoio: doBruto(r.recebido),
      valor: r.recebido,
      base: 0,
      topo: r.recebido,
      tipo: "subtotal",
      cor: "var(--color-bruto)",
    },
    {
      rotulo: "Frete",
      apoio: doBruto(r.frete),
      valor: -r.frete,
      base: r.receitaReal,
      topo: r.recebido,
      tipo: "deducao",
      cor: "var(--color-frete)",
    },
    {
      rotulo: "Receita real",
      apoio: doBruto(r.receitaReal),
      valor: r.receitaReal,
      base: 0,
      topo: r.receitaReal,
      tipo: "subtotal",
      cor: "var(--color-real)",
    },
    {
      rotulo: "Impostos",
      apoio: doBruto(dre.totalImpostos),
      valor: -dre.totalImpostos,
      base: dre.receitaLiquida,
      topo: r.receitaReal,
      tipo: "deducao",
      cor: "var(--color-imposto)",
    },
    {
      rotulo: "Fabricacao",
      apoio: doBruto(dre.cmv.cmv),
      valor: -dre.cmv.cmv,
      base: dre.margemContribuicao,
      topo: dre.receitaLiquida,
      tipo: "deducao",
      cor: "var(--color-custo)",
    },
    {
      rotulo: "Comissoes",
      apoio: doBruto(dre.totalComissoes),
      valor: -dre.totalComissoes,
      base: dre.lucroOperacional,
      topo: dre.margemContribuicao,
      tipo: "deducao",
      cor: "var(--color-comissao)",
    },
    {
      rotulo: "Lucro operacional",
      apoio: doBruto(dre.lucroOperacional),
      valor: dre.lucroOperacional,
      base: 0,
      topo: dre.lucroOperacional,
      tipo: "resultado",
      cor: "var(--color-real)",
    },
  ];
}

export function CascataFaturamento({ dre }: { dre: DemonstrativoResultado }) {
  const etapas = montarEtapas(dre);

  const maximo = Math.max(...etapas.map((e) => e.topo), 1);
  // Lucro negativo desenha abaixo da linha de base: a escala precisa alcancar.
  const minimo = Math.min(0, ...etapas.map((e) => e.base));
  const amplitude = maximo - minimo || 1;

  const passo = (LARGURA - MARGEM_LATERAL * 2) / etapas.length;

  const y = (valor: number) =>
    BASE_GRAFICO - ((valor - minimo) / amplitude) * ALTURA_GRAFICO;
  const centro = (i: number) => MARGEM_LATERAL + passo * i + passo / 2;

  const linhaZero = y(0);

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Do faturamento ao lucro: de ${moedaRedonda(
          dre.reconciliacao.bruto,
        )} faturados sobram ${moedaRedonda(dre.lucroOperacional)} de lucro operacional.`}
      >
        <line
          x1={MARGEM_LATERAL}
          y1={linhaZero}
          x2={LARGURA - MARGEM_LATERAL}
          y2={linhaZero}
          stroke="var(--color-borda-forte)"
          strokeWidth={1}
        />

        {/*
          Conectores: cada barra comeca exatamente onde a anterior parou, e o
          "onde parou" e sempre o topo da PROXIMA -- vale tanto para deducao
          quanto para subtotal.
        */}
        {etapas.slice(0, -1).map((etapa, i) => {
          const proxima = etapas[i + 1]!;
          return (
            <line
              key={`conector-${etapa.rotulo}`}
              x1={centro(i) + LARGURA_BARRA / 2}
              y1={y(proxima.topo)}
              x2={centro(i + 1) - LARGURA_BARRA / 2}
              y2={y(proxima.topo)}
              stroke="var(--color-borda-forte)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          );
        })}

        {etapas.map((etapa, i) => {
          const topoY = y(etapa.topo);
          const baseY = y(etapa.base);
          const alturaReal = Math.max(baseY - topoY, ALTURA_MINIMA_BARRA);
          const yBarra = baseY - alturaReal;
          const x = centro(i) - LARGURA_BARRA / 2;

          const resultado = etapa.tipo === "resultado";
          const subtotal = etapa.tipo === "subtotal";
          const [linha1, linha2] = duasLinhas(etapa.rotulo);

          return (
            <g key={etapa.rotulo}>
              {resultado && (
                <rect
                  x={x - 9}
                  y={yBarra - 9}
                  width={LARGURA_BARRA + 18}
                  height={alturaReal + 18}
                  rx={9}
                  fill="var(--color-real-claro)"
                />
              )}

              <rect
                x={x}
                y={yBarra}
                width={LARGURA_BARRA}
                height={alturaReal}
                rx={4}
                fill={etapa.cor}
                opacity={etapa.tipo === "deducao" ? 0.92 : 1}
              />

              {/* Valor acima da barra */}
              <text
                x={centro(i)}
                y={yBarra - 13}
                textAnchor="middle"
                className="numerico"
                fontSize={resultado ? 24 : subtotal ? 20 : 18}
                fontWeight={700}
                fill={
                  resultado || (subtotal && etapa.cor === "var(--color-real)")
                    ? "var(--color-real)"
                    : "var(--color-tinta)"
                }
              >
                {valorCurto(etapa.valor)}
              </text>

              {/* Rotulo e apoio abaixo do eixo */}
              <text
                x={centro(i)}
                y={BASE_GRAFICO + 26}
                textAnchor="middle"
                fontSize={13}
                fontWeight={resultado ? 700 : 600}
                fill={resultado ? "var(--color-real)" : "var(--color-tinta)"}
              >
                <tspan x={centro(i)}>{linha1}</tspan>
                {linha2 && (
                  <tspan x={centro(i)} dy={16}>
                    {linha2}
                  </tspan>
                )}
              </text>
              {/*
                Altura fixa, calculada para o rotulo mais alto (duas linhas).
                Acompanhar a altura de cada rotulo deixava os apoios em
                degraus, e os vizinhos acabavam se sobrepondo.
              */}
              <text
                x={centro(i)}
                y={BASE_GRAFICO + 64}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill="var(--color-tinta-fraca)"
              >
                {etapa.apoio}
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption className="mt-2 text-xs leading-relaxed text-tinta-fraca">
        Todos os percentuais sao sobre o faturamento bruto. Barras muito
        pequenas recebem uma altura minima para ficarem visiveis, e os valores
        estao arredondados para o milhar -- a tabela do raio-x, logo abaixo,
        traz o valor cheio de cada linha.
      </figcaption>
    </figure>
  );
}
