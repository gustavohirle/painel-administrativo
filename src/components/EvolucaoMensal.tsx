import { escalaAgradavel, mesAno, moedaCompacta } from "@/lib/format";

/*
 * Uma linha por influencer, mais a linha do total, sobre doze meses.
 *
 * Ate 23/09/2026 eram duas linhas sobre seis pontos -- bruto x recebido --, e
 * a area sombreada entre elas era o assunto. O dono trocou: ele quer comparar
 * as marcas entre si e ver quem cresce e quem encolhe. A distancia entre
 * faturar e receber continua contada, e com mais detalhe, na pizza da tela
 * inicial (5.1); aqui ela sairia de qualquer jeito, porque nao ha como mostrar
 * duas metricas de cinco marcas no mesmo desenho.
 *
 * SVG na mao em vez de biblioteca de grafico: a geometria de N polilinhas e
 * trivial, e assim nao entra nenhuma dependencia que precise baixar algo em
 * tempo de execucao.
 */

export interface LinhaDaEvolucao {
  /** Rotulo: o nome do influencer, ou o da marca quando nao ha contrato. */
  nome: string;
  valores: number[];
}

interface EvolucaoMensalProps {
  meses: string[];
  linhas: LinhaDaEvolucao[];
  total: number[];
}

/*
 * Paleta das series.
 *
 * Qualitativa, e nao um degrade: as marcas nao tem ordem natural, e uma escala
 * continua sugeriria que a Ka esta "entre" a Tha e a Duale em alguma coisa.
 * Sao matizes bem separados e todos escuros o bastante para uma linha de 2px
 * ficar legivel sobre o fundo claro.
 *
 * O TOTAL nao entra na paleta: ele e preto e mais grosso, porque nao e mais
 * uma marca -- e a soma de todas, e precisa se ler como outra categoria.
 */
const CORES = [
  "#1849a9",
  "#be185d",
  "#047857",
  "#b45309",
  "#7c3aed",
  "#0e7490",
  "#a21caf",
  "#4d7c0f",
] as const;

const corDaSerie = (i: number) => CORES[i % CORES.length]!;

/*
 * O grafico existe em dois formatos, e a razao e de legibilidade, nao de gosto.
 *
 * Texto dentro de SVG encolhe junto com o viewBox. Um viewBox de 1200 de
 * largura espremido nos ~294px uteis de um celular escala tudo por 0,245: a
 * fonte 14 chega na tela com 3,4px e ninguem le. Medido, nao estimado.
 *
 * Entao o formato estreito nao e o mesmo desenho menor -- e um desenho com
 * menos largura, menos margem e menos rotulo, para que a fonte chegue perto de
 * 11px reais.
 */
interface Formato {
  largura: number;
  altura: number;
  margem: { topo: number; direita: number; baixo: number; esquerda: number };
  fonteEixo: number;
  /** Mostra so um rotulo de mes a cada N, para o eixo nao virar uma mancha. */
  passoDoMes: number;
  /** Raio do ponto em cada mes. Zero desliga: com 12 meses e 6 linhas sao 72. */
  raioDoPonto: number;
}

const FORMATO_LARGO: Formato = {
  largura: 1200,
  altura: 380,
  /*
   * A margem esquerda cabe "R$ 1.200,0 mil" na fonte 13. A direita cabe metade
   * de "Set/26", que e centrado no ultimo ponto e por isso transborda o
   * viewBox se a margem for curta.
   */
  margem: { topo: 28, direita: 62, baixo: 64, esquerda: 132 },
  fonteEixo: 13,
  passoDoMes: 1,
  raioDoPonto: 3,
};

const FORMATO_ESTREITO: Formato = {
  largura: 380,
  altura: 300,
  margem: { topo: 16, direita: 34, baixo: 38, esquerda: 88 },
  fonteEixo: 12,
  /*
   * Doze meses em ~294px dariam um rotulo a cada 21px: "Set/26" mede mais que
   * isso e eles se sobrepoem. De tres em tres o eixo respira.
   */
  passoDoMes: 3,
  raioDoPonto: 0,
};

