import { dataHora } from "@/lib/format";
import { estadoDaEtapa, type EstadoDaEtapa } from "@/lib/processoOrdem";
import {
  ETAPAS,
  QUEM_FAZ_A_ETAPA,
  ROTULO_ETAPA,
  passoDaEtapa,
  type EtapaOrdem,
  type OrdemFabricacao,
} from "@/types/ordemFabricacao";

/**
 * A linha do tempo do processo, no topo da tela.
 *
 * Responde de um olhar a pergunta que fazia o processo por mensagem falhar:
 * **em que pe esta, e com quem?** Cada etapa mostra quem assinou e quando; a
 * etapa atual fica acesa; as que faltam ficam apagadas.
 *
 * Duas decisoes de desenho:
 *
 * 1. **No celular ela vira vertical.** Seis etapas numa faixa horizontal de
 *    390px dariam 65px por etapa -- nem o nome caberia. Deitada, cada etapa
 *    ganha a linha inteira e o nome de quem assinou cabe junto. E o mesmo
 *    principio da secao 2.1: no telefone nao se encolhe, se troca de formato.
 * 2. **Etapa parada aparece em vermelho, nao some.** Quando a conferencia
 *    reprova, a ordem volta para quem abriu -- e a linha do tempo precisa
 *    mostrar ONDE ela parou, senao a tela diria que o processo esta no comeco
 *    de novo, sem explicar por que.
 */
export function LinhaDoTempoDaOrdem({ ordem }: { ordem: OrdemFabricacao }) {
  return (
    <div className="rounded-xl border border-borda bg-superficie px-4 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:px-6">
      {/* Deitada no celular */}
      <ol className="space-y-3 sm:hidden">
        {ETAPAS.map((etapa) => (
          <EtapaDeitada key={etapa} ordem={ordem} etapa={etapa} />
        ))}
      </ol>

      {/* Em pe na tela grande */}
      <ol className="hidden sm:flex sm:items-start">
        {ETAPAS.map((etapa, indice) => (
          <EtapaEmPe
            key={etapa}
            ordem={ordem}
            etapa={etapa}
            primeira={indice === 0}
            ultima={indice === ETAPAS.length - 1}
          />
        ))}
      </ol>
    </div>
  );
}

const COR_DA_BOLA: Record<EstadoDaEtapa, string> = {
  cumprida: "bg-real text-white border-real",
  atual: "bg-tinta text-white border-tinta",
  parada: "bg-naopago text-white border-naopago",
  futura: "border-borda-forte bg-superficie text-tinta-fraca",
};

const COR_DO_TEXTO: Record<EstadoDaEtapa, string> = {
  cumprida: "text-tinta",
  atual: "text-tinta",
  parada: "text-naopago",
  futura: "text-tinta-fraca",
};

/** Quem assinou e quando, ou o que a etapa esta esperando. */
function apoioDaEtapa(ordem: OrdemFabricacao, etapa: EtapaOrdem, estado: EstadoDaEtapa) {
  const passo = passoDaEtapa(ordem, etapa);
  if (estado === "parada") return "Não passou — voltou para quem abriu";
  if (estado === "cumprida" && passo) {
    return `${passo.assinatura.nome} · ${dataHora(passo.assinatura.assinadoEm)}`;
  }
  if (estado === "atual") return "Esperando assinatura";
  return QUEM_FAZ_A_ETAPA[etapa];
}

function numeroDaEtapa(estado: EstadoDaEtapa, indice: number) {
  if (estado === "cumprida") return "✓";
  if (estado === "parada") return "!";
  return String(indice + 1);
}

function EtapaDeitada({ ordem, etapa }: { ordem: OrdemFabricacao; etapa: EtapaOrdem }) {
  const estado = estadoDaEtapa(ordem, etapa);
  const indice = ETAPAS.indexOf(etapa);

  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${COR_DA_BOLA[estado]}`}
      >
        {numeroDaEtapa(estado, indice)}
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${COR_DO_TEXTO[estado]}`}>
          {ROTULO_ETAPA[etapa]}
        </span>
        <span className="block text-xs text-tinta-media">{apoioDaEtapa(ordem, etapa, estado)}</span>
      </span>
    </li>
  );
}

function EtapaEmPe({
  ordem,
  etapa,
  primeira,
  ultima,
}: {
  ordem: OrdemFabricacao;
  etapa: EtapaOrdem;
  primeira: boolean;
  ultima: boolean;
}) {
  const estado = estadoDaEtapa(ordem, etapa);
  const indice = ETAPAS.indexOf(etapa);
  const traco = estado === "cumprida" ? "bg-real" : "bg-borda";

  return (
    <li className="flex-1 text-center">
      {/* A bola no meio, com meio traco de cada lado: assim a linha continua
          entre as etapas sem sobrar ponta nas extremidades. */}
      <div className="flex items-center">
        <span className={`h-0.5 flex-1 ${primeira ? "bg-transparent" : traco}`} />
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${COR_DA_BOLA[estado]}`}
        >
          {numeroDaEtapa(estado, indice)}
        </span>
        <span
          className={`h-0.5 flex-1 ${
            ultima ? "bg-transparent" : estadoDaEtapa(ordem, ETAPAS[indice + 1]!) === "cumprida" ? "bg-real" : "bg-borda"
          }`}
        />
      </div>
      <p className={`mt-2 px-1 text-xs font-semibold leading-tight ${COR_DO_TEXTO[estado]}`}>
        {ROTULO_ETAPA[etapa]}
      </p>
      <p className="mt-0.5 px-1 text-[11px] leading-tight text-tinta-media">
        {apoioDaEtapa(ordem, etapa, estado)}
      </p>
    </li>
  );
}
