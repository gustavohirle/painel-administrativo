/**
 * Limite de tentativas de login.
 *
 * Sem isto, a unica defesa da senha e o tamanho dela: o formulario aceita
 * tentativa atras de tentativa, e um programa testa milhares por hora. O
 * painel tem dois logins e mostra faturamento, custo e comissao -- e conta
 * que vale a pena forcar.
 *
 * A regra e simples e cresce: a partir da quinta falha na janela, cada erro
 * novo espera mais. Acertar zera. A espera e informada na tela ("tente de
 * novo em 2 minutos"), porque esconder isso so faz a pessoa certa achar que o
 * painel quebrou -- quem ataca descobre em uma tentativa de qualquer jeito.
 *
 * As funcoes sao PURAS e recebem o relogio: o teste nao espera minuto nenhum.
 * Quem guarda o estado e `registro()`, no fim do arquivo.
 *
 * Limite deste desenho, assumido: a contagem vive na memoria do processo.
 * Reiniciar o painel zera as tentativas, e com mais de um processo cada um
 * teria a sua conta. Para dois usuarios num servidor so, guardar isso no banco
 * custaria uma escrita a cada tentativa -- inclusive das automatizadas, que e
 * exatamente o que nao se quer. Se um dia houver mais de um processo, isto
 * muda de lugar, nao de regra.
 */

/** Falhas ate comecar a esperar. As quatro primeiras passam direto. */
const LIVRES = 4;

/** Espera, em segundos, da 5a falha em diante. Depois da ultima, repete. */
const ESPERAS = [60, 120, 300, 600, 1800];

/** Sem falhar por este tempo, a contagem recomeca do zero. */
const ESQUECE_EM_MS = 60 * 60 * 1000;

export interface Tentativas {
  falhas: number;
  /** Momento da ultima falha, em ms. */
  ultimaEm: number;
}

export type RegistroDeTentativas = Map<string, Tentativas>;

/** Quanto falta esperar, em segundos. Zero quando pode tentar. */
export function esperaEmSegundos(
  registro: RegistroDeTentativas,
  chave: string,
  agora: number,
): number {
  const tentativas = registro.get(chave);
  if (!tentativas) return 0;
  if (agora - tentativas.ultimaEm >= ESQUECE_EM_MS) return 0;
  if (tentativas.falhas <= LIVRES) return 0;

  const indice = Math.min(tentativas.falhas - LIVRES - 1, ESPERAS.length - 1);
  const liberaEm = tentativas.ultimaEm + ESPERAS[indice]! * 1000;
  return Math.max(0, Math.ceil((liberaEm - agora) / 1000));
}

/** A maior espera entre varias chaves (o login e o endereco, por exemplo). */
export function maiorEspera(
  registro: RegistroDeTentativas,
  chaves: string[],
  agora: number,
): number {
  return Math.max(0, ...chaves.map((chave) => esperaEmSegundos(registro, chave, agora)));
}

export function registrarFalha(
  registro: RegistroDeTentativas,
  chaves: string[],
  agora: number,
): void {
  for (const chave of chaves) {
    const anterior = registro.get(chave);
    const esquecido = !anterior || agora - anterior.ultimaEm >= ESQUECE_EM_MS;
    registro.set(chave, {
      falhas: esquecido ? 1 : anterior.falhas + 1,
      ultimaEm: agora,
    });
  }
}

/** Acertar a senha zera a contagem -- inclusive a do endereco de onde veio. */
export function limparFalhas(registro: RegistroDeTentativas, chaves: string[]): void {
  for (const chave of chaves) registro.delete(chave);
}

/**
 * Tira do mapa o que ja foi esquecido.
 *
 * Sem isto, cada login inventado por um programa deixaria uma entrada para
 * sempre, e a memoria cresceria sozinha -- o proprio limite viraria o ataque.
 */
export function limparVelhas(registro: RegistroDeTentativas, agora: number): void {
  for (const [chave, tentativas] of registro) {
    if (agora - tentativas.ultimaEm >= ESQUECE_EM_MS) registro.delete(chave);
  }
}

/** "2 minutos", "45 segundos" -- para a mensagem da tela. */
export function esperaEmTexto(segundos: number): string {
  if (segundos >= 60) {
    const minutos = Math.ceil(segundos / 60);
    return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  }
  return `${segundos} ${segundos === 1 ? "segundo" : "segundos"}`;
}

/**
 * O registro do processo.
 *
 * Mora no `globalThis` pelo mesmo motivo do cache de pedidos (armadilha 2 do
 * CLAUDE.md): o Next carrega a Server Action num grafo de modulos separado do
 * que renderiza a pagina, e uma variavel de modulo teria uma copia por grafo
 * -- duas contagens, cada uma com metade das tentativas.
 */
export function registro(): RegistroDeTentativas {
  const global = globalThis as unknown as { __tentativasLogin?: RegistroDeTentativas };
  global.__tentativasLogin ??= new Map();
  return global.__tentativasLogin;
}

/** Chaves de uma tentativa: o login e o endereco, contados separadamente. */
export function chavesDaTentativa(login: string, ip: string | null): string[] {
  const chaves = [`login:${login.trim().toLowerCase()}`];
  // Sem IP (proxy que nao repassa), sobra a conta por login -- que ja segura
  // o ataque contra UMA conta, que e o caso que importa aqui.
  if (ip) chaves.push(`ip:${ip}`);
  return chaves;
}
