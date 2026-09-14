import { PROPORCAO_ASSINATURA } from "@/types/ordemFabricacao";

interface AssinaturaLidaProps {
  tracos: number[][];
  /** Altura em pixels. A largura sai da proporcao, nunca ao contrario. */
  altura?: number;
  rotulo?: string;
}

/**
 * Assinatura ja gravada, so para ler.
 *
 * SVG, nao canvas: nao ha interacao nenhuma aqui, entao isto renderiza no
 * servidor e chega pronto -- sem virar componente de cliente e sem esperar
 * hidratacao para a assinatura aparecer.
 *
 * O `viewBox` usa a MESMA proporcao do quadro de assinatura e da moldura no
 * PDF. Os tracos sao normalizados de 0 a 1 em cada eixo, entao qualquer outra
 * proporcao aqui mostraria na tela uma assinatura diferente da que esta no
 * papel.
 */
export function AssinaturaLida({ tracos, altura = 56, rotulo }: AssinaturaLidaProps) {
  const largura = 300;
  const alturaDoDesenho = largura / PROPORCAO_ASSINATURA;

  return (
    <svg
      viewBox={`0 0 ${largura} ${alturaDoDesenho}`}
      style={{ height: altura, width: altura * PROPORCAO_ASSINATURA }}
      className="max-w-full"
      role="img"
      aria-label={rotulo ?? "Assinatura"}
    >
      {tracos.map((traco, indice) => {
        const pontos: string[] = [];
        for (let i = 0; i + 1 < traco.length; i += 2) {
          pontos.push(`${(traco[i] ?? 0) * largura},${(traco[i + 1] ?? 0) * alturaDoDesenho}`);
        }

        return (
          <polyline
            key={indice}
            points={pontos.join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
