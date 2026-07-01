import * as SecureStore from 'expo-secure-store';

const K_TOKEN = 'bots_token';
const K_URL = 'bots_server_url';

export const getToken = () => SecureStore.getItemAsync(K_TOKEN);
export const setToken = (v: string) => SecureStore.setItemAsync(K_TOKEN, v);
export const getServerUrl = () => SecureStore.getItemAsync(K_URL);
export const setServerUrl = (v: string) => SecureStore.setItemAsync(K_URL, v);
