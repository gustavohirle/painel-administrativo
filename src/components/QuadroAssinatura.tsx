"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PROPORCAO_ASSINATURA } from "@/types/ordemFabricacao";

interface QuadroAssinaturaProps {
  /** Nome do campo escondido que leva os tracos para a Server Action. */
  campo: string;
  rotulo: string;
  /** Avisa a tela se ja ha tinta, para habilitar o botao de enviar. */
  aoMudar?: (temTinta: boolean) => void;
}

/**
 * Quadro de assinatura a dedo ou mouse.
 *
 * Guarda VETOR, nao imagem: cada traco vira uma lista [x0, y0, x1, y1, ...] em
 * coordenadas de 0 a 1 dentro do quadro. Sao poucos KB, viajam num campo de
 * formulario comum, cabem no JSON do modo demonstracao e vao direto para o PDF
 * como polilinha. Um PNG em base64 seria dez vezes maior e obrigaria o gerador
 * de PDF a saber embutir imagem -- que e exatamente o que faria o projeto
 * precisar de uma biblioteca de PDF.
 *
 * Tres detalhes que so aparecem testando no telefone:
 *
 * 1. `touch-action: none` no elemento. Sem isso o primeiro movimento do dedo
 *    rola a pagina em vez de desenhar, e a assinatura sai como um risco.
 * 2. `setPointerCapture`. O dedo sai do quadro no meio de um traco o tempo
 *    todo; sem a captura o traco termina na borda e a letra fica cortada.
 * 3. A proporcao do quadro e FIXA (`PROPORCAO_ASSINATURA`), a mesma da moldura
 *    no PDF. Quadro e moldura com proporcoes diferentes achatam a assinatura
 *    no papel, porque os pontos sao normalizados em cada eixo.
 */
export function QuadroAssinatura({ campo, rotulo, aoMudar }: QuadroAssinaturaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tracos, setTracos] = useState<number[][]>([]);
  const emCurso = useRef<number[] | null>(null);

  const temTinta = tracos.length > 0;

  useEffect(() => {
    aoMudar?.(temTinta);
  }, [temTinta, aoMudar]);

  /** Redesenha tudo. O canvas nao guarda os tracos -- o estado guarda. */
  const redesenhar = useCallback(() => {
    const canvas = canvasRef.current;
    const pincel = canvas?.getContext("2d");
    if (!canvas || !pincel) return;

    // O canvas tem resolucao propria; sem acompanhar o devicePixelRatio a
    // assinatura sai borrada em qualquer celular moderno.
    const escala = window.devicePixelRatio || 1;
    const largura = canvas.clientWidth;
    const altura = canvas.clientHeight;

    if (canvas.width !== Math.round(largura * escala)) {
      canvas.width = Math.round(largura * escala);
      canvas.height = Math.round(altura * escala);
    }

    pincel.setTransform(escala, 0, 0, escala, 0, 0);
    pincel.clearRect(0, 0, largura, altura);

    pincel.strokeStyle = "#101828";
    pincel.lineWidth = 2;
    pincel.lineCap = "round";
    pincel.lineJoin = "round";

    const todos = emCurso.current ? [...tracos, emCurso.current] : tracos;

    for (const traco of todos) {
      if (traco.length < 4) continue;
      pincel.beginPath();
      pincel.moveTo((traco[0] ?? 0) * largura, (traco[1] ?? 0) * altura);
      for (let i = 2; i + 1 < traco.length; i += 2) {
        pincel.lineTo((traco[i] ?? 0) * largura, (traco[i + 1] ?? 0) * altura);
      }
      pincel.stroke();
    }
  }, [tracos]);

  useEffect(() => {
    redesenhar();
    // Girar o telefone muda a largura do quadro e apagaria o desenho.
    window.addEventListener("resize", redesenhar);
    return () => window.removeEventListener("resize", redesenhar);
  }, [redesenhar]);

  const posicao = (evento: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const caixa = evento.currentTarget.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (evento.clientX - caixa.left) / caixa.width)),
      Math.min(1, Math.max(0, (evento.clientY - caixa.top) / caixa.height)),
    ];
  };

  const comecar = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    evento.preventDefault();
    evento.currentTarget.setPointerCapture(evento.pointerId);
    emCurso.current = posicao(evento);
    redesenhar();
  };

  const mover = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    if (!emCurso.current) return;
    evento.preventDefault();

    const [x, y] = posicao(evento);
    const pontos = emCurso.current;

    // Descarta o ponto que praticamente nao andou: o dedo gera dezenas de
    // eventos por segundo e a lista cresceria sem mudar o desenho.
    const ultimoX = pontos[pontos.length - 2] ?? 0;
    const ultimoY = pontos[pontos.length - 1] ?? 0;
    if (Math.abs(x - ultimoX) < 0.004 && Math.abs(y - ultimoY) < 0.004) return;

    pontos.push(x, y);
    redesenhar();
  };

  const terminar = () => {
    const pontos = emCurso.current;
    emCurso.current = null;
    // Toque sem arrasto e um ponto, nao um traco.
    if (pontos && pontos.length >= 4) setTracos((atual) => [...atual, pontos]);
    else redesenhar();
  };

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-tinta">{rotulo}</span>
        <button
          type="button"
          onClick={() => {
            emCurso.current = null;
            setTracos([]);
          }}
          className="text-xs font-medium text-tinta-media underline underline-offset-2"
        >
          Limpar
        </button>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-borda-forte bg-superficie">
        <canvas
          ref={canvasRef}
          onPointerDown={comecar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          onPointerLeave={terminar}
          style={{ aspectRatio: String(PROPORCAO_ASSINATURA), touchAction: "none" }}
          className="block w-full cursor-crosshair"
        />

        {!temTinta && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-tinta-fraca">
            Assine aqui com o dedo
          </span>
        )}

        {/* A linha de base ajuda a assinar reto, como no papel. */}
        <span className="pointer-events-none absolute inset-x-6 bottom-5 border-b border-dashed border-borda" />
      </div>

      <input type="hidden" name={campo} value={JSON.stringify(tracos)} />
    </div>
  );
}
