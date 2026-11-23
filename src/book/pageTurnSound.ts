/**
 * Sonido de paso de página, sintetizado con Web Audio (sin archivos: no hay licencia que comprobar).
 *
 * Imita las tres partes de una hoja de papel al pasar:
 *  1. «Crujido» al levantar la hoja: chasquidos muy cortos y agudos.
 *  2. «Roce» del papel en el aire: ruido filtrado en banda (≈ 1–4 kHz) que sube y baja, con una
 *     textura irregular, como el papel al doblarse.
 *  3. «Asentado» al caer: un golpe suave y grave, con un poco de aire.
 * El sonido se mueve de derecha a izquierda al avanzar (y al revés al retroceder), y cada vez varía
 * un poco para que no suene a bucle. El contexto de audio se crea con la primera interacción.
 */

export type TurnDirection = 'next' | 'prev';

export interface PageTurnSound {
  /** Suena una página; con `riffle`, varias seguidas (al saltar a un capítulo). */
  play: (direction: TurnDirection, options?: { riffle?: boolean }) => void;
  /** Activa o silencia el sonido. */
  setEnabled: (enabled: boolean) => void;
}

/** Mínimo de lo que necesitamos de un AudioContext (para poder probarlo sin navegador). */
export type AudioContextFactory = () => AudioContext | null;

const defaultFactory: AudioContextFactory = () => {
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext as typeof AudioContext | undefined);
  return Ctor ? new Ctor() : null;
};

/** Ruido rosa (filtro de Paul Kellet): más natural que el blanco para el roce del papel. */
export function pinkNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}

/** Variación aleatoria: `base` ± `spread` (fracción). */
const vary = (base: number, spread: number): number =>
  base * (1 + (Math.random() * 2 - 1) * spread);

/** Programa una página que empieza en `t0` (segundos del contexto) con volumen `level`. */
export function scheduleTurn(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  destination: AudioNode,
  t0: number,
  direction: TurnDirection,
  level = 1,
  durationScale = 1,
): number {
  const dur = vary(0.5, 0.15) * durationScale;
  const side = direction === 'next' ? 1 : -1;

  // Paneo: la hoja viaja de un lado al otro.
  const out = ctx.createGain();
  out.gain.value = level;
  let tail: AudioNode = out;
  if (typeof ctx.createStereoPanner === 'function') {
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(0.5 * side, t0);
    pan.pan.linearRampToValueAtTime(-0.5 * side, t0 + dur);
    out.connect(pan);
    tail = pan;
  }
  tail.connect(destination);

  const noiseSource = (start: number, length: number): AudioBufferSourceNode => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.start(start, Math.random() * Math.max(0, noise.duration - length - 0.05), length + 0.02);
    return src;
  };

  // 2) Roce: ruido en banda que barre hacia los agudos y vuelve, con textura irregular.
  const swish = noiseSource(t0, dur);
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 350;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = vary(0.75, 0.2);
  band.frequency.setValueAtTime(vary(1000, 0.2), t0);
  band.frequency.exponentialRampToValueAtTime(vary(3600, 0.2), t0 + dur * 0.45);
  band.frequency.exponentialRampToValueAtTime(vary(1600, 0.2), t0 + dur);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, t0);
  envelope.gain.exponentialRampToValueAtTime(vary(0.55, 0.15), t0 + 0.035);
  envelope.gain.exponentialRampToValueAtTime(vary(0.3, 0.2), t0 + dur * 0.55);
  envelope.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  // Textura: el volumen del roce tiembla con ruido muy grave (el papel al doblarse).
  const flutter = noiseSource(t0, dur);
  const flutterFilter = ctx.createBiquadFilter();
  flutterFilter.type = 'lowpass';
  flutterFilter.frequency.value = vary(35, 0.3);
  const flutterDepth = ctx.createGain();
  flutterDepth.gain.value = 1.4;
  flutter.connect(flutterFilter).connect(flutterDepth).connect(envelope.gain);
  swish.connect(highpass).connect(band).connect(envelope).connect(out);

  // 1) Crujido al levantar la hoja: unos chasquidos cortos y agudos al principio.
  const crackles = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < crackles; i += 1) {
    const at = t0 + Math.random() * dur * 0.35;
    const length = vary(0.012, 0.4);
    const grain = noiseSource(at, length);
    const bright = ctx.createBiquadFilter();
    bright.type = 'highpass';
    bright.frequency.value = vary(2800, 0.25);
    const grainGain = ctx.createGain();
    grainGain.gain.setValueAtTime(vary(0.22, 0.4), at);
    grainGain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    grain.connect(bright).connect(grainGain).connect(out);
  }

  // 3) Asentado: golpe suave y grave al caer la hoja, con un poco de aire.
  const landAt = t0 + dur * vary(0.82, 0.06);
  const land = noiseSource(landAt, 0.09);
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = vary(480, 0.2);
  const landGain = ctx.createGain();
  landGain.gain.setValueAtTime(0.0001, landAt);
  landGain.gain.exponentialRampToValueAtTime(vary(0.4, 0.2), landAt + 0.006);
  landGain.gain.exponentialRampToValueAtTime(0.0001, landAt + 0.085);
  land.connect(low).connect(landGain).connect(out);

  return dur;
}

/**
 * Crea el motor de sonido. No hace nada hasta la primera llamada a `play` (que siempre llega tras
 * un clic o una tecla: así el navegador permite el audio) ni mientras esté silenciado.
 */
export function createPageTurnSound(
  initiallyEnabled: boolean,
  factory: AudioContextFactory = defaultFactory,
  /**
   * Reloj en segundos para no amontonar sonidos. Es el del sistema, no el del audio: si el
   * navegador mantiene el contexto de audio en pausa, su reloj no avanza y bloquearía todas las
   * páginas siguientes.
   */
  clock: () => number = () => performance.now() / 1000,
): PageTurnSound {
  let enabled = initiallyEnabled;
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  let master: GainNode | null = null;
  let lastAt = -Infinity;

  return {
    setEnabled(on) {
      enabled = on;
    },
    play(direction, options = {}) {
      if (!enabled) return;
      ctx ??= factory();
      if (!ctx) return;
      if (ctx.state === 'suspended') void ctx.resume();
      noise ??= pinkNoise(ctx, 2);
      if (!master) {
        master = ctx.createGain();
        // Pico de unos −14 dBFS: se oye bien sin molestar mientras lees.
        master.gain.value = 1;
        master.connect(ctx.destination);
      }
      // Con la tecla mantenida, no amontonar sonidos: uno cada 80 ms como mucho.
      const wall = clock();
      if (wall - lastAt < 0.08) return;
      lastAt = wall;
      const now = ctx.currentTime;
      if (options.riffle) {
        // Hojear varias páginas seguidas: más cortas, solapadas y algo más suaves.
        for (let i = 0; i < 4; i += 1) {
          scheduleTurn(ctx, noise, master, now + 0.02 + i * vary(0.075, 0.2), direction, 0.6, 0.55);
        }
      } else {
        scheduleTurn(ctx, noise, master, now + 0.01, direction);
      }
    },
  };
}

const STORAGE_KEY = 'photorem:sonido-paginas';

/** Tu preferencia de sonido, guardada en el navegador (por defecto, activado). */
export function readSoundPreference(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeSoundPreference(
  storage: Pick<Storage, 'setItem'> | undefined,
  enabled: boolean,
): void {
  try {
    storage?.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Navegación privada o almacenamiento lleno: se usa solo en esta sesión.
  }
}
