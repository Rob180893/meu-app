import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

/** Esconde a barra de notificações (só no aplicativo instalado; no navegador não faz nada). */
export const ocultarBarraStatus = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.hide();
  } catch {
    /* ignora */
  }
};

/** Mostra a barra de notificações de novo. */
export const mostrarBarraStatus = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.show();
  } catch {
    /* ignora */
  }
};
