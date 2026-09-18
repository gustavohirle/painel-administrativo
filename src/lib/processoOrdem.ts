/**
 * As regras do processo de fabricacao. Funcoes PURAS.
 *
 * Quem pode agir em cada etapa, o que cada etapa exige para ser assinada, e
 * para onde a ordem vai depois. Mora aqui, e nao dentro da Server Action, pelo
 * mesmo motivo de `lib/usuarios.ts`: sao as travas que so aparecem no dia em
 * que alguem tenta, e nesse dia o painel ja esta em producao.
 *
 * As tres que importam:
 *
 * 1. **So o responsavel da etapa assina.** A conferencia nao assina a
 *    fabricacao, e o administrador nao assina pela fabrica. Um documento em que
 *    uma pessoa so carimba todas as etapas nao prova nada -- que e exatamente o
 *    processo por mensagem que isto veio substituir.
 * 2. **A conferencia decide se a ordem anda.** Faltou insumo, ou a fabrica nao
 *    cumpre a data? A ordem VOLTA para quem abriu. Sem isso, as seis perguntas
 *    da conferencia seriam decoracao.
 * 3. **Cada passo e definitivo.** Nao ha "editar o passo anterior": o caminho
 *    de volta e o administrador retomar a ordem, e isso fica registrado como
 *    mais um passo. Documento que muda depois de assinado nao prova nada.
 */

import {
  ETAPAS,
  ITENS_DE_CONFERENCIA,
  indiceDaEtapa,
  proximaEtapa,
  QUANTIDADE_MAXIMA,
  ROTULO_ETAPA,
  type DadosConferencia,
  type EtapaOrdem,
  type OrdemFabricacao,
  type PassoDaOrdem,
  type QuantidadePorItem,
} from "@/types/ordemFabricacao";
import type { PerfilUsuario, UsuarioPublico } from "@/types/usuario";

// ---------------------------------------------------------------------------
// Quem faz o que
// ---------------------------------------------------------------------------

/**
 * O perfil que assina cada etapa.
 *
 * `contagem` e `envio` sao do mesmo perfil de proposito: e a mesma pessoa,
 * fazendo duas coisas diferentes -- contou o que saiu da fabrica, e depois
 * despachou. Juntar as duas num passo so perderia a data do despacho, que e o
 * que se procura quando a carga some no caminho.
 */
export const PERFIL_DA_ETAPA: Record<EtapaOrdem, PerfilUsuario> = {
  abertura: "dono",
  conferencia: "conferencia",
  fabricacao: "fabricacao",
  contagem: "estoque_demazon",
  envio: "estoque_demazon",
  recebimento: "estoque_criar",
};

/** Etapas que este perfil assina. Vazio para quem nao entra no processo. */
export function etapasDoPerfil(perfil: PerfilUsuario): EtapaOrdem[] {
  return ETAPAS.filter((e) => PERFIL_DA_ETAPA[e] === perfil);
}

/**
 * Esta pessoa pode assinar a etapa em que a ordem esta agora?
 *
 * O administrador NAO e curinga. Ele abre a ordem e decide na revisao, e so.
 * Deixar o dono assinar qualquer etapa pareceria conveniente e destruiria a
 * unica coisa que o documento afirma: que cada parte conferiu a sua.
 */
export function podeAssinar(ordem: OrdemFabricacao, usuario: UsuarioPublico): boolean {
  if (ordem.situacao !== "andamento" || ordem.etapaAtual === null) return false;
  return PERFIL_DA_ETAPA[ordem.etapaAtual] === usuario.perfil;
}

/** So quem abriu, ou outro administrador, decide numa ordem em revisao. */
export function podeDecidirNaRevisao(
  ordem: OrdemFabricacao,
  usuario: UsuarioPublico,
): boolean {
  return ordem.situacao === "revisao" && usuario.perfil === "dono";
}

/** Cancelar e do administrador, a qualquer momento antes do fim. */
export function podeCancelar(
  ordem: OrdemFabricacao,
  usuario: UsuarioPublico,
): boolean {
  const aberta = ordem.situacao === "andamento" || ordem.situacao === "revisao";
  return aberta && usuario.perfil === "dono";
}

// ---------------------------------------------------------------------------
// O que cada etapa exige
// ---------------------------------------------------------------------------

/**
 * A conferencia passou?
 *
 * Todas as cinco respostas precisam ser SIM **e** a fabrica precisa cumprir a
 * data. Qualquer nao manda a ordem de volta para quem abriu -- e por isso que
 * a resposta negativa nao e um erro de formulario: e um resultado legitimo da
 * etapa, que a pessoa assina do mesmo jeito.
 */
export function conferenciaAprova(dados: DadosConferencia): boolean {
  return ITENS_DE_CONFERENCIA.every((i) => dados.respostas[i] === true) && dados.cumpreAData;
}

