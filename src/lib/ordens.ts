/**
 * Ordem de fabricacao: numeracao, assinatura, hash e a montagem do documento.
 *
 * Tudo aqui e funcao PURA -- a unica excecao e `gerarDocumento`, que carimba
 * uma data, e ela recebe o valor de fora nos testes, para que os bytes do PDF
 * sejam reproduziveis: e o que permite o teste conferir o hash do arquivo em
 * vez de so verificar que ele foi gerado.
 *
 * O desenho do documento mora aqui, e nao num componente, pelo mesmo motivo
 * que `lib/metrics.ts` nao importa React: o PDF e gerado no servidor, no
 * momento em que a ordem fecha, e precisa sair identico daqui a dois anos.
 *
 * As regras de QUEM faz o que ficam em `lib/processoOrdem.ts`.
 */

import { createHash } from "node:crypto";

import { dataCalendario, dataHora, inteiro } from "@/lib/format";
import {
  A4_RETRATO,
  montarPdf,
  quebrarTexto,
  sha256,
  truncarTexto,
  type Desenho,
} from "@/lib/pdf";
import {
  ETAPAS,
  ITENS_DE_CONFERENCIA,
  PERGUNTA_DE_CONFERENCIA,
  PROPORCAO_ASSINATURA,
  QUEM_FAZ_A_ETAPA,
  ROTULO_ETAPA,
  ROTULO_SITUACAO,
  passoDaEtapa,
  unidadesDaOrdem,
  type DocumentoOrdem,
  type OrdemFabricacao,
  type PassoDaOrdem,
} from "@/types/ordemFabricacao";

// ---------------------------------------------------------------------------
// Numeracao
// ---------------------------------------------------------------------------

/**
 * "OF-2026-0007". Sequencial por ano.
 *
 * Por ano, e nao continuo, porque e o numero que as pessoas vao falar no
 * telefone e escrever na caixa: "a OF sete deste ano". Um contador eterno
 * chegaria a cinco digitos e perderia essa propriedade.
 *
 * O maior numero JA USADO no ano manda, nao a contagem de ordens: cancelar uma
 * ordem nao pode fazer a proxima reaproveitar o numero dela.
 */
