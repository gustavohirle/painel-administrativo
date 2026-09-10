import { moedaCompacta, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import type { Reconciliacao } from "@/lib/metrics";

/*
 * A cascata e o herio da tela: em 10 segundos ela precisa mostrar que
 * faturamento bruto e dinheiro recebido nao sao a mesma coisa.
 *
 * Feita em SVG na mao de proposito. Nenhuma biblioteca de grafico faz
 * cascata bem, e aqui a geometria e simples: cada barra comeca onde a
 * anterior terminou.
 */

const LARGURA = 1200;
const ALTURA = 470;
const MARGEM_LATERAL = 24;
const TOPO_GRAFICO = 96;
const BASE_GRAFICO = 380;
const ALTURA_GRAFICO = BASE_GRAFICO - TOPO_GRAFICO;
const LARGURA_BARRA = 104;

/**
 * Altura minima de barra, em pixels.
 *
 * Reembolso costuma ser ~1% do bruto: proporcional, viraria uma linha de 3px
 * que ninguem enxerga num projetor. A barra ganha um piso visual; o VALOR
 * exibido continua exato -- e ele que o cliente vai conferir.
 */
const ALTURA_MINIMA_BARRA = 9;

type TipoEtapa = "total" | "deducao" | "destaque";

interface Etapa {
  rotulo: string;
  apoio: string;
  valor: number;
  base: number;
  topo: number;
  tipo: TipoEtapa;
  cor: string;
}

function montarEtapas(r: Reconciliacao): Etapa[] {
  const aposNaoPago = r.bruto - r.naoPago;
  const aposCancelado = aposNaoPago - r.cancelado;

  return [
    {
      rotulo: "Faturamento bruto",
      apoio: "Tudo que foi pedido",
      valor: r.bruto,
      base: 0,
      topo: r.bruto,
      tipo: "total",
      cor: "var(--color-bruto)",
    },
    {
      rotulo: "Nao pagos",
      apoio: `${percentual(razaoSegura(r.naoPago, r.bruto))} do bruto`,
      valor: -r.naoPago,
      base: aposNaoPago,
      topo: r.bruto,
      tipo: "deducao",
      cor: "var(--color-naopago)",
    },
    {
      rotulo: "Cancelados",
      apoio: `${percentual(razaoSegura(r.cancelado, r.bruto))} do bruto`,
      valor: -r.cancelado,
      base: aposCancelado,
      topo: aposNaoPago,
      tipo: "deducao",
      cor: "var(--color-cancelado)",
    },
    {
      rotulo: "Reembolsados",
      apoio: `${percentual(razaoSegura(r.reembolsado, r.bruto))} do bruto`,
      valor: -r.reembolsado,
      base: r.recebido,
      topo: aposCancelado,
      tipo: "deducao",
      cor: "var(--color-reembolsado)",
    },
    {
      rotulo: "Recebido",
      apoio: `${percentual(razaoSegura(r.recebido, r.bruto))} do bruto`,
      valor: r.recebido,
      base: 0,
      topo: r.recebido,
      tipo: "total",
      cor: "var(--color-bruto)",
    },
    {
      rotulo: "Frete",
      apoio: `${percentual(razaoSegura(r.frete, r.recebido))} do recebido`,
      valor: -r.frete,
      base: r.receitaReal,
      topo: r.recebido,
      tipo: "deducao",
      cor: "var(--color-frete)",
    },
    {
      rotulo: "Receita real",
      apoio: `${percentual(razaoSegura(r.receitaReal, r.bruto))} do bruto`,
      valor: r.receitaReal,
      base: 0,
      topo: r.receitaReal,
      tipo: "destaque",
      cor: "var(--color-real)",
    },
  ];
}

export function CascataFaturamento({
  reconciliacao,
}: {
  reconciliacao: Reconciliacao;
}) {
  const etapas = montarEtapas(reconciliacao);
  const maximo = reconciliacao.bruto || 1;
  const passo = (LARGURA - MARGEM_LATERAL * 2) / etapas.length;

  const y = (valor: number) => BASE_GRAFICO - (valor / maximo) * ALTURA_GRAFICO;
  const centro = (i: number) => MARGEM_LATERAL + passo * i + passo / 2;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Reconciliacao do faturamento: de ${moedaRedonda(
          reconciliacao.bruto,
        )} faturados para ${moedaRedonda(reconciliacao.receitaReal)} de receita real.`}
      >
        {/* Linha de base */}
        <line
          x1={MARGEM_LATERAL}
          y1={BASE_GRAFICO}
          x2={LARGURA - MARGEM_LATERAL}
          y2={BASE_GRAFICO}
          stroke="var(--color-borda-forte)"
          strokeWidth={1}
        />

        {/* Conectores: mostram que cada barra comeca onde a anterior parou */}
        {etapas.slice(0, -1).map((etapa, i) => {
          const proxima = etapas[i + 1]!;
          const nivel = proxima.tipo === "deducao" ? proxima.topo : etapa.topo;
          return (
            <line
              key={`conector-${etapa.rotulo}`}
              x1={centro(i) + LARGURA_BARRA / 2}
              y1={y(nivel)}
              x2={centro(i + 1) - LARGURA_BARRA / 2}
              y2={y(nivel)}
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
          const destaque = etapa.tipo === "destaque";

          return (
            <g key={etapa.rotulo}>
              {destaque && (
                <rect
                  x={x - 10}
                  y={yBarra - 10}
                  width={LARGURA_BARRA + 20}
                  height={alturaReal + 20}
                  rx={10}
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
                opacity={etapa.tipo === "deducao" ? 0.9 : 1}
              />

              {/* Valor acima da barra */}
              <text
                x={centro(i)}
                y={yBarra - 14}
                textAnchor="middle"
                className="numerico"
                fontSize={destaque ? 27 : 21}
                fontWeight={700}
                fill={destaque ? "var(--color-real)" : "var(--color-tinta)"}
              >
                {etapa.valor < 0 ? "−" : ""}
                {moedaCompacta(Math.abs(etapa.valor))}
              </text>

              {/* Rotulo e apoio abaixo do eixo */}
              <text
                x={centro(i)}
                y={BASE_GRAFICO + 26}
                textAnchor="middle"
                fontSize={15}
                fontWeight={destaque ? 700 : 600}
                fill={destaque ? "var(--color-real)" : "var(--color-tinta)"}
              >
                {etapa.rotulo}
              </text>
              <text
                x={centro(i)}
                y={BASE_GRAFICO + 46}
                textAnchor="middle"
                fontSize={13}
                fill="var(--color-tinta-fraca)"
              >
                {etapa.apoio}
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption className="mt-2 text-xs text-tinta-fraca">
        Barras muito pequenas recebem uma altura minima para ficarem visiveis; os
        valores exibidos sao exatos.
      </figcaption>
    </figure>
  );
}