/** O que falta, em texto, para a tela e para o e-mail dizerem por que voltou. */
export function motivosDaConferencia(dados: DadosConferencia): string[] {
  const motivos = ITENS_DE_CONFERENCIA.filter((i) => dados.respostas[i] !== true).map(
    (i) => PENDENCIA_DE_CONFERENCIA[i],
  );
  if (!dados.cumpreAData) {
    motivos.push(
      dados.dataPossivel
        ? `A fabricação só fica pronta em ${dados.dataPossivel}`
        : "A fabricação não fica pronta na data pedida",
    );
  }
  return motivos;
}

/** A pendencia escrita como falta, e nao como pergunta. */
const PENDENCIA_DE_CONFERENCIA: Record<(typeof ITENS_DE_CONFERENCIA)[number], string> = {
  embalagem: "Falta embalagem",
  tampa: "Falta a tampa/válvula",
  tampaCorreta: "A tampa/válvula não serve para esta embalagem",
  caixa: "Falta a caixa do produto",
  materiaPrima: "Falta matéria-prima",
};

/**
 * Quantidades validas? Devolve o motivo quando nao.
 *
 * Zero e ACEITO: fabricar zero de um item e um resultado possivel, e esconder
 * isso obrigaria a pessoa a mentir um numero para conseguir assinar. O que nao
 * passa e numero que nao e numero, negativo, ou item que nao esta na ordem.
 */
export function problemaNasQuantidades(
  ordem: OrdemFabricacao,
  quantidades: QuantidadePorItem,
): string | null {
  const chaves = new Set(ordem.itens.map((i) => i.chave));

  for (const item of ordem.itens) {
    const valor = quantidades[item.chave];
    if (typeof valor !== "number" || !Number.isFinite(valor)) {
      return `Informe a quantidade de "${item.nome}".`;
    }
    if (!Number.isInteger(valor) || valor < 0) {
      return `A quantidade de "${item.nome}" precisa ser um número inteiro, de zero para cima.`;
    }
    if (valor > QUANTIDADE_MAXIMA) {
      return `A quantidade de "${item.nome}" passou do limite.`;
    }
  }

  for (const chave of Object.keys(quantidades)) {
    if (!chaves.has(chave as never)) return "Há uma quantidade de um item que não está nesta ordem.";
  }

  return null;
}

/**
 * O passo esta completo para a etapa dele? Devolve o motivo quando nao.
 *
 * Conferida no servidor, sempre: o formulario do navegador ajuda a pessoa, mas
 * a Server Action e endereco publico (5.13) e recebe o que mandarem.
 */
export function problemaNoPasso(
  ordem: OrdemFabricacao,
  passo: PassoDaOrdem,
): string | null {
  switch (passo.etapa) {
    case "conferencia": {
      const dados = passo.conferencia;
      if (!dados) return "A conferência precisa das respostas do checklist.";
      for (const item of ITENS_DE_CONFERENCIA) {
        if (typeof dados.respostas[item] !== "boolean") {
          return "Responda a todas as perguntas da conferência.";
        }
      }
      if (!dados.cumpreAData && !dados.dataPossivel) {
        return "Informe para quando a fabricação fica pronta.";
      }
      return null;
    }
    case "fabricacao": {
      const dados = passo.fabricacao;
      if (!dados?.dataFabricacao) return "Informe a data em que a fabricação terminou.";
      return problemaNasQuantidades(ordem, dados.quantidades);
    }
    case "contagem": {
      const dados = passo.contagem;
      if (!dados?.dataContagem) return "Informe a data da contagem.";
      return problemaNasQuantidades(ordem, dados.quantidades);
    }
    case "envio": {
      if (!passo.envio?.dataEnvio) return "Informe a data do envio.";
      return null;
    }
    case "recebimento": {
      const dados = passo.recebimento;
      if (!dados?.dataRecebimento) return "Informe a data do recebimento.";
      return problemaNasQuantidades(ordem, dados.quantidades);
    }
    case "abertura":
      return null;
  }
}

// ---------------------------------------------------------------------------
// Andar
// ---------------------------------------------------------------------------

export interface ResultadoDoPasso {
  ordem: OrdemFabricacao;
  /** Etapa que passou a esperar alguem. `null` quando a ordem acabou. */
  proxima: EtapaOrdem | null;
  /** `true` quando a conferencia devolveu a ordem para quem abriu. */
  voltouParaRevisao: boolean;
}

/**
 * Aplica um passo assinado e devolve a ordem no estado seguinte.
 *
 * Nao grava nada: quem chama e que persiste. Assim a regra inteira do processo
 * cabe num teste sem banco, e e ela que decide -- a action so obedece.
 */
