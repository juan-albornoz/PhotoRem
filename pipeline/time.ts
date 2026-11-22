/**
 * Horas de las fotos. El iPhone guarda la hora local con su zona horaria; la Canon guarda
 * una hora local sin zona fiable (está configurada en «Santiago de Chile»), así que se lee
 * como hora de Europe/Madrid y se corrige con la calibración contra el iPhone.
 */

const NAIVE_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

/** Interpreta `YYYY-MM-DDTHH:mm:ss(.SSS)` como si fuera UTC (para hacer cuentas con horas locales). */
export function naiveToMs(local: string): number {
  const m = NAIVE_LOCAL.exec(local);
  if (!m) throw new Error(`Hora local no válida: ${local}`);
  const [, y, mo, d, h, mi, s, ms] = m;
  return Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
    Number((ms ?? '0').padEnd(3, '0')),
  );
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Desfase en minutos de `timeZone` respecto a UTC en el instante `utcMs` (Madrid: +120 en verano, +60 en invierno). */
export function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/** Convierte una hora local sin zona de `timeZone` a un instante UTC (ms). */
export function localToUtc(local: string, timeZone: string): number {
  const naive = naiveToMs(local);
  let utc = naive - zoneOffsetMinutes(naive, timeZone) * 60_000;
  // Segunda pasada por si el primer intento cruzó un cambio de hora.
  utc = naive - zoneOffsetMinutes(utc, timeZone) * 60_000;
  return utc;
}

export interface TimedRecord {
  local: string | null;
  offsetMinutes: number | null;
}

/**
 * Instante UTC de una foto o vídeo.
 * - iPhone: hora local + su desfase; si falta el desfase, las reglas de `timeZone`.
 * - Canon: hora local leída en `timeZone` + `canonCorrectionSeconds`.
 */
export function captureUtc(
  record: TimedRecord,
  source: 'canon' | 'iphone',
  timeZone: string,
  canonCorrectionSeconds: number,
): number | null {
  if (record.local === null) return null;
  if (source === 'canon') {
    // La corrección son segundos que hay que sumar al reloj de la Canon para obtener la hora real.
    return localToUtc(record.local, timeZone) + canonCorrectionSeconds * 1000;
  }
  if (record.offsetMinutes !== null) {
    return naiveToMs(record.local) - record.offsetMinutes * 60_000;
  }
  return localToUtc(record.local, timeZone);
}

/** Hora local de `timeZone` en formato `YYYY-MM-DDTHH:mm:ss` para mostrar o guardar. */
export function utcToLocal(utcMs: number, timeZone: string): string {
  const shifted = utcMs + zoneOffsetMinutes(utcMs, timeZone) * 60_000;
  return new Date(shifted).toISOString().slice(0, 19);
}