export function proximoNumero(ordens: OrdemFabricacao[], quando = new Date()): string {
  const ano = quando.getFullYear();
  const prefixo = `OF-${ano}-`;

  const maior = ordens
    .filter((o) => o.numero.startsWith(prefixo))
    .reduce((maximo, o) => Math.max(maximo, Number(o.numero.slice(prefixo.length)) || 0), 0);

  return `${prefixo}${String(maior + 1).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------

/** Pontos por traco e tracos por assinatura. Teto contra payload absurdo. */
const MAXIMO_DE_TRACOS = 200;
const MAXIMO_DE_PONTOS_POR_TRACO = 600;

/**
 * Limpa os tracos que chegaram do navegador.
 *
 * Isto e validacao de entrada, nao arredondamento por estetica: os numeros vem
 * de um `<form>` e vao direto para um gerador de PDF. Um `NaN` ou um `1e9` no
 * meio da lista produziria um arquivo corrompido, e um array de cem mil pontos
 * encheria o banco.
 *
 * Tres casas decimais dao precisao de ~0,2mm num quadro de 70mm -- muito
 * abaixo do que a mao consegue, e mantem o JSON pequeno.
 */
export function normalizarTracos(bruto: unknown): number[][] {
  if (!Array.isArray(bruto)) return [];

  const tracos: number[][] = [];

  for (const traco of bruto.slice(0, MAXIMO_DE_TRACOS)) {
    if (!Array.isArray(traco)) continue;

    const pontos: number[] = [];
    let corrompido = false;

    for (const valor of traco.slice(0, MAXIMO_DE_PONTOS_POR_TRACO * 2)) {
      /*
       * So numero, e nada de `Number(valor)`.
       *
       * `Number(null)` e `Number("")` valem ZERO, nao NaN. Convertendo, um
       * `null` no meio da lista viraria uma coordenada valida e todos os
       * pontos seguintes trocariam de eixo -- x lido como y. A assinatura
       * sairia embaralhada em vez de faltar, que e muito pior.
       */
      if (typeof valor !== "number" || !Number.isFinite(valor)) {
        corrompido = true;
        break;
      }
      pontos.push(Number(Math.min(1, Math.max(0, valor)).toFixed(3)));
    }

    // Traco com lixo dentro e descartado inteiro: nao da para saber onde o
    // par x/y se perdeu, e remendar significaria adivinhar.
    if (corrompido) continue;

    // Numero impar de coordenadas nao forma pontos: descarta o resto.
    if (pontos.length >= 4) tracos.push(pontos.slice(0, pontos.length - (pontos.length % 2)));
  }

  return tracos;
}

/** Uma assinatura precisa de tinta. Quadro em branco nao assina nada. */
export function assinaturaTemTinta(tracos: number[][]): boolean {
  return tracos.reduce((total, t) => total + t.length, 0) >= 8;
}

// ---------------------------------------------------------------------------
// Hash do conteudo
// ---------------------------------------------------------------------------

/**
 * SHA-256 do que o documento AFIRMA, em forma canonica.
 *
 * Sai impresso no rodape do PDF. Serve para responder "este papel corresponde
 * ao registro?" sem precisar comparar o arquivo inteiro -- e, ao contrario do
 * hash dos bytes, pode viver dentro do proprio documento, porque nao depende
 * dele.
 *
 * A forma canonica e montada campo a campo, na mao. `JSON.stringify(ordem)`
 * nao serviria: a ordem das chaves de um objeto lido do banco nao e a mesma de
 * um objeto recem-criado, e o hash mudaria sem o conteudo mudar.
 *
 * TODOS os passos entram. Um hash que cobrisse so o pedido continuaria valendo
 * depois de alguem trocar quem assinou a fabricacao, e e justamente isso que
 * ele existe para impedir.
 */
export function hashDoConteudo(ordem: OrdemFabricacao): string {
  const canonico = [
    ordem.numero,
    ordem.dataLancamento,
    ordem.observacao ?? "",
    ...ordem.itens.map((i) => `${i.chave}|${i.nome}|${i.sku ?? ""}|${i.quantidade}`),
    ...ordem.passos.map((p) =>
      [
        p.etapa,
        p.assinatura.nome,
        p.assinatura.assinadoEm,
        p.conferencia
          ? `${ITENS_DE_CONFERENCIA.map((i) => (p.conferencia?.respostas[i] ? "1" : "0")).join("")}|${
              p.conferencia.cumpreAData ? "1" : "0"
            }`
          : "",
        somaDasQuantidades(p),
      ].join("|"),
    ),
  ].join("\n");

  return createHash("sha256").update(canonico, "utf8").digest("hex");
}

/** Total registrado no passo, ou vazio quando a etapa nao conta unidades. */
function somaDasQuantidades(passo: PassoDaOrdem): string {
  const dados = passo.fabricacao ?? passo.contagem ?? passo.recebimento;
  if (!dados) return "";
  return Object.entries(dados.quantidades)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, valor]) => `${chave}:${valor}`)
    .join(",");
}

/** "a91f 3c02 ..." -- hash quebrado em blocos, para conferir a olho. */
export function hashLegivel(hash: string): string {
  return (hash.match(/.{1,4}/g) ?? []).slice(0, 8).join(" ");
}

// ---------------------------------------------------------------------------
// Desenho do documento
// ---------------------------------------------------------------------------

const MARGEM = 48;
const DIREITA = A4_RETRATO.largura - MARGEM;
const LARGURA_UTIL = DIREITA - MARGEM;
const RODAPE = A4_RETRATO.altura - 54;

const CINZA_ROTULO = 0.45;
const CINZA_APOIO = 0.6;

interface OpcoesDocumento {
  demonstracao: boolean;
  geradoEm: Date;
}

/**
 * Layout do documento, pagina a pagina.
 *
 * Exportado para o teste poder inspecionar o que foi desenhado sem ter que
 * abrir um PDF -- e a mesma ideia dos graficos, cujos dados sao testados antes
 * de virarem SVG.
 */
export function desenharOrdem(
  ordem: OrdemFabricacao,
  opcoes: OpcoesDocumento,
): Desenho[][] {
  const paginas: Desenho[][] = [];
  let atual: Desenho[] = [];
  let y = 0;

  const abrirPagina = () => {
    atual = [];
    paginas.push(atual);
    y = opcoes.demonstracao ? 86 : 58;
    if (opcoes.demonstracao) atual.push(...tarjaDeDemonstracao());
  };

  /** Quebra a pagina se o bloco a desenhar nao couber inteiro nesta. */
  const garantirEspaco = (altura: number) => {
    if (y + altura > RODAPE - 16) abrirPagina();
  };

  abrirPagina();

  // --- Titulo --------------------------------------------------------------

  atual.push(
    { tipo: "texto", x: MARGEM, y, texto: "ORDEM DE FABRICAÇÃO", tamanho: 17, negrito: true },
    { tipo: "texto", x: DIREITA, y, texto: ordem.numero, tamanho: 15, negrito: true, alinhamento: "direita" },
  );
  y += 12;
  atual.push({ tipo: "linha", x1: MARGEM, y1: y, x2: DIREITA, y2: y, espessura: 1.4, cor: 0.15 });
  y += 20;

  atual.push(
    {
      tipo: "texto",
      x: MARGEM,
      y,
      texto: `Aberta em ${dataHora(ordem.criadoEm)}`,
      tamanho: 9,
      cor: CINZA_ROTULO,
    },
    {
      tipo: "texto",
      x: DIREITA,
      y,
      texto: ROTULO_SITUACAO[ordem.situacao].toUpperCase(),
      tamanho: 9,
      negrito: true,
      cor: 0.2,
      alinhamento: "direita",
    },
  );
  y += 30;

  // --- Dados do pedido -----------------------------------------------------

  y = titulo(atual, y, "DADOS DO PEDIDO");

  y = campo(atual, y, "Data de lançamento", dataCalendario(ordem.dataLancamento));
  y = campo(
    atual,
    y,
    "Volume pedido",
    `${inteiro(unidadesDaOrdem(ordem))} unidade(s) em ${ordem.itens.length} item(ns)`,
  );

  if (ordem.observacao) {
    const linhas = quebrarTexto(ordem.observacao, LARGURA_UTIL - 132, 10);
    atual.push({ tipo: "texto", x: MARGEM, y, texto: "Observação", tamanho: 8.5, cor: CINZA_ROTULO });
    for (const [indice, linha] of linhas.entries()) {
      atual.push({ tipo: "texto", x: MARGEM + 132, y: y + indice * 13, texto: linha, tamanho: 10 });
    }
    y += Math.max(1, linhas.length) * 13 + 5;
  }

  y += 16;

  // --- Itens ---------------------------------------------------------------

  const recebimento = passoDaEtapa(ordem, "recebimento");
  const fabricacao = passoDaEtapa(ordem, "fabricacao");

  y = titulo(atual, y, "ITENS");

  const xSku = MARGEM + 240;
  const xPedido = MARGEM + 340;
  const xFabricado = MARGEM + 420;

  const cabecalhoDaTabela = () => {
    atual.push(
      { tipo: "texto", x: MARGEM, y, texto: "Produto", tamanho: 8.5, negrito: true, cor: CINZA_ROTULO },
      { tipo: "texto", x: xSku, y, texto: "SKU", tamanho: 8.5, negrito: true, cor: CINZA_ROTULO },
      { tipo: "texto", x: xPedido, y, texto: "Pedido", tamanho: 8.5, negrito: true, cor: CINZA_ROTULO, alinhamento: "direita" },
      { tipo: "texto", x: xFabricado, y, texto: "Fabricado", tamanho: 8.5, negrito: true, cor: CINZA_ROTULO, alinhamento: "direita" },
      { tipo: "texto", x: DIREITA, y, texto: "Recebido", tamanho: 8.5, negrito: true, cor: CINZA_ROTULO, alinhamento: "direita" },
    );
    y += 6;
    atual.push({ tipo: "linha", x1: MARGEM, y1: y, x2: DIREITA, y2: y, espessura: 0.8, cor: 0.4 });
    y += 15;
  };

  cabecalhoDaTabela();

  let totalFabricado = 0;
  let totalRecebido = 0;

  for (const item of ordem.itens) {
    if (y + 18 > RODAPE - 120) {
      abrirPagina();
      y = titulo(atual, y, "ITENS (continuação)");
      cabecalhoDaTabela();
    }

    const fab = fabricacao?.fabricacao?.quantidades[item.chave];
    const rec = recebimento?.recebimento?.quantidades[item.chave];
    totalFabricado += fab ?? 0;
    totalRecebido += rec ?? 0;

    atual.push(
      {
        tipo: "texto",
        x: MARGEM,
        y,
        // Truncar em vez de deixar invadir: nome de produto nao tem teto de
        // tamanho e as colunas de quantidade tem que continuar legiveis.
        texto: truncarTexto(item.nome, 230, 10),
        tamanho: 10,
      },
      { tipo: "texto", x: xSku, y, texto: truncarTexto(item.sku ?? "--", 92, 9), tamanho: 9, cor: CINZA_APOIO },
      { tipo: "texto", x: xPedido, y, texto: inteiro(item.quantidade), tamanho: 10, alinhamento: "direita" },
      {
        tipo: "texto",
        x: xFabricado,
        y,
        texto: fab === undefined ? "--" : inteiro(fab),
        tamanho: 10,
        alinhamento: "direita",
        cor: fab !== undefined && fab < item.quantidade ? 0.1 : 0.35,
        negrito: fab !== undefined && fab < item.quantidade,
      },
      {
        tipo: "texto",
        x: DIREITA,
        y,
        texto: rec === undefined ? "--" : inteiro(rec),
        tamanho: 10,
        negrito: true,
        alinhamento: "direita",
      },
    );
    y += 17;
  }

  y += 1;
  atual.push({ tipo: "linha", x1: MARGEM, y1: y, x2: DIREITA, y2: y, espessura: 0.8, cor: 0.4 });
  y += 15;
  atual.push(
    { tipo: "texto", x: MARGEM, y, texto: "Total", tamanho: 10, negrito: true },
    { tipo: "texto", x: xPedido, y, texto: inteiro(unidadesDaOrdem(ordem)), tamanho: 10, negrito: true, alinhamento: "direita" },
    {
      tipo: "texto",
      x: xFabricado,
      y,
      texto: fabricacao ? inteiro(totalFabricado) : "--",
      tamanho: 10,
      negrito: true,
      alinhamento: "direita",
    },
    {
      tipo: "texto",
      x: DIREITA,
      y,
      texto: recebimento ? inteiro(totalRecebido) : "--",
      tamanho: 11,
      negrito: true,
      alinhamento: "direita",
    },
  );
  y += 30;

  // --- O que cada etapa registrou -----------------------------------------

  const conferencia = passoDaEtapa(ordem, "conferencia");
  if (conferencia?.conferencia) {
    garantirEspaco(30 + ITENS_DE_CONFERENCIA.length * 14);
    y = titulo(atual, y, "CONFERÊNCIA DE INSUMOS");

    for (const item of ITENS_DE_CONFERENCIA) {
      const sim = conferencia.conferencia.respostas[item] === true;
      atual.push(
        { tipo: "texto", x: MARGEM, y, texto: PERGUNTA_DE_CONFERENCIA[item], tamanho: 9.5 },
        {
          tipo: "texto",
          x: DIREITA,
          y,
          texto: sim ? "SIM" : "NÃO",
          tamanho: 9.5,
          negrito: true,
          cor: sim ? 0.25 : 0.1,
          alinhamento: "direita",
        },
      );
      y += 14;
    }

    const cumpre = conferencia.conferencia.cumpreAData;
    atual.push(
      { tipo: "texto", x: MARGEM, y, texto: "Fica pronto na data pedida?", tamanho: 9.5 },
      {
        tipo: "texto",
        x: DIREITA,
        y,
        texto: cumpre
          ? "SIM"
          : `NÃO -- ${conferencia.conferencia.dataPossivel ? dataCalendario(conferencia.conferencia.dataPossivel) : "sem data"}`,
        tamanho: 9.5,
        negrito: true,
        cor: 0.1,
        alinhamento: "direita",
      },
    );
    y += 26;
  }

  const datas: Array<[string, string | undefined]> = [
    ["Fabricação concluída em", fabricacao?.fabricacao?.dataFabricacao],
    ["Contado na Demazon em", passoDaEtapa(ordem, "contagem")?.contagem?.dataContagem],
    ["Enviado para a Criar em", passoDaEtapa(ordem, "envio")?.envio?.dataEnvio],
    ["Recebido na Criar em", recebimento?.recebimento?.dataRecebimento],
  ].filter((par): par is [string, string] => Boolean(par[1]));

  if (datas.length > 0) {
    garantirEspaco(24 + datas.length * 18);
    y = titulo(atual, y, "DATAS DO PROCESSO");
    for (const [rotulo, valor] of datas) y = campo(atual, y, rotulo, dataCalendario(valor!));
    y += 12;
  }

  // --- Assinaturas ---------------------------------------------------------

  /*
   * Uma moldura por etapa, em duas colunas.
   *
   * Com seis etapas isto e uma folha de assinaturas, e nao duas caixinhas lado
   * a lado: cada bloco diz a etapa, quem assinou e quando. Etapa nao cumprida
   * aparece com a moldura vazia -- num documento de ordem cancelada e isso que
   * mostra ate onde o processo chegou.
   *
   * O laco fica aqui, e nao numa funcao a parte, porque precisa de `atual` e
   * `y`: passar os dois por closure para fora so escondia a quebra de pagina.
   */
  const espaco = 26;
  const largura = (LARGURA_UTIL - espaco) / 2;
  const alturaDaMoldura = largura / PROPORCAO_ASSINATURA;
  const alturaDoBloco = alturaDaMoldura + 56;

  y = titulo(atual, y, "ASSINATURAS");

  for (let i = 0; i < ETAPAS.length; i += 2) {
    garantirEspaco(alturaDoBloco);

    for (const [coluna, etapa] of [ETAPAS[i], ETAPAS[i + 1]].entries()) {
      if (!etapa) continue;
      const x = MARGEM + coluna * (largura + espaco);
      const passo = passoDaEtapa(ordem, etapa);

      atual.push({
        tipo: "retangulo",
        x,
        y,
        largura,
        altura: alturaDaMoldura,
        contorno: 0.72,
        espessura: 0.7,
      });

      if (passo) {
        atual.push(...tracosNaMoldura(passo.assinatura.tracos, x, y, largura, alturaDaMoldura));
      } else {
        atual.push({
          tipo: "texto",
          x: x + largura / 2,
          y: y + alturaDaMoldura / 2 + 3,
          texto: "não assinada",
          tamanho: 9,
          cor: 0.68,
          alinhamento: "centro",
        });
      }

      let linha = y + alturaDaMoldura + 13;
      atual.push({
        tipo: "texto",
        x,
        y: linha,
        texto: truncarTexto(passo?.assinatura.nome ?? "--", largura, 10.5, true),
        tamanho: 10.5,
        negrito: true,
      });
      linha += 12;

      atual.push({
        tipo: "texto",
        x,
        y: linha,
        texto: `${ROTULO_ETAPA[etapa]} -- ${QUEM_FAZ_A_ETAPA[etapa]}`,
        tamanho: 7.5,
        cor: CINZA_ROTULO,
      });
      linha += 11;

      if (passo) {
        atual.push({
          tipo: "texto",
          x,
          y: linha,
          texto: `Assinado em ${dataHora(passo.assinatura.assinadoEm)}`,
          tamanho: 7.5,
          cor: CINZA_ROTULO,
        });
      }
    }

    y += alturaDoBloco;
  }

  // --- Cancelamento --------------------------------------------------------

  if (ordem.situacao === "cancelada" && ordem.motivoCancelamento) {
    garantirEspaco(40);
    y += 12;
    for (const linha of quebrarTexto(`Motivo do cancelamento: ${ordem.motivoCancelamento}`, LARGURA_UTIL, 10)) {
      atual.push({ tipo: "texto", x: MARGEM, y, texto: linha, tamanho: 10 });
      y += 13;
    }
  }

  // --- Rodape, em todas as paginas ----------------------------------------

  const hash = hashDoConteudo(ordem);
  for (const [indice, pagina] of paginas.entries()) {
    pagina.push(
      { tipo: "linha", x1: MARGEM, y1: RODAPE, x2: DIREITA, y2: RODAPE, espessura: 0.6, cor: 0.75 },
      {
        tipo: "texto",
        x: MARGEM,
        y: RODAPE + 12,
        texto: `${ordem.numero} -- conteúdo SHA-256 ${hashLegivel(hash)}`,
        tamanho: 7.5,
        cor: CINZA_APOIO,
      },
      {
        tipo: "texto",
        x: DIREITA,
        y: RODAPE + 12,
        texto: `Página ${indice + 1} de ${paginas.length}`,
        tamanho: 7.5,
        cor: CINZA_APOIO,
        alinhamento: "direita",
      },
      {
        tipo: "texto",
        x: MARGEM,
        y: RODAPE + 22,
        texto: `Gerado pelo Painel Administrativo em ${dataHora(opcoes.geradoEm)}.`,
        tamanho: 7.5,
        cor: CINZA_APOIO,
      },
    );
  }

  return paginas;
}

function titulo(pagina: Desenho[], y: number, texto: string): number {
  pagina.push({ tipo: "texto", x: MARGEM, y, texto, tamanho: 9, negrito: true, cor: 0.3 });
  return y + 18;
}

function campo(pagina: Desenho[], y: number, rotulo: string, valor: string): number {
  pagina.push(
    { tipo: "texto", x: MARGEM, y, texto: rotulo, tamanho: 8.5, cor: CINZA_ROTULO },
    { tipo: "texto", x: MARGEM + 150, y, texto: valor, tamanho: 10.5, negrito: true },
  );
  return y + 18;
}

/**
 * Tarja de demonstracao.
 *
 * O selo e obrigatorio na tela (secao 2) e mais ainda aqui: o PDF sai do
 * painel e vai para outra pessoa, que nao viu de onde ele veio. Um documento
 * de teste circulando sem aviso e exatamente o acidente que o selo evita.
 */
function tarjaDeDemonstracao(): Desenho[] {
  return [
    { tipo: "retangulo", x: 0, y: 0, largura: A4_RETRATO.largura, altura: 30, preenchimento: 0.92 },
    {
      tipo: "texto",
      x: A4_RETRATO.largura / 2,
      y: 19,
      texto: "DOCUMENTO DE DEMONSTRAÇÃO -- dados fictícios, sem validade",
      tamanho: 9,
      negrito: true,
      cor: 0.35,
      alinhamento: "centro",
    },
  ];
}

/**
 * Tracos normalizados -> coordenadas da pagina.
 *
 * Nao ha correcao de proporcao aqui, e nao deveria haver: o quadro na tela e
 * esta moldura tem a mesma razao largura/altura, fixada em
 * `PROPORCAO_ASSINATURA`. Corrigir aqui esconderia uma divergencia entre os
 * dois em vez de impedi-la.
 */
function tracosNaMoldura(
  tracos: number[][],
  x: number,
  y: number,
  largura: number,
  altura: number,
): Desenho[] {
  const recuo = 8;
  const util = { largura: largura - recuo * 2, altura: altura - recuo * 2 };

  return tracos.map((traco) => {
    const pontos: number[] = [];
    for (let i = 0; i + 1 < traco.length; i += 2) {
      pontos.push(
        x + recuo + (traco[i] ?? 0) * util.largura,
        y + recuo + (traco[i + 1] ?? 0) * util.altura,
      );
    }
    return { tipo: "traco", pontos, espessura: 1.3, cor: 0.08 };
  });
}

// ---------------------------------------------------------------------------
// Geracao
// ---------------------------------------------------------------------------

/**
 * Gera o PDF congelado da ordem.
 *
 * Chamado UMA vez, quando a ordem fecha -- no recebimento na Criar, ou no
 * cancelamento. Dali em diante o painel serve os bytes guardados, nunca
 * regenera: um documento que se reconstroi a cada download mudaria junto com o
 * codigo que o desenha, e as assinaturas deixariam de se referir a alguma
 * coisa fixa.
 */
export function gerarDocumento(
  ordem: OrdemFabricacao,
  opcoes: OpcoesDocumento,
): DocumentoOrdem {
  const paginas = desenharOrdem(ordem, opcoes);

  const bytes = montarPdf(paginas, {
    titulo: `Ordem de fabricação ${ordem.numero}`,
    autor: "Painel Administrativo",
    assunto: `Processo de fabricacao com ${ordem.passos.length} etapa(s) assinada(s)`,
    criadoEm: opcoes.geradoEm,
  });

  return {
    base64: bytes.toString("base64"),
    sha256: sha256(bytes),
    hashConteudo: hashDoConteudo(ordem),
    geradoEm: opcoes.geradoEm.toISOString(),
    bytes: bytes.length,
  };
}

// ---------------------------------------------------------------------------
// Leitura para a tela
// ---------------------------------------------------------------------------

export interface ResumoOrdens {
  total: number;
  emAndamento: number;
  emRevisao: number;
  concluidas: number;
  /** Unidades das ordens ainda em aberto -- o que a fabrica ainda deve. */
  unidadesEmAberto: number;
  /** Ordens em aberto cuja data de lancamento ja passou. */
  atrasadas: number;
}

export function resumirOrdens(ordens: OrdemFabricacao[], hoje: string): ResumoOrdens {
  let emAndamento = 0;
  let emRevisao = 0;
  let concluidas = 0;
  let unidadesEmAberto = 0;
  let atrasadas = 0;

  for (const ordem of ordens) {
    if (ordem.situacao === "concluida") concluidas += 1;
    if (ordem.situacao === "revisao") emRevisao += 1;
    if (ordem.situacao === "andamento") emAndamento += 1;

    if (ordem.situacao === "andamento" || ordem.situacao === "revisao") {
      unidadesEmAberto += unidadesDaOrdem(ordem);
      if (ordem.dataLancamento < hoje) atrasadas += 1;
    }
  }

  return {
    total: ordens.length,
    emAndamento,
    emRevisao,
    concluidas,
    unidadesEmAberto,
    atrasadas,
  };
}

export const LIMITE_DA_LISTA = 50;

export function normalizarBusca(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