export function EvolucaoMensal({ meses, linhas, total }: EvolucaoMensalProps) {
  if (meses.length === 0 || linhas.length === 0) {
    return <p className="text-sm text-tinta-media">Sem dados no período.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="flex items-center gap-2 font-semibold text-tinta">
          <span className="h-1 w-6 rounded bg-tinta" />
          Total
        </span>
        {linhas.map((linha, i) => (
          <span key={linha.nome} className="flex items-center gap-2 font-medium text-tinta-media">
            <span
              className="h-0.5 w-6 rounded"
              style={{ backgroundColor: corDaSerie(i) }}
            />
            {linha.nome}
          </span>
        ))}
      </div>

      {/* Um desenho por faixa de largura -- ver o comentario dos formatos. */}
      <div className="sm:hidden">
        <Desenho meses={meses} linhas={linhas} total={total} formato={FORMATO_ESTREITO} />
      </div>
      <div className="hidden sm:block">
        <Desenho meses={meses} linhas={linhas} total={total} formato={FORMATO_LARGO} />
      </div>
    </div>
  );
}

function Desenho({
  meses,
  linhas,
  total,
  formato,
}: EvolucaoMensalProps & { formato: Formato }) {
  const { largura: LARGURA, altura: ALTURA, margem: MARGEM } = formato;
  const AREA_LARGURA = LARGURA - MARGEM.esquerda - MARGEM.direita;
  const AREA_ALTURA = ALTURA - MARGEM.topo - MARGEM.baixo;

  /*
   * A escala sai do TOTAL, que e sempre o maior. As marcas menores ficam
   * baixas no desenho, e isso e honesto: a Revenda faz mesmo uma fracao do que
   * a Tha faz, e um eixo por marca esconderia justamente essa diferenca.
   */
  const { topo: maximo, marcas: referencias } = escalaAgradavel(Math.max(...total, 0));
  const passo = meses.length > 1 ? AREA_LARGURA / (meses.length - 1) : 0;

  const x = (i: number) => MARGEM.esquerda + passo * i;
  const y = (v: number) =>
    MARGEM.topo + AREA_ALTURA - (maximo > 0 ? (v / maximo) * AREA_ALTURA : 0);

  const caminho = (valores: number[]) =>
    valores.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");

  /* O ultimo mes sempre recebe rotulo: e o mes que a pessoa veio olhar. */
  const mostraMes = (i: number) =>
    i === meses.length - 1 || (meses.length - 1 - i) % formato.passoDoMes === 0;

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      className="h-auto w-full"
      role="img"
      aria-label="Faturamento bruto de cada influencer mês a mês, e o total da operação."
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

      {/* As marcas primeiro; o total por cima, porque e a linha de referencia. */}
      {linhas.map((linha, i) => (
        <path
          key={linha.nome}
          d={caminho(linha.valores)}
          fill="none"
          stroke={corDaSerie(i)}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      <path
        d={caminho(total)}
        fill="none"
        stroke="var(--color-tinta)"
        strokeWidth={3.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {formato.raioDoPonto > 0 &&
        meses.map((mes, i) => (
          <g key={mes}>
            {linhas.map((linha, n) => (
              <circle
                key={linha.nome}
                cx={x(i)}
                cy={y(linha.valores[i] ?? 0)}
                r={formato.raioDoPonto}
                fill={corDaSerie(n)}
              />
            ))}
            <circle
              cx={x(i)}
              cy={y(total[i] ?? 0)}
              r={formato.raioDoPonto + 1}
              fill="var(--color-tinta)"
            />
          </g>
        ))}

      {meses.map((mes, i) =>
        mostraMes(i) ? (
          <text
            key={mes}
            x={x(i)}
            y={ALTURA - 14}
            textAnchor="middle"
            fontSize={formato.fonteEixo}
            fontWeight={600}
            fill="var(--color-tinta)"
          >
            {mesAno(mes)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
