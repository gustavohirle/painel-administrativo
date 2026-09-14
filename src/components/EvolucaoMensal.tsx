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

/*
 * O grafico existe em dois formatos, e a razao e de legibilidade, nao de gosto.
 *
 * Texto dentro de SVG encolhe junto com o viewBox. Um viewBox de 1200 de
 * largura espremido nos ~294px uteis de um celular escala tudo por 0,245: a
 * fonte 14 chega na tela com 3,4px e ninguem le. Medido, nao estimado.
 *
 * Entao o formato estreito nao e o mesmo desenho menor -- e um desenho com
 * menos largura, menos margem e menos rotulo, para que a fonte chegue perto de
 * 11px reais. Os valores por ponto saem: com seis pontos em 294px eles se
 * sobrepoem antes de ficarem pequenos demais. Sobram os eixos e as duas
 * linhas, que e o que a secao precisa dizer.
 */
interface Formato {
  largura: number;
  altura: number;
  margem: { topo: number; direita: number; baixo: number; esquerda: number };
  fonteEixo: number;
  fontePonto: number;
  /** Valor sobre cada ponto. Desligado no estreito: seis pares nao cabem. */
  rotularPontos: boolean;
  /** Mostra so um rotulo de mes a cada N, para o eixo nao virar uma mancha. */
  passoDoMes: number;
}

const FORMATO_LARGO: Formato = {
  largura: 1200,
  altura: 360,
  /*
   * A margem esquerda e generosa de proposito: o rotulo do primeiro ponto e
   * centrado nele e, com margem curta, invadia os valores do eixo. A direita
   * idem, para o rotulo do ultimo ponto nao ser cortado pelo viewBox.
   */
  margem: { topo: 40, direita: 62, baixo: 64, esquerda: 132 },
  fonteEixo: 13,
  fontePonto: 14,
  rotularPontos: true,
  passoDoMes: 1,
};

const FORMATO_ESTREITO: Formato = {
  largura: 380,
  altura: 300,
  /*
   * Margens do estreito medidas contra o texto, nao escolhidas no olho:
   * a esquerda tem que caber "R$ 800,0 mil" na fonte 12, e a direita tem que
   * caber metade de "Set/26", que e centrado no ultimo ponto e por isso
   * transborda o viewBox se a margem for curta.
   */
  margem: { topo: 20, direita: 34, baixo: 38, esquerda: 88 },
  fonteEixo: 12,
  fontePonto: 12,
  rotularPontos: false,
  passoDoMes: 2,
};

export function EvolucaoMensal({ pontos }: { pontos: PontoEvolucao[] }) {
  if (pontos.length === 0) {
    return <p className="text-sm text-tinta-media">Sem dados no período.</p>;
  }

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
        <span className="text-tinta-media sm:ml-auto">
          No mês mais recente, o recebido foi{" "}
          <strong className="numerico font-semibold text-tinta">
            {percentual(razaoSegura(ultimo.recebido, ultimo.bruto))}
          </strong>{" "}
          do faturado.
        </span>
      </div>

      {/* Um desenho por faixa de largura -- ver o comentario dos formatos. */}
      <div className="sm:hidden">
        <Desenho pontos={pontos} formato={FORMATO_ESTREITO} />
      </div>
      <div className="hidden sm:block">
        <Desenho pontos={pontos} formato={FORMATO_LARGO} />
      </div>
    </div>
  );
}

function Desenho({ pontos, formato }: { pontos: PontoEvolucao[]; formato: Formato }) {
  const { largura: LARGURA, altura: ALTURA, margem: MARGEM } = formato;
  const AREA_LARGURA = LARGURA - MARGEM.esquerda - MARGEM.direita;
  const AREA_ALTURA = ALTURA - MARGEM.topo - MARGEM.baixo;

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

  /* O ultimo mes sempre recebe rotulo: e o numero de que a frase acima fala. */
  const mostraMes = (i: number) =>
    i === pontos.length - 1 || (pontos.length - 1 - i) % formato.passoDoMes === 0;

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      className="h-auto w-full"
      role="img"
      aria-label="Evolução mensal do faturamento bruto comparado ao recebido."
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
            x={MARGEM.esquerda - 10}
            y={y(valor) + 4}
            textAnchor="end"
            fontSize={formato.fonteEixo}
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
          <circle cx={x(i)} cy={y(p.bruto)} r={4} fill="var(--color-bruto)" />
          <circle cx={x(i)} cy={y(p.recebido)} r={4} fill="var(--color-real)" />

          {formato.rotularPontos && (
            <>
              <text
                x={x(i)}
                y={y(p.bruto) - 14}
                textAnchor="middle"
                fontSize={formato.fontePonto}
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
                fontSize={formato.fontePonto}
                fontWeight={600}
                fill="var(--color-real)"
                className="numerico"
              >
                {moedaCompacta(p.recebido)}
              </text>
            </>
          )}

          {mostraMes(i) && (
            <text
              x={x(i)}
              y={ALTURA - 14}
              textAnchor="middle"
              fontSize={formato.fontePonto}
              fontWeight={600}
              fill="var(--color-tinta)"
            >
              {mesAno(p.mes)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
