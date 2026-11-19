import React from 'react';
import { BellRing, X } from 'lucide-react';

export interface CycleAlertInfo {
  title: string;
  subtitle: string;
}

export function playAlertChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + idx * 0.14 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.14 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.14);
        osc.stop(ctx.currentTime + idx * 0.14 + 0.38);
      });
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 1500);
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([180, 90, 180]);
    }
  } catch {
    // Ignore audio context autoplay errors
  }
}

interface CycleAlertToastProps {
  alert: CycleAlertInfo | null;
  onDismiss: () => void;
}

export const CycleAlertToast: React.FC<CycleAlertToastProps> = ({ alert, onDismiss }) => {
  if (!alert) return null;

  return (
    <div
      role="alert"
      className="fixed top-4 right-4 z-[115] max-w-sm w-[calc(100vw-2rem)] p-4 rounded-2xl bg-emerald-600 text-white shadow-2xl border border-emerald-400/40 flex items-start gap-3"
    >
      <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
        <BellRing className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-extrabold">{alert.title}</div>
        <div className="text-xs text-emerald-50/90 mt-0.5 leading-snug">{alert.subtitle}</div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dispensar alerta"
        className="p-1 rounded-lg hover:bg-white/15 transition cursor-pointer shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
