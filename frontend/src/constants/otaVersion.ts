// Número da versão OTA do JS.
//
// REGRA DO PROJETO (padrão fixo): incrementar +1 a CADA `eas update` publicado
// (qualquer OTA no canal preview). É este número que aparece no rodapé do Settings,
// então ele é a PROVA de que o bundle novo de fato baixou e está rodando: se o device
// ainda mostra o número antigo, o update ainda não pegou.
//
// Não confundir com:
//   - `version` no package.json/app.config → versão de marketing do app
//   - `runtimeVersion` fixo → compatibilidade OTA×nativo (só muda em build)
export const OTA_VERSION = 16;

// Se o bundle que está rodando veio de um `eas update` (OTA) ou do JS embutido no build.
// Em dev client / Expo Go o módulo pode não existir — cai no fallback.
let Updates: { isEmbeddedLaunch?: boolean } | null = null;
try { Updates = require('expo-updates'); } catch { Updates = null; }
export function rodandoDeUpdate(): boolean {
  try { return Updates?.isEmbeddedLaunch === false; } catch { return false; }
}
