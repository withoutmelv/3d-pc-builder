// Quiet, local mechanical cues; no audio downloads or background playback.
export function createWorkshopAudio() {
  let context;
  let muted = false;
  let disposed = false;
  const cues = {
    pick: [[0, 180, 0.045]],
    place: [[0, 125, 0.07]],
    install: [
      [0.25, 210, 0.04],
      [0.29, 130, 0.06],
    ],
    latch: [
      [0, 440, 0.025],
      [0.055, 230, 0.04],
    ],
    screw: [
      [0, 720, 0.025],
      [0.045, 390, 0.035],
    ],
  };
  return {
    setMuted(value) {
      muted = value;
      if (muted) {
        context?.close().catch(() => {});
        context = undefined;
      }
    },
    play(kind) {
      if (muted || disposed || !cues[kind]) return;
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context ||= new Audio();
        if (context.state === 'suspended') context.resume().catch(() => {});
        for (const [offset, frequency, duration] of cues[kind]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const start = context.currentTime + offset;
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(frequency, start);
          oscillator.frequency.exponentialRampToValueAtTime(frequency / 2, start + duration);
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.07, start + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
          oscillator.connect(gain).connect(context.destination);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
          oscillator.start(start);
          oscillator.stop(start + duration + 0.01);
        }
      } catch {
        // Audio availability never blocks assembly.
      }
    },
    dispose() {
      disposed = true;
      context?.close().catch(() => {});
    },
  };
}
