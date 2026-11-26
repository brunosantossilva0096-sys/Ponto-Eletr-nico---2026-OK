// Utilitários de data/hora locais (fuso do navegador, ex: BRT UTC-3)
// Evita bugs de deslocamento de dia causados por .toISOString().split('T')[0] após as 21:00.

export function toLocalDateStr(input?: Date | string | number | null): string {
  if (!input) {
    const now = new Date();
    return formatDateParts(now);
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) {
    return typeof input === 'string' ? input.split('T')[0] : formatDateParts(new Date());
  }
  return formatDateParts(d);
}

function formatDateParts(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toLocalTimeStr(input: Date | string): string {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '00:00';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function getFirstDayOfMonthStr(refDate: Date = new Date()): string {
  const first = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  return formatDateParts(first);
}

export function formatDateBr(dateStr?: string | null): string {
  if (!dateStr) return '';
  const clean = dateStr.includes('T') ? toLocalDateStr(dateStr) : dateStr;
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function buildLocalTimestampIso(dateStr: string, timeStr: string): string {
  const cleanTime = (timeStr || '00:00').trim().substring(0, 5);
  const d = new Date(`${dateStr}T${cleanTime}:00`);
  return d.toISOString();
}

export function getLocalDayBoundsIso(startDateStr: string, endDateStr: string): { startIso: string; endIso: string } {
  const start = new Date(`${startDateStr}T00:00:00.000`);
  const end = new Date(`${endDateStr}T23:59:59.999`);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function parseHHMMToMinutes(str?: string | null): number | null {
  if (!str) return null;
  const trimmed = str.trim();
  if (!trimmed || trimmed === '-') return null;
  const parts = trimmed.split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Calcula minutos líquidos de trabalho de um turno (suporta 4 batidas com intervalo,
 * turno contínuo sem intervalo ex: Sábado 07:00-12:00, ou meio período ws->bs).
 */
export function calcShiftWorkMinutes(
  workStart?: string | null,
  breakStart?: string | null,
  breakEnd?: string | null,
  workEnd?: string | null
): number {
  const ws = parseHHMMToMinutes(workStart);
  const bs = parseHHMMToMinutes(breakStart);
  const be = parseHHMMToMinutes(breakEnd);
  const we = parseHHMMToMinutes(workEnd);

  if (ws !== null && bs !== null && be !== null && we !== null) {
    return Math.max(0, bs - ws) + Math.max(0, we - be);
  }
  if (ws !== null && we !== null && (bs === null || be === null)) {
    return Math.max(0, we - ws);
  }
  if (ws !== null && bs !== null && be === null && we === null) {
    return Math.max(0, bs - ws);
  }
  return 0;
}

/**
 * Calcula a data da Páscoa (algoritmo de Meeus/Jones/Butcher) e retorna todos os
 * feriados nacionais brasileiros (fixos + móveis) para qualquer ano.
 */
export function getBrazilianNationalHolidays(year: number): Array<{ date: string; name: string; type: string }> {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Abr
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  const easter = new Date(year, month - 1, day);
  const addDays = (base: Date, offset: number) => {
    const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    return formatDateParts(dt);
  };

  const holidays = [
    { date: `${year}-01-01`, name: 'Confraternização Universal', type: 'Nacional' },
    { date: addDays(easter, -47), name: 'Carnaval', type: 'Nacional' },
    { date: addDays(easter, -2), name: 'Sexta-feira Santa (Paixão de Cristo)', type: 'Nacional' },
    { date: `${year}-04-21`, name: 'Tiradentes', type: 'Nacional' },
    { date: `${year}-05-01`, name: 'Dia do Trabalhador', type: 'Nacional' },
    { date: addDays(easter, 60), name: 'Corpus Christi', type: 'Nacional' },
    { date: `${year}-09-07`, name: 'Independência do Brasil', type: 'Nacional' },
    { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida', type: 'Nacional' },
    { date: `${year}-11-02`, name: 'Finados', type: 'Nacional' },
    { date: `${year}-11-15`, name: 'Proclamação da República', type: 'Nacional' },
    { date: `${year}-11-20`, name: 'Dia Nacional de Zumbi e da Consciência Negra', type: 'Nacional' },
    { date: `${year}-12-25`, name: 'Natal', type: 'Nacional' },
  ];

  return holidays.sort((x, y) => x.date.localeCompare(y.date));
}
