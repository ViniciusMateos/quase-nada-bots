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
  development: { name: 'QN Bots Dev', scheme: 'qnbots-dev', bundleId: 'app.quasenada.bots.dev' },
  preview: { name: 'Quase Nada Bots', scheme: 'qnbots', bundleId: 'app.quasenada.bots.preview' },
};
const current = variants[variant];

const extra = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || '',
  appVariant: variant,
};
if (process.env.EAS_PROJECT_ID) extra.eas = { projectId: process.env.EAS_PROJECT_ID };

module.exports = {
  expo: {
    name: current.name,
    slug: 'quase-nada-bots',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: current.scheme,
    userInterfaceStyle: 'dark',
    backgroundColor: '#0F0F0F',
    splash: { resizeMode: 'contain', backgroundColor: '#0F0F0F' },
    ios: {
      bundleIdentifier: current.bundleId,
      supportsTablet: false,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        // dev fala com o backend local por http → libera cleartext só no dev
        ...(isDev ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true } } : {}),
      },
    },
    android: {
      package: current.bundleId,
      usesCleartextTraffic: isDev,
    },
    plugins: ['expo-secure-store', 'expo-notifications', 'expo-font', 'expo-asset'],
    extra,
  },
};
