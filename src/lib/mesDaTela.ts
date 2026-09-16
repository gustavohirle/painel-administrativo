/**
 * Qual mes a tela mostra.
 *
 * O mes escolhido no cabecalho vale para TODAS as abas ate a pessoa trocar.
 * Antes ele morava so na URL (`?mes=`), e os links das abas nao o levavam: ao
 * mudar de aba o painel voltava para o ultimo mes, e a pessoa comparava
 * setembro numa tela com agosto na outra sem perceber.
 *
 * Agora o seletor tambem grava a escolha num cookie de sessao, e a ordem e:
 * o mes da URL (link compartilhado manda), depois o do cookie, depois o mais
 * recente. Mes que nao existe mais na base e ignorado nas duas fontes.
 *
 * Este arquivo e compartilhado entre o seletor (navegador) e as paginas
 * (servidor); a leitura do cookie no servidor fica em `mesDaTelaServidor.ts`.
 */

/** Cookie de sessao com o mes escolhido ("aaaa-mm"). Nao e dado sensivel. */
export const COOKIE_MES = "painel_mes";

export function escolherMes(
  meses: string[],
  doEndereco: string | undefined,
  doCookie: string | undefined,
): string {
  if (doEndereco && meses.includes(doEndereco)) return doEndereco;
  if (doCookie && meses.includes(doCookie)) return doCookie;
  return meses[0] ?? "";
}
