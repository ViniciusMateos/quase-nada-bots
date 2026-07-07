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
