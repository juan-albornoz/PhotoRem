import { describe, expect, it, vi } from 'vitest';

import { createPageTurnSound, readSoundPreference, writeSoundPreference } from './pageTurnSound.ts';

/** AudioContext de mentira: cuenta los nodos que se crean (jsdom no tiene Web Audio). */
function fakeAudioContext() {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = (extra: object = {}) => {
    const n = { connect: vi.fn((target: unknown) => target), ...extra };
    return n;
  };
  const counts = { sources: 0, panners: 0 };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'suspended',
    destination: node(),
    resume: vi.fn(() => Promise.resolve()),
    createBuffer: vi.fn((_ch: number, length: number) => {
      const data = new Float32Array(length);
      return { duration: length / 8000, getChannelData: () => data };
    }),
    createGain: vi.fn(() => node({ gain: param() })),
    createBiquadFilter: vi.fn(() => node({ type: '', frequency: param(), Q: param() })),
    createStereoPanner: vi.fn(() => {
      counts.panners += 1;
      return node({ pan: param() });
    }),
    createBufferSource: vi.fn(() => {
      counts.sources += 1;
      return node({ buffer: null, start: vi.fn() });
    }),
  };
  return { ctx: ctx as unknown as AudioContext, raw: ctx, counts };
}

describe('sonido de paso de página', () => {
  it('no crea el audio hasta la primera página (el navegador lo exige tras una interacción)', () => {
    const fake = fakeAudioContext();
    const factory = vi.fn(() => fake.ctx);
    const sound = createPageTurnSound(true, factory);
    expect(factory).not.toHaveBeenCalled();
    sound.play('next');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fake.raw.resume).toHaveBeenCalled(); // estaba suspendido
    expect(fake.counts.sources).toBeGreaterThanOrEqual(6); // roce, textura, crujidos y asentado
    expect(fake.counts.panners).toBe(1); // se mueve de un lado al otro
  });

  it('silenciado no suena, y vuelve a sonar al activarlo', () => {
    const fake = fakeAudioContext();
    const sound = createPageTurnSound(false, () => fake.ctx);
    sound.play('next');
    expect(fake.counts.sources).toBe(0);
    sound.setEnabled(true);
    sound.play('prev');
    expect(fake.counts.sources).toBeGreaterThan(0);
  });

  it('al hojear varias páginas programa varias hojas', () => {
    const one = fakeAudioContext();
    createPageTurnSound(true, () => one.ctx).play('next');
    const many = fakeAudioContext();
    createPageTurnSound(true, () => many.ctx).play('next', { riffle: true });
    expect(many.counts.panners).toBe(4);
    expect(many.counts.sources).toBeGreaterThan(one.counts.sources * 3);
  });

  it('con la tecla mantenida no amontona sonidos (uno cada 80 ms como mucho)', () => {
    const fake = fakeAudioContext();
    let now = 10;
    const sound = createPageTurnSound(
      true,
      () => fake.ctx,
      () => now,
    );
    sound.play('next');
    const after = fake.counts.panners;
    now = 10.04;
    sound.play('next');
    expect(fake.counts.panners).toBe(after);
    now = 10.2;
    sound.play('next');
    expect(fake.counts.panners).toBe(after + 1);
  });

  it('sigue sonando aunque el navegador tenga el audio en pausa (su reloj no avanza)', () => {
    const fake = fakeAudioContext(); // currentTime se queda en 0 y el estado en «suspended»
    let now = 1;
    const sound = createPageTurnSound(
      true,
      () => fake.ctx,
      () => now,
    );
    sound.play('next');
    now = 2;
    sound.play('next');
    now = 3;
    sound.play('prev');
    expect(fake.counts.panners).toBe(3);
  });

  it('sin Web Audio en el navegador no falla: simplemente no suena', () => {
    const sound = createPageTurnSound(true, () => null);
    expect(() => {
      sound.play('next');
    }).not.toThrow();
  });

  it('guarda tu preferencia y por defecto el sonido está activado', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };
    expect(readSoundPreference(storage)).toBe(true);
    writeSoundPreference(storage, false);
    expect(readSoundPreference(storage)).toBe(false);
    writeSoundPreference(storage, true);
    expect(readSoundPreference(storage)).toBe(true);
  });

  it('si el navegador no deja guardar (modo privado), sigue funcionando', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(readSoundPreference(broken)).toBe(true);
    expect(() => {
      writeSoundPreference(broken, false);
    }).not.toThrow();
  });
});