export function aplicarPasso(
  ordem: OrdemFabricacao,
  passo: PassoDaOrdem,
  agora: Date,
): ResultadoDoPasso {
  const passos = [...ordem.passos, passo];

  // A conferencia e a unica etapa que pode mandar a ordem para tras.
  if (passo.etapa === "conferencia" && passo.conferencia && !conferenciaAprova(passo.conferencia)) {
    return {
      ordem: { ...ordem, passos, situacao: "revisao", etapaAtual: "conferencia" },
      proxima: null,
      voltouParaRevisao: true,
    };
  }

  const proxima = proximaEtapa(passo.etapa);

  if (proxima === null) {
    return {
      ordem: {
        ...ordem,
        passos,
        situacao: "concluida",
        etapaAtual: null,
        fechadoEm: agora.toISOString(),
      },
      proxima: null,
      voltouParaRevisao: false,
    };
  }

  return {
    ordem: { ...ordem, passos, situacao: "andamento", etapaAtual: proxima },
    proxima,
    voltouParaRevisao: false,
  };
}

/**
 * O administrador aceita a nova data e devolve a ordem para a conferencia.
 *
 * A data do pedido e REESCRITA, e o passo de abertura novo registra isso: o
 * documento passa a afirmar a data acordada, e o historico mostra qual era
 * antes. Manter a data antiga faria a ordem nascer atrasada para sempre.
 */
export function retomarOrdem(
  ordem: OrdemFabricacao,
  novaData: string,
  passo: PassoDaOrdem,
): OrdemFabricacao {
  return {
    ...ordem,
    dataLancamento: novaData,
    passos: [...ordem.passos, passo],
    situacao: "andamento",
    etapaAtual: "conferencia",
  };
}

export function cancelarOrdem(
  ordem: OrdemFabricacao,
  motivo: string,
  agora: Date,
): OrdemFabricacao {
  return {
    ...ordem,
    situacao: "cancelada",
    etapaAtual: null,
    motivoCancelamento: motivo,
    fechadoEm: agora.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Leitura para a tela
// ---------------------------------------------------------------------------

/** Etapa cumprida, em andamento, ou ainda por vir -- para a linha do tempo. */
export type EstadoDaEtapa = "cumprida" | "atual" | "futura" | "parada";

export function estadoDaEtapa(ordem: OrdemFabricacao, etapa: EtapaOrdem): EstadoDaEtapa {
  if (ordem.situacao === "revisao" && etapa === "conferencia") return "parada";
  if (ordem.etapaAtual === etapa && ordem.situacao === "andamento") return "atual";

  const cumpridas = new Set(ordem.passos.map((p) => p.etapa));
  if (cumpridas.has(etapa)) {
    // Na revisao a conferencia ja aconteceu, mas nao vale como cumprida.
    if (ordem.situacao === "revisao" && indiceDaEtapa(etapa) >= indiceDaEtapa("conferencia")) {
      return "futura";
    }
    return "cumprida";
  }
  return "futura";
}

/**
 * Dias entre hoje e a data de lancamento. Negativo = atrasada.
 *
 * Data de CALENDARIO comparada com data de calendario: `new Date("2026-10-12")`
 * produz meia-noite em UTC, que no Brasil ainda e dia 11 (ver `dataCalendario`
 * em lib/format). Por isso a conta e feita sobre o texto, sem fuso nenhum.
 */
export function diasAteOLancamento(dataLancamento: string, hoje: string): number {
  const dia = (texto: string) => {
    const [ano, mes, d] = texto.split("-").map(Number);
    return Date.UTC(ano ?? 0, (mes ?? 1) - 1, d ?? 1);
  };
  return Math.round((dia(dataLancamento) - dia(hoje)) / 86_400_000);
}

export interface OrdemNaFila {
  ordem: OrdemFabricacao;
  /** `true` quando esta pessoa e quem tem que agir agora. */
  minha: boolean;
  dias: number;
}

/**
 * A fila de quem esta olhando: primeiro o que e dele, depois o mais urgente.
 *
 * Ordenar so por data deixaria a ordem da pessoa no meio da lista, e a
 * pergunta que ela abre o painel para responder e "o que esta comigo?".
 */
export function montarFila(
  ordens: OrdemFabricacao[],
  usuario: UsuarioPublico,
  hoje: string,
): OrdemNaFila[] {
  return ordens
    .map((ordem) => ({
      ordem,
      minha: podeAssinar(ordem, usuario) || podeDecidirNaRevisao(ordem, usuario),
      dias: diasAteOLancamento(ordem.dataLancamento, hoje),
    }))
    .sort(
      (a, b) =>
        Number(b.minha) - Number(a.minha) ||
        a.dias - b.dias ||
        a.ordem.numero.localeCompare(b.ordem.numero),
    );
}

/** Uma linha por etapa, para o assunto do e-mail e para a lista. */
export function ondeEstaAOrdem(ordem: OrdemFabricacao): string {
  if (ordem.situacao === "revisao") return "Voltou para o administrador";
  if (ordem.etapaAtual === null) return ROTULO_SITUACAO_CURTO[ordem.situacao];
  return ROTULO_ETAPA[ordem.etapaAtual];
}

const ROTULO_SITUACAO_CURTO: Record<string, string> = {
  concluida: "Concluída",
  cancelada: "Cancelada",
  andamento: "Em andamento",
  revisao: "Voltou para o administrador",
};
