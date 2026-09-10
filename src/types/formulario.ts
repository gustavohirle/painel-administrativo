/**
 * Estado compartilhado dos formularios com Server Action.
 *
 * Mora fora dos arquivos `"use server"` DE PROPOSITO: um modulo marcado como
 * server action so pode exportar funcoes async. Exportar uma constante de la
 * quebra em tempo de execucao -- e o build e o typecheck passam mesmo assim,
 * porque a restricao e do runtime do React Server Components.
 */

export interface EstadoFormulario {
  ok: boolean;
  mensagem: string;
}

export const ESTADO_INICIAL: EstadoFormulario = { ok: false, mensagem: "" };
