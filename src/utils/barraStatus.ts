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

/** Ao abrir o app: a tela fica abaixo da barra de notificações, e a barra fica visível. */
export const configurarBarraStatus = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.show();
  } catch {
    /* ignora */
  }
};

/** Define a área reservada para a barra de notificações: 24px no tablet (largura >= 600), e nada no celular. */
export const aplicarAreaBarraStatus = (): void => {
  const tablet = window.innerWidth >= 600;
  document.documentElement.style.setProperty(
    '--safe-top',
    tablet ? 'max(env(safe-area-inset-top, 0px), 24px)' : 'env(safe-area-inset-top, 0px)'
  );
};
