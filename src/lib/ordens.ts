/**
 * Ordem de fabricacao: numeracao, token, hash e a montagem do documento.
 *
 * Tudo aqui e funcao PURA -- as unicas excecoes sao `novoToken`, que sorteia, e
 * `gerarDocumento`, que carimba uma data. As duas recebem o valor de fora nos
 * testes, para que os bytes do PDF sejam reproduziveis: e o que permite o teste
 * conferir o hash do arquivo em vez de so verificar que ele foi gerado.
 *
 * O desenho do documento mora aqui, e nao num componente, pelo mesmo motivo
 * que `lib/metrics.ts` nao importa React: o PDF e gerado no servidor, no
 * momento da assinatura, e precisa sair identico daqui a dois anos.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

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
  PROPORCAO_ASSINATURA,
  ROTULO_PAPEL,
  ROTULO_SITUACAO,
  unidadesDaOrdem,
  type AssinaturaOrdem,
  type DocumentoOrdem,
  type OrdemFabricacao,
  type SituacaoOrdem,
} from "@/types/ordemFabricacao";

// ---------------------------------------------------------------------------
// Numeracao e token
// ---------------------------------------------------------------------------

/**
 * "OF-2026-0007". Sequencial por ano.
 *
 * Por ano, e nao continuo, porque e o numero que as duas pessoas vao falar no
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

/**
 * Token do link de assinatura: 32 bytes aleatorios em base64url.
 *
 * 256 bits de `randomBytes` -- nao `Math.random`, que e previsivel e nao serve
 * para nada que autorize alguma coisa. Aqui o link E a credencial.
 */
export function novoToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Compara tokens em tempo constante.
 *
 * O repositorio de demonstracao procura o token varrendo a lista, e um `===`
 * ali vaza, pelo tempo, quantos caracteres iniciais estavam certos. Custa uma
 * linha proteger; o mesmo cuidado ja esta em `verificarSenha`.
 */
