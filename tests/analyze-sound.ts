/// <reference lib="dom" />
// Herramienta de revisión (no es una prueba): renderiza el sonido de página y lo mide.
// Uso (con la app en marcha): npx tsx tests/analyze-sound.ts <carpeta-salida>
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

import type * as SoundModule from '../src/book/pageTurnSound.ts';

const out = process.argv[2] ?? '.';
const RATE = 44100;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/#/libro');

async function render(riffle: boolean): Promise<[number[], number[]]> {
  return page.evaluate(
    async ({ riffle, RATE }) => {
      // Ruta del navegador (la sirve Vite): en una variable para que TypeScript no intente resolverla.
      const modulePath = '/src/book/pageTurnSound.ts';
      const m = (await import(/* @vite-ignore */ modulePath)) as typeof SoundModule;
      const ctx = new OfflineAudioContext(2, Math.floor(RATE * 1.2), RATE);
      const noise = m.pinkNoise(ctx, 2);
      const master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      if (riffle) {
        for (let i = 0; i < 4; i += 1)
          m.scheduleTurn(ctx, noise, master, 0.05 + i * 0.075, 'next', 0.6, 0.55);
      } else {
        m.scheduleTurn(ctx, noise, master, 0.05, 'next');
      }
      const buf = await ctx.startRendering();
      return [Array.from(buf.getChannelData(0)), Array.from(buf.getChannelData(1))] as [
        number[],
        number[],
      ];
    },
    { riffle, RATE },
  );
}

function analyze(name: string, [l, r]: [number[], number[]]): void {
  const n = l.length;
  const mono = l.map((v, i) => (v + (r[i] ?? 0)) / 2);
  const peak = Math.max(...l.map(Math.abs), ...r.map(Math.abs));
  const win = Math.floor(RATE * 0.02);
  const rms: number[] = [];
  for (let i = 0; i + win <= n; i += win) {
    let s = 0;
    for (let j = i; j < i + win; j += 1) s += (mono[j] ?? 0) ** 2;
    rms.push(Math.sqrt(s / win));
  }
  const maxRms = Math.max(...rms);
  const audible = rms.map((v, i) => (v > maxRms * 0.03 ? i : -1)).filter((i) => i >= 0);
  const start = (audible[0] ?? 0) * 0.02;
  const end = ((audible.at(-1) ?? 0) + 1) * 0.02;
  // Centroide espectral en la zona de más energía (DFT simple de 100 Hz a 10 kHz).
  const centre = rms.indexOf(maxRms) * win;
  const size = 4096;
  let num = 0;
  let den = 0;
  for (let f = 100; f <= 10000; f += 100) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < size; k += 1) {
      const x =
        (mono[centre - size / 2 + k] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / size));
      re += x * Math.cos((2 * Math.PI * f * k) / RATE);
      im -= x * Math.sin((2 * Math.PI * f * k) / RATE);
    }
    const mag = Math.hypot(re, im);
    num += f * mag;
    den += mag;
  }
  // Paneo: energía izquierda/derecha al principio y al final del sonido.
  const energy = (ch: number[], from: number, to: number): number => {
    let s = 0;
    for (let i = Math.floor(from * RATE); i < Math.floor(to * RATE); i += 1) s += (ch[i] ?? 0) ** 2;
    return s;
  };
  const third = (end - start) / 3;
  const panStart = energy(r, start, start + third) / (energy(l, start, start + third) + 1e-12);
  const panEnd = energy(r, end - third, end) / (energy(l, end - third, end) + 1e-12);
  console.log(
    `${name}: audible ${start.toFixed(2)}–${end.toFixed(2)} s (${((end - start) * 1000).toFixed(0)} ms) · pico ${(20 * Math.log10(peak)).toFixed(1)} dBFS · centroide ${String(Math.round(num / den))} Hz · derecha/izquierda al empezar ${panStart.toFixed(2)}, al terminar ${panEnd.toFixed(2)}`,
  );
  // WAV estéreo de 16 bits para escucharlo.
  const data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 4, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i += 1) {
    data.writeInt16LE(Math.max(-1, Math.min(1, l[i] ?? 0)) * 32767, 44 + i * 4);
    data.writeInt16LE(Math.max(-1, Math.min(1, r[i] ?? 0)) * 32767, 46 + i * 4);
  }
  writeFileSync(path.join(out, `${name}.wav`), data);
}

analyze('hoja', await render(false));
analyze('hoja-2', await render(false));
analyze('hojear', await render(true));
await browser.close();
