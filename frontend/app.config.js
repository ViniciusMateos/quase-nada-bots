const fs = require('fs');
const path = require('path');

// Carrega .env.local (não versionado) — útil pra apontar o EXPO_PUBLIC_API_URL no dev.
function loadLocalEnvFile() {
  const envPath = path.join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const [k, ...v] = t.split('=');
    if (!process.env[k]) process.env[k] = v.join('=').trim();
  }
}
loadLocalEnvFile();

const requested = process.env.APP_VARIANT || 'preview';
const variant = requested === 'development' ? 'development' : 'preview';
const isDev = variant === 'development';

const variants = {
  development: { name: 'QN Bots Dev', scheme: 'qnbots-dev', bundleId: 'app.quasenada.bots.dev', icon: './src/assets/icon-teste.png' },
  preview: { name: 'Quase Nada Bots', scheme: 'qnbots', bundleId: 'app.quasenada.bots.preview', icon: './src/assets/icon.png' },
};
const current = variants[variant];

const PROJECT_ID = '1c474754-09c7-4aff-8fea-10902a77b9a8';

const extra = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || '',
  appVariant: variant,
  // bundle deste build — o app manda junto com o token da Live Activity pro server
  // usar como tópico do APNs (dev e preview têm bundles diferentes).
  bundleId: current.bundleId,
};
extra.eas = { projectId: process.env.EAS_PROJECT_ID || PROJECT_ID };

module.exports = {
  expo: {
    name: current.name,
    slug: 'quase-nada-bots',
    version: '1.0.0',
    // fixo (não segue a versão): mantém o OTA compatível com os builds já instalados;
    // só sobe quando uma mudança NATIVA quebra a compatibilidade com o bundle JS.
    runtimeVersion: '1.0.0',
    // EMBUTE todos os assets no binário. Sem isto, os PNG required (splash.png,
    // apenas-cachorro.png do LoadingDog) não renderizavam no build standalone — o native
    // splash mostrava o cachorro (cópia própria), mas o <Image require> no JS ficava vazio,
    // deixando só o anel girando. Precisa de BUILD novo pra valer (config nativa).
    assetBundlePatterns: ['**/*'],
    updates: { url: `https://u.expo.dev/${PROJECT_ID}` },
    orientation: 'portrait',
    scheme: current.scheme,
    userInterfaceStyle: 'dark',
    backgroundColor: '#0F0F0F',
    icon: current.icon,
    splash: { image: './src/assets/splash.png', resizeMode: 'cover', backgroundColor: '#8114B0' },
    ios: {
      bundleIdentifier: current.bundleId,
      supportsTablet: false,
      appleTeamId: '4F7QHTY86S',   // exigido pelo @bacons/apple-targets (assinatura do widget)
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSSupportsLiveActivities: true,   // Live Activity do progresso dos bots
        // dev fala com o backend local por http → libera cleartext só no dev
        ...(isDev ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true } } : {}),
      },
    },
    android: {
      package: current.bundleId,
      usesCleartextTraffic: isDev,
      adaptiveIcon: { foregroundImage: current.icon, backgroundColor: '#8114B0' },
    },
    plugins: ['expo-secure-store', 'expo-notifications', 'expo-font', 'expo-asset', '@bacons/apple-targets'],
    extra,
  },
};
