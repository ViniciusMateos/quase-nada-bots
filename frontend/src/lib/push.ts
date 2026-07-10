import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '@/lib/api';

// Push remoto NÃO funciona no Expo Go (SDK 53+). Precisa de dev/preview build.
const noExpoGo = Constants.appOwnership === 'expo';

// Mostra a notificação mesmo com o app aberto.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true,
    shouldPlaySound: true, shouldSetBadge: false,
  }),
});

export async function configurarCanalAndroid() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Bots', importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

// Progresso pro corpo da notificação — só a porcentagem (sem quadradinhos).
function barra(pct: number): string {
  return `${pct}%`;
}

/**
 * Harness de teste — funciona no Expo Go, SEM servidor. Simula uma run: dispara
 * notificações locais com o MESMO identifier (`run-teste`), que SUBSTITUI a anterior
 * nos dois SOs → vira uma barrinha que atualiza no lugar, e no fim a de "terminou".
 * Dica: trava o celular / manda o app pro fundo depois de tocar, pra ver atualizando
 * no lock screen (com o app aberto, cada update aparece como um banner novo).
 */
export async function testarProgresso(): Promise<boolean> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') {
      const r = await Notifications.requestPermissionsAsync();
      if (r.status !== 'granted') return false;
    }
    await configurarCanalAndroid();
    const passos = [8, 24, 42, 60, 78, 92];
    for (const pct of passos) {
      await Notifications.scheduleNotificationAsync({
        identifier: 'run-teste',
        content: { title: 'auto-like (teste)', body: `${barra(pct)}  ·  seguindo ${Math.round(pct * 1.2)}/120`, sound: false },
        trigger: null,
      });
      await new Promise((r) => setTimeout(r, 1500));
    }
    await Notifications.scheduleNotificationAsync({
      identifier: 'run-teste',
      content: { title: 'Terminou (teste)', body: 'auto-like finalizou — 120/120.', sound: 'default' },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}

/** Pede permissão, pega o Expo push token e registra no backend. Retorna se deu certo. */
export async function registrarPush(): Promise<boolean> {
  if (noExpoGo || !Device.isDevice) return false;   // Expo Go / simulador não têm push remoto
  try {
    await configurarCanalAndroid();
    const atual = await Notifications.getPermissionsAsync();
    let status = atual.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return false;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )).data;
    await api.registerDevice(token);
    return true;
  } catch {
    return false;
  }
}
