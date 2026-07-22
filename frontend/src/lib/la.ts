import { api } from '@/lib/api';
import { env } from '@/config/env';
import {
  aoReceberTokenLA, encerrarTodasLA, iniciarLiveActivity, laDisponivel,
} from '../../modules/live-activity';

/**
 * Live Activity do app (a barra viva no lock screen / Dynamic Island).
 *
 * É UMA só pro app inteiro, não uma por bot. Quem decide se a Dynamic Island fica espaçosa
 * (compact) ou vira bolinha apertada (minimal) é QUANTAS Live Activities existem — com uma
 * só, ela nunca aperta e cabe "3 bots · 62%". O card lista os bots por dentro.
 *
 * Efeito colateral bom: sem N activities, não existe token de um bot caindo na barra do
 * outro — a pegadinha que exigia rotear tudo por activityId.
 *
 * Quem manda o conteúdo é o SERVER (push APNs): ele é o único que enxerga todas as runs e
 * sabe somar. O app só cria a activity e entrega o token.
 */

let ativaId: string | null = null;
let laCriada = false;   // FONTE DA VERDADE anti-duplicação. Setada SÍNCRONA (antes de qualquer
                        // await), então nem race nem iniciarLiveActivity() devolvendo null a
                        // furam. Zerada só por laRunsAcabaram() (sem run ativa).
let ouvindo = false;

function garantirListener() {
  if (ouvindo) return;
  ouvindo = true;
  aoReceberTokenLA((token) => {
    // manda o activityId JUNTO com o token. O server usa pra distinguir ROTAÇÃO de token
    // (mesmo id → só troca o token, NÃO encerra nada) de SESSÃO NOVA (id diferente → encerra
    // a LA antiga órfã antes de assumir a nova). Sem o id, o server não saberia a diferença e
    // mataria a própria LA viva numa rotação. O bundle vira o tópico do APNs (dev/preview).
    api.setLiveActivity(token, env.bundleId, ativaId ?? '').catch(() => { /* sem LA — segue */ });
  });
}

/**
 * Garante que existe UMA Live Activity, e que é a nossa. Chame ao iniciar qualquer run.
 *
 * - Já existe e é a que estamos observando → não mexe (2º bot subindo não pisca a barra).
 * - Existe mas é órfã (app reiniciou, perdemos o stream do token) → mata e recria, pra
 *   voltar a receber token. Sem isso a barra congelaria pra sempre.
 * - Não existe → cria.
 *
 * `titulo` só pinta os ~2s até o token chegar e o server assumir — passe o nome do processo.
 */
export async function garantirLA(titulo: string): Promise<void> {
  // ANTI-DUPLICAÇÃO à prova de nativo furado. laCriada é marcada SÍNCRONA (linha abaixo, sem
  // await antes), então o 2º bot que chama garantirLA — mesmo no mesmo tick, mesmo se o
  // iniciarLiveActivity() do 1º ainda não voltou, mesmo se ele voltar null — vê laCriada=true
  // e retorna sem criar nada. Medido no build: laAtual()/endAll() do ActivityKit NÃO são
  // confiáveis, então a fonte da verdade é ESTE flag JS. Zerado por laRunsAcabaram().
  if (laCriada) return;
  laCriada = true;                              // trava ANTES de qualquer await — imune a race
  try {
    if (!laDisponivel()) { laCriada = false; return; }   // Expo Go / Android / desligado
    await encerrarTodasLA();                    // limpa órfãs de sessões anteriores (best-effort)
    garantirListener();
    ativaId = await iniciarLiveActivity(titulo);
  } catch { /* sem LA — o app segue normal */ }
}

/**
 * Zera o flag da LA quando NÃO há mais run ativa (o server já encerrou a LA nesse ponto).
 * Sem isto, laCriada ficaria travada e o garantirLA nunca recriaria a LA no próximo ciclo de
 * runs. Chamado pelo poll global (BarraBotsGlobal) quando a lista de ativas zera.
 */
export function laRunsAcabaram(): void {
  laCriada = false;
  ativaId = null;
}

/**
 * Encerra a Live Activity pelo app. Normalmente NÃO precisa: quem encerra é o server
 * (push `end`) quando a última run acaba — e isso funciona com o app fechado.
 */
export async function encerrarLA(): Promise<void> {
  laCriada = false;
  ativaId = null;
  await encerrarTodasLA();
}
