import { ActiveRun, DiscState, Discipline } from '../types';

export interface AvisoProxima {
  key: string; // chave única por disciplina e dia, para o aviso não repetir
  origem: 'ciclo' | 'plano';
  titulo: string;
  mensagem: string;
  proximaId: string | null;
  proximaNome: string | null;
}

const totalLog = (d: Discipline): number =>
  Object.values(d.log || {}).reduce((acc, s) => acc + s, 0);

/**
 * Decide se deve avisar que o tempo de uma disciplina acabou (ciclo ou plano semanal)
 * e qual é a próxima. Função pura: não altera nada, só calcula.
 */
export function calcularAviso(
  discState: DiscState,
  run: ActiveRun | null,
  elapsed: number,
  hoje: string
): AvisoProxima | null {
  if (!run || !run.start) return null;

  const ed = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  if (!ed) return null;

  const disciplinas = ed.list || [];
  const nomeDe = (id: string) => disciplinas.find((d) => d.id === id)?.name || 'Disciplina';

  // ---- 1) Ciclo de estudos (mesma regra da tela Ciclos) ----
  const ciclos = ed.cycles || [];
  const ciclo = ciclos.find((c) => c.id === ed.csel) || ciclos[0];
  if (ciclo) {
    const itens = ciclo.items.filter((it) => disciplinas.some((d) => d.id === it.id));

    const concluidoNoCiclo = (id: string, min: number): boolean => {
      const d = disciplinas.find((x) => x.id === id);
      if (!d) return false;
      let total = totalLog(d);
      if (run.id === id && run.start) total += elapsed;
      return Math.max(0, total - (ciclo.base[id] || 0)) >= min * 60;
    };

    const idxAtual = itens.findIndex((it) => it.id === run.id);
    if (idxAtual >= 0 && concluidoNoCiclo(itens[idxAtual].id, itens[idxAtual].min)) {
      let prox: { id: string; min: number } | null = null;
      for (let k = 1; k < itens.length; k++) {
        const cand = itens[(idxAtual + k) % itens.length];
        if (!concluidoNoCiclo(cand.id, cand.min)) {
          prox = cand;
          break;
        }
      }
      return {
        key: `ciclo:${run.id}:${hoje}`,
        origem: 'ciclo',
        titulo: `Tempo de ${nomeDe(run.id)} concluído`,
        mensagem: prox
          ? `Próxima disciplina do ciclo: ${nomeDe(prox.id)}.`
          : 'Você concluiu todas as disciplinas do ciclo. 🎉',
        proximaId: prox ? prox.id : null,
        proximaNome: prox ? nomeDe(prox.id) : null,
      };
    }
  }

  // ---- 2) Planejamento semanal (plano de hoje) ----
  const plano = discState.weekPlan?.[hoje] || [];
  const itemAtual = plano.find((p) => p.disciplineId === run.id);
  if (itemAtual) {
    const segHoje = (id: string): number => {
      const d = disciplinas.find((x) => x.id === id);
      if (!d) return 0;
      let s = (d.log && d.log[hoje]) || 0;
      if (run.id === id && run.start) s += elapsed;
      return s;
    };

    if (segHoje(run.id) >= itemAtual.min * 60) {
      const idxAtual = plano.indexOf(itemAtual);
      let prox: (typeof plano)[number] | null = null;
      for (let k = 1; k < plano.length; k++) {
        const cand = plano[(idxAtual + k) % plano.length];
        if (cand.disciplineId === run.id) continue;
        if (segHoje(cand.disciplineId) < cand.min * 60) {
          prox = cand;
          break;
        }
      }
      return {
        key: `plano:${run.id}:${hoje}`,
        origem: 'plano',
        titulo: `Planejado de ${nomeDe(run.id)} concluído`,
        mensagem: prox
          ? `Próxima do seu planejamento de hoje: ${nomeDe(prox.disciplineId)}.`
          : 'Você concluiu o planejamento de hoje. 🎉',
        proximaId: prox ? prox.disciplineId : null,
        proximaNome: prox ? nomeDe(prox.disciplineId) : null,
      };
    }
  }

  return null;
}

/** Toca um bipe curto e vibra (quando o aparelho permitir). Falhas são ignoradas. */
export function avisarSonoroVisual(): void {
  try {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch {
    /* ignora */
  }
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 600);
  } catch {
    /* ignora */
  }
}
