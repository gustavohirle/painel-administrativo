import {
  escalaAgradavel,
  mesAno,
  moedaCompacta,
  percentual,
  razaoSegura,
} from "@/lib/format";
import type { PontoEvolucao } from "@/lib/metrics";

/*
 * Duas linhas sobre seis pontos: bruto x recebido.
 *
 * A area sombreada entre elas e o ponto da secao -- mostra que a distancia
 * entre faturar e receber e estrutural, nao um mes ruim isolado.
 *
 * SVG na mao em vez de biblioteca de grafico: para duas series de seis pontos
 * a geometria e trivial, e assim nao entra nenhuma dependencia que precise
 * baixar nada em tempo de execucao.
 */

const LARGURA = 1200;
const ALTURA = 360;
/*
 * A margem esquerda e generosa de proposito: o rotulo do primeiro ponto e
 * centrado nele e, com margem curta, invadia os valores do eixo. A direita
 * idem, para o rotulo do ultimo ponto nao ser cortado pelo viewBox.
 */
const MARGEM = { topo: 40, direita: 62, baixo: 64, esquerda: 132 };
const AREA_LARGURA = LARGURA - MARGEM.esquerda - MARGEM.direita;
const AREA_ALTURA = ALTURA - MARGEM.topo - MARGEM.baixo;

export function EvolucaoMensal({ pontos }: { pontos: PontoEvolucao[] }) {
  if (pontos.length === 0) {
    return <p className="text-sm text-tinta-media">Sem dados no periodo.</p>;
  }

  // Sem folga manual: `escalaAgradavel` ja arredonda para cima do maximo.
  const { topo: maximo, marcas: referencias } = escalaAgradavel(
    Math.max(...pontos.map((p) => p.bruto)),
  );
  const passo = pontos.length > 1 ? AREA_LARGURA / (pontos.length - 1) : 0;

  const x = (i: number) => MARGEM.esquerda + passo * i;
  const y = (v: number) => MARGEM.topo + AREA_ALTURA - (v / maximo) * AREA_ALTURA;

  const linha = (chave: "bruto" | "recebido") =>
    pontos.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p[chave])}`).join(" ");

  // Poligono fechado entre as duas linhas: o "vazamento" do periodo.
  const areaEntre = [
    ...pontos.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.bruto)}`),
    ...pontos
      .slice()
      .reverse()
      .map((p, i) => `L ${x(pontos.length - 1 - i)} ${y(p.recebido)}`),
    "Z",
  ].join(" ");

  const ultimo = pontos[pontos.length - 1]!;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-tinta">
          <span className="h-0.5 w-6 rounded bg-bruto" />
          Faturamento bruto
        </span>
        <span className="flex items-center gap-2 font-medium text-tinta">
          <span className="h-0.5 w-6 rounded bg-real" />
          Recebido
        </span>
        <span className="ml-auto text-tinta-media">
          No mes mais recente, o recebido foi{" "}
          <strong className="numerico font-semibold text-tinta">
            {percentual(razaoSegura(ultimo.recebido, ultimo.bruto))}
          </strong>{" "}
          do faturado.
        </span>
      </div>

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="h-auto w-full"
        role="img"
        aria-label="Evolucao mensal do faturamento bruto comparado ao recebido."
      >
        {referencias.map((valor) => (
          <g key={valor}>
            <line
              x1={MARGEM.esquerda}
              y1={y(valor)}
              x2={LARGURA - MARGEM.direita}
              y2={y(valor)}
              stroke="var(--color-borda)"
              strokeWidth={1}
            />
            <text
              x={MARGEM.esquerda - 20}
              y={y(valor) + 4}
              textAnchor="end"
              fontSize={13}
              fill="var(--color-tinta-fraca)"
              className="numerico"
            >
              {moedaCompacta(valor)}
            </text>
          </g>
        ))}

        <path d={areaEntre} fill="var(--color-naopago)" opacity={0.08} />

        <path
          d={linha("bruto")}
          fill="none"
          stroke="var(--color-bruto)"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={linha("recebido")}
          fill="none"
          stroke="var(--color-real)"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {pontos.map((p, i) => (
          <g key={p.mes}>
            <circle cx={x(i)} cy={y(p.bruto)} r={5} fill="var(--color-bruto)" />
            <circle cx={x(i)} cy={y(p.recebido)} r={5} fill="var(--color-real)" />

            <text
              x={x(i)}
              y={y(p.bruto) - 14}
              textAnchor="middle"
              fontSize={14}
              fontWeight={600}
              fill="var(--color-bruto)"
              className="numerico"
            >
              {moedaCompacta(p.bruto)}
            </text>
            <text
              x={x(i)}
              y={y(p.recebido) + 24}
              textAnchor="middle"
              fontSize={14}
              fontWeight={600}
              fill="var(--color-real)"
              className="numerico"
            >
              {moedaCompacta(p.recebido)}
            </text>

            <text
              x={x(i)}
              y={ALTURA - 28}
              textAnchor="middle"
              fontSize={14}
              fontWeight={600}
              fill="var(--color-tinta)"
            >
              {mesAno(p.mes)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