export function tokenConfere(recebido: string, guardado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(guardado);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
 * de um `<form>` publico, sem login, e vao direto para um gerador de PDF. Um
 * `NaN` ou um `1e9` no meio da lista produziria um arquivo corrompido, e um
 * array de cem mil pontos encheria o banco.
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
 */
export function hashDoConteudo(ordem: OrdemFabricacao): string {
  const canonico = [
    ordem.numero,
    ordem.dataLancamento,
    ordem.observacao ?? "",
    ...ordem.itens.map((i) => `${i.chave}|${i.nome}|${i.sku ?? ""}|${i.quantidade}`),
    `${ordem.solicitante.nome}|${ordem.solicitante.assinadoEm}`,
    ordem.aprovador ? `${ordem.aprovador.nome}|${ordem.aprovador.assinadoEm}` : "",
  ].join("\n");

  return createHash("sha256").update(canonico, "utf8").digest("hex");
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
      texto: `Emitida em ${dataHora(ordem.criadoEm)}`,
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
    "Volume total",
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

  y = titulo(atual, y, "ITENS A FABRICAR");

  const xSku = MARGEM + 300;
  const cabecalhoDaTabela = () => {
    atual.push(
      { tipo: "texto", x: MARGEM, y, texto: "Produto", tamanho: 8.5, negrito: true, cor: CINZA_ROTULO },
      { tipo: "texto", x: xSku, y, texto: "SKU", tamanho: 8.5, negrito: true, cor: CINZA_ROTULO },
      { tipo: "texto", x: DIREITA, y, texto: "Quantidade", tamanho: 8.5, negrito: true, cor: CINZA_ROTULO, alinhamento: "direita" },
    );
    y += 6;
    atual.push({ tipo: "linha", x1: MARGEM, y1: y, x2: DIREITA, y2: y, espessura: 0.8, cor: 0.4 });
    y += 15;
  };

  cabecalhoDaTabela();

  for (const item of ordem.itens) {
    if (y + 18 > RODAPE - 200) {
      abrirPagina();
      y = titulo(atual, y, "ITENS A FABRICAR (continuação)");
      cabecalhoDaTabela();
    }

    atual.push(
      {
        tipo: "texto",
        x: MARGEM,
        y,
        // Truncar em vez de deixar invadir: nome de produto nao tem teto de
        // tamanho e a coluna de quantidade tem que continuar legivel.
        texto: truncarTexto(item.nome, 290, 10),
        tamanho: 10,
      },
      { tipo: "texto", x: xSku, y, texto: item.sku ?? "--", tamanho: 9, cor: CINZA_APOIO },
      {
        tipo: "texto",
        x: DIREITA,
        y,
        texto: `${inteiro(item.quantidade)} un`,
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
    { tipo: "texto", x: MARGEM, y, texto: "Total a fabricar", tamanho: 10, negrito: true },
    {
      tipo: "texto",
      x: DIREITA,
      y,
      texto: `${inteiro(unidadesDaOrdem(ordem))} un`,
      tamanho: 11,
      negrito: true,
      alinhamento: "direita",
    },
  );
  y += 34;

  // --- Assinaturas ---------------------------------------------------------

  const alturaDoBloco = 62 + Math.round(((LARGURA_UTIL - 30) / 2) / PROPORCAO_ASSINATURA);
  garantirEspaco(alturaDoBloco + 24);

  y = titulo(atual, y, "ASSINATURAS");
  y = desenharAssinaturas(atual, y, ordem);

  // --- Recusa --------------------------------------------------------------

  if (ordem.situacao === "recusada" && ordem.motivoRecusa) {
    y += 12;
    for (const linha of quebrarTexto(`Motivo da recusa: ${ordem.motivoRecusa}`, LARGURA_UTIL, 10)) {
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
    { tipo: "texto", x: MARGEM + 132, y, texto: valor, tamanho: 10.5, negrito: true },
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

/** As duas molduras, lado a lado, com o traco de cada um dentro. */
function desenharAssinaturas(
  pagina: Desenho[],
  y: number,
  ordem: OrdemFabricacao,
): number {
  const espaco = 30;
  const largura = (LARGURA_UTIL - espaco) / 2;
  const altura = largura / PROPORCAO_ASSINATURA;

  const colunas: Array<{ x: number; assinatura: AssinaturaOrdem | null }> = [
    { x: MARGEM, assinatura: ordem.solicitante },
    { x: MARGEM + largura + espaco, assinatura: ordem.aprovador },
  ];

  for (const [indice, coluna] of colunas.entries()) {
    pagina.push({
      tipo: "retangulo",
      x: coluna.x,
      y,
      largura,
      altura,
      contorno: 0.72,
      espessura: 0.7,
    });

    if (coluna.assinatura) {
      pagina.push(...tracosNaMoldura(coluna.assinatura.tracos, coluna.x, y, largura, altura));
    } else {
      pagina.push({
        tipo: "texto",
        x: coluna.x + largura / 2,
        y: y + altura / 2 + 3,
        texto: "aguardando assinatura",
        tamanho: 9,
        cor: 0.68,
        alinhamento: "centro",
      });
    }

    let linha = y + altura + 14;
    const papel = indice === 0 ? "solicitante" : "aprovador";

    pagina.push({
      tipo: "texto",
      x: coluna.x,
      y: linha,
      texto: truncarTexto(coluna.assinatura?.nome ?? "--", largura, 11, true),
      tamanho: 11,
      negrito: true,
    });
    linha += 12;

    pagina.push({
      tipo: "texto",
      x: coluna.x,
      y: linha,
      texto: ROTULO_PAPEL[papel],
      tamanho: 8,
      cor: CINZA_ROTULO,
    });
    linha += 11;

    if (coluna.assinatura) {
      pagina.push({
        tipo: "texto",
        x: coluna.x,
        y: linha,
        texto: `Assinado em ${dataHora(coluna.assinatura.assinadoEm)}`,
        tamanho: 8,
        cor: CINZA_ROTULO,
      });
      linha += 10;

      if (coluna.assinatura.ip) {
        pagina.push({
          tipo: "texto",
          x: coluna.x,
          y: linha,
          texto: `Origem ${coluna.assinatura.ip}`,
          tamanho: 7,
          cor: 0.68,
        });
        linha += 10;
      }
    }
  }

  return y + altura + 60;
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
 * Chamado UMA vez, no momento da assinatura do aprovador. Dali em diante o
 * painel serve os bytes guardados, nunca regenera: um documento que se
 * reconstroi a cada download mudaria junto com o codigo que o desenha, e a
 * assinatura deixaria de se referir a alguma coisa fixa.
 */
export function gerarDocumento(
  ordem: OrdemFabricacao,
  opcoes: OpcoesDocumento,
): DocumentoOrdem {
  const paginas = desenharOrdem(ordem, opcoes);

  const bytes = montarPdf(paginas, {
    titulo: `Ordem de fabricação ${ordem.numero}`,
    autor: "Painel Administrativo",
    assunto: `Pedido de fabricacao assinado por ${ordem.solicitante.nome} e ${
      ordem.aprovador?.nome ?? "--"
    }`,
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
  aguardando: number;
  aprovadas: number;
  /** Unidades das ordens ainda em aberto -- o que a fabrica ainda deve. */
  unidadesEmAberto: number;
  /** Ordens em aberto cuja data de lancamento ja passou. */
  atrasadas: number;
}

export function resumirOrdens(
  ordens: OrdemFabricacao[],
  hoje = new Date(),
): ResumoOrdens {
  const abertas = ordens.filter((o) => o.situacao === "aguardando");
  const limite = hoje.toISOString().slice(0, 10);

  return {
    total: ordens.length,
    aguardando: abertas.length,
    aprovadas: ordens.filter((o) => o.situacao === "aprovada").length,
    unidadesEmAberto: abertas.reduce((soma, o) => soma + unidadesDaOrdem(o), 0),
    atrasadas: abertas.filter((o) => o.dataLancamento < limite).length,
  };
}

// ---------------------------------------------------------------------------
// Filtro da lista
// ---------------------------------------------------------------------------

/**
 * Teto de ordens desenhadas de uma vez.
 *
 * Nao e paginacao por elegancia: cada ordem carrega os TRACOS das duas
 * assinaturas, uns 3 KB por ordem. Quinhentas ordens seriam mais de um mega
 * atravessando para o navegador toda vez que a aba abre, para desenhar uma
 * lista que ninguem le inteira. O filtro corta antes, e o que sobra tem teto.
 */
export const LIMITE_DA_LISTA = 50;

/** Quem e o dono de um produto -- e por onde a ordem encontra o influencer. */
export interface DonoDoProduto {
  id: string;
  nome: string;
  marca: string;
}

export interface FiltrosOrdens {
  /** Texto livre: produto, SKU, numero da ordem, quem pediu, quem aprovou. */
  busca: string;
  /** Id do influencer dono dos produtos pedidos. `null` = todos. */
  influencerId: string | null;
  situacao: SituacaoOrdem | null;
}

export const FILTROS_DE_ORDENS_VAZIOS: FiltrosOrdens = {
  busca: "",
  influencerId: null,
  situacao: null,
};

export function haFiltroAtivo(filtros: FiltrosOrdens): boolean {
  return (
    filtros.busca.trim() !== "" ||
    filtros.influencerId !== null ||
    filtros.situacao !== null
  );
}

/**
 * Caixa e acento fora, para a busca perdoar a digitacao.
 *
 * Nome de produto vindo da Nuvemshop vem acentuado, e ninguem
 * digita acento numa caixa de busca. Sem normalizar os DOIS lados, procurar
 * "serum" nao acharia "Serum" acentuado -- e o filtro pareceria quebrado no caso
 * mais comum.
 */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtra a lista de ordens.
 *
 * O influencer NAO mora na ordem: ele mora no produto (secao 5.11), e a ordem
 * so guarda a chave do item. O vinculo chega de fora, em `donoPorChave`, para
 * esta funcao continuar pura e para a pagina montar o indice uma vez so em vez
 * de uma vez por ordem.
 *
 * Uma ordem com varios itens casa se QUALQUER item casar. Exigir que todos
 * casassem esconderia justamente o pedido misto, que e o que a pessoa procura
 * quando pergunta "o que eu ja pedi do Serum?".
 */
export function filtrarOrdens(
  ordens: OrdemFabricacao[],
  filtros: FiltrosOrdens,
  donoPorChave: Map<string, DonoDoProduto>,
): OrdemFabricacao[] {
  const termo = normalizarBusca(filtros.busca);

  return ordens.filter((ordem) => {
    if (filtros.situacao && ordem.situacao !== filtros.situacao) return false;

    if (filtros.influencerId) {
      const daMarca = ordem.itens.some(
        (item) => donoPorChave.get(item.chave)?.id === filtros.influencerId,
      );
      if (!daMarca) return false;
    }

    if (termo === "") return true;

    const alvos = [
      ordem.numero,
      ordem.solicitante.nome,
      ordem.aprovador?.nome ?? "",
      ordem.observacao ?? "",
      ...ordem.itens.flatMap((item) => {
        const dono = donoPorChave.get(item.chave);
        // O nome do influencer e o da marca entram na busca livre: quem
        // procura "Aurora" quer as ordens da Aurora, sem ter que descobrir
        // qual seletor usar.
        return [item.nome, item.sku ?? "", dono?.nome ?? "", dono?.marca ?? ""];
      }),
    ];

    return alvos.some((alvo) => normalizarBusca(alvo).includes(termo));
  });
}

/**
 * Le os filtros da barra de endereco, validando contra o que existe.
 *
 * Mesma regra de `relatoriosUrl.ts`: nada vindo da URL entra sem passar por
 * uma lista conhecida. Um influencer que nao existe mais vira "todos", nao uma
 * lista vazia sem explicacao.
 */
export function lerFiltrosDaUrl(
  params: { busca?: string; influencer?: string; situacao?: string },
  influencersValidos: string[],
): FiltrosOrdens {
  const situacoes: SituacaoOrdem[] = ["aguardando", "aprovada", "recusada", "cancelada"];

  return {
    busca: (params.busca ?? "").slice(0, 120),
    influencerId:
      params.influencer && influencersValidos.includes(params.influencer)
        ? params.influencer
        : null,
    situacao: situacoes.find((s) => s === params.situacao) ?? null,
  };
}
