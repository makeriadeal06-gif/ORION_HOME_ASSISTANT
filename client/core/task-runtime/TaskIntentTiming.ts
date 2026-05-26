import { TaskTimingDirective } from './types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const WEEKDAY_LOOKUP: Record<string, number> = {
  domingo: 0,
  dom: 0,
  segunda: 1,
  'segunda-feira': 1,
  seg: 1,
  terca: 2,
  terça: 2,
  'terca-feira': 2,
  'terça-feira': 2,
  ter: 2,
  quarta: 3,
  'quarta-feira': 3,
  qua: 3,
  quinta: 4,
  'quinta-feira': 4,
  qui: 4,
  sexta: 5,
  'sexta-feira': 5,
  sex: 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
};

export function parseTaskTimingDirective(text: string): TaskTimingDirective {
  const raw = text.trim();
  const lowered = raw.toLowerCase();

  const relativeMatch = lowered.match(/(?:daqui\s+a?|em)\s+(\d+)\s+(minuto|minutos|hora|horas)\b/i);
  if (relativeMatch) {
    const amount = Number(relativeMatch[1] || 0);
    const unit = relativeMatch[2];
    const multiplier = unit.startsWith('hora') ? HOUR_MS : MINUTE_MS;
    return {
      executeAfterMs: amount * multiplier,
      cleanedText: cleanupTaskText(removeMatch(raw, relativeMatch[0])),
      isDelayed: true,
      timingKind: 'relative',
      matchedText: relativeMatch[0],
    };
  }

  const timeMatch = lowered.match(/\b(?:as|a\s+partir\s+das|às)\s*(\d{1,2})(?::(\d{2}))?(?:\s*h(?:oras?)?)?\b/i);
  const tomorrowMatch = lowered.match(/\bamanh[ãa]\b/i);
  const weekdayMatch = findWeekdayMatch(lowered);

  if (timeMatch || tomorrowMatch || weekdayMatch) {
    const hours = timeMatch ? Number(timeMatch[1]) : 9;
    const minutes = timeMatch ? Number(timeMatch[2] || 0) : 0;
    const executeAt = resolveFutureDate(hours, minutes, tomorrowMatch?.[0] || null, weekdayMatch?.match || null);
    const cleanedText = cleanupTaskText(removeMatches(raw, [timeMatch?.[0], tomorrowMatch?.[0], weekdayMatch?.match]));
    return {
      executeAt,
      cleanedText,
      isDelayed: true,
      timingKind: tomorrowMatch ? 'tomorrow' : weekdayMatch ? 'weekday' : 'absolute_time',
      matchedText: tomorrowMatch?.[0] || weekdayMatch?.match || timeMatch?.[0] || null,
    };
  }

  return {
    cleanedText: cleanupTaskText(raw),
    isDelayed: false,
    timingKind: undefined,
    matchedText: null,
  };
}

function resolveFutureDate(hours: number, minutes: number, tomorrowMatch: string | null, weekdayMatch: string | null): number {
  const now = new Date();
  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setHours(hours, minutes, 0, 0);

  if (tomorrowMatch) {
    target.setDate(target.getDate() + 1);
    return target.getTime();
  }

  if (weekdayMatch) {
    const weekday = WEEKDAY_LOOKUP[normalizeWeekday(weekdayMatch)];
    const current = target.getDay();
    let offset = weekday - current;
    if (offset < 0 || (offset === 0 && target.getTime() <= now.getTime())) {
      offset += 7;
    }
    target.setDate(target.getDate() + offset);
    return target.getTime();
  }

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

function findWeekdayMatch(lowered: string): { match: string } | null {
  const entries = Object.keys(WEEKDAY_LOOKUP).sort((left, right) => right.length - left.length);
  for (const entry of entries) {
    const regex = new RegExp(`\\b${escapeRegex(entry)}\\b`, 'i');
    const match = lowered.match(regex);
    if (match) {
      return { match: match[0] };
    }
  }
  return null;
}

function normalizeWeekday(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function removeMatch(text: string, match: string): string {
  return text.replace(match, ' ');
}

function removeMatches(text: string, matches: Array<string | undefined | null>): string {
  return matches
    .filter((match): match is string => typeof match === 'string' && match.length > 0)
    .reduce((current, match) => current.replace(match, ' '), text);
}

function cleanupTaskText(text: string): string {
  return text.replace(/^[,\s]+|[,\s]+$/g, '').replace(/\s+/g, ' ');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
