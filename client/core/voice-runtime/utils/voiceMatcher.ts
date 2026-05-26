import { TriggerDevice } from '../../runtime/TriggerManager';

export const MATCH_CONFIDENCE_THRESHOLD = 0.65;
const AMBIGUITY_DELTA = 0.05;

const DEFAULT_ALIAS_MAP: Record<string, string> = {
  spotify: 'open spotify',
  'abrir spotify': 'open spotify',
  'desligar pc': 'shutdown',
  'desligar computador': 'shutdown',
  'desligue o pc': 'shutdown',
  'desligue o computador': 'shutdown',
  'desligar o computador': 'shutdown',
  'abrir navegador': 'open chrome',
  'abrir browser': 'open chrome',
  calculadora: 'open calculator',
  calc: 'open calculator',
  'abrir calculadora': 'open calculator',
};

const runtimeAliasMap = new Map<string, string>();

export type VoiceMatchType =
  | 'exact_name'
  | 'exact_alias'
  | 'normalized'
  | 'word_match'
  | 'fallback'
  | 'multiple_matches'
  | 'none';

export interface VoiceMatchCandidate {
  deviceId: string;
  name: string;
  confidence: number;
  matchType: Exclude<VoiceMatchType, 'multiple_matches' | 'none'>;
}

type ScoredCandidate = VoiceMatchCandidate & {
  device: TriggerDevice;
};

export interface VoiceMatchResult {
  device: TriggerDevice | null;
  confidence: number;
  matchType: VoiceMatchType;
  normalizedInput: string;
  resolvedInput: string;
  aliasApplied: boolean;
  candidates: VoiceMatchCandidate[];
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitWords(text: string): string[] {
  return normalizeText(text).split(/\s+/).filter((word) => word.length >= 2);
}

export function registerVoiceAliases(aliases: Record<string, string>): void {
  for (const [key, value] of Object.entries(aliases)) {
    const normalizedKey = normalizeText(key);
    const normalizedValue = normalizeText(value);
    if (normalizedKey && normalizedValue) {
      runtimeAliasMap.set(normalizedKey, normalizedValue);
    }
  }
}

export function getVoiceAliases(): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const [key, value] of Object.entries(DEFAULT_ALIAS_MAP)) {
    merged[normalizeText(key)] = normalizeText(value);
  }

  for (const [key, value] of runtimeAliasMap.entries()) {
    merged[key] = value;
  }

  return merged;
}

export function resolveAliases(text: string): { resolved: string; applied: boolean; aliasKey: string | null } {
  const normalized = normalizeText(text);
  const aliases = getVoiceAliases();
  const resolved = aliases[normalized];

  if (!resolved) {
    return { resolved: normalized, applied: false, aliasKey: null };
  }

  return { resolved, applied: true, aliasKey: normalized };
}

export function findBestMatch(input: string, devices: TriggerDevice[]): VoiceMatchResult {
  const normalizedInput = normalizeText(input);
  const aliasResolution = resolveAliases(normalizedInput);
  const resolvedInput = aliasResolution.resolved;

  if (!devices || devices.length === 0 || !resolvedInput) {
    return {
      device: null,
      confidence: 0,
      matchType: 'none',
      normalizedInput,
      resolvedInput,
      aliasApplied: aliasResolution.applied,
      candidates: []
    };
  }

  const exactName = buildCandidates(devices, (device) => {
    return normalizeText(device.name) === normalizedInput
      ? { confidence: 1.0, matchType: 'exact_name' }
      : null;
  });
  if (exactName.length > 0) {
    return finalizeMatch(exactName, normalizedInput, resolvedInput, aliasResolution.applied);
  }

  const exactAlias = aliasResolution.applied
    ? buildCandidates(devices, (device) => {
        const phrases = getDevicePhrases(device);
        return phrases.includes(resolvedInput)
          ? { confidence: 0.95, matchType: 'exact_alias' }
          : null;
      })
    : [];
  if (exactAlias.length > 0) {
    return finalizeMatch(exactAlias, normalizedInput, resolvedInput, aliasResolution.applied);
  }

  const normalizedPhrase = buildCandidates(devices, (device) => {
    return normalizeText(device.cmd) === resolvedInput
      ? { confidence: 0.85, matchType: 'normalized' }
      : null;
  });
  if (normalizedPhrase.length > 0) {
    return finalizeMatch(normalizedPhrase, normalizedInput, resolvedInput, aliasResolution.applied);
  }

  const wordMatches = buildCandidates(devices, (device) => scoreWordCoverage(resolvedInput, device));
  if (wordMatches.length > 0) {
    return finalizeMatch(wordMatches, normalizedInput, resolvedInput, aliasResolution.applied);
  }

  const fallbackMatches = buildCandidates(devices, (device) => scoreFallback(resolvedInput, device));
  if (fallbackMatches.length > 0) {
    return finalizeMatch(fallbackMatches, normalizedInput, resolvedInput, aliasResolution.applied);
  }

  return {
    device: null,
    confidence: 0,
    matchType: 'none',
    normalizedInput,
    resolvedInput,
    aliasApplied: aliasResolution.applied,
    candidates: []
  };
}

function buildCandidates(
  devices: TriggerDevice[],
  scorer: (device: TriggerDevice) => { confidence: number; matchType: VoiceMatchCandidate['matchType'] } | null
): ScoredCandidate[] {
  return devices
    .map((device) => {
      const result = scorer(device);
      return result
        ? {
            device,
            deviceId: device.id,
            name: device.name,
            confidence: roundConfidence(result.confidence),
            matchType: result.matchType,
          }
        : null;
    })
    .filter((candidate): candidate is ScoredCandidate => Boolean(candidate))
    .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
}

function finalizeMatch(
  candidates: ScoredCandidate[],
  normalizedInput: string,
  resolvedInput: string,
  aliasApplied: boolean
): VoiceMatchResult {
  const top = candidates[0] || null;
  const runnerUp = candidates[1] || null;

  if (!top) {
    return {
      device: null,
      confidence: 0,
      matchType: 'none',
      normalizedInput,
      resolvedInput,
      aliasApplied,
      candidates: []
    };
  }

  if (runnerUp && top.confidence >= MATCH_CONFIDENCE_THRESHOLD) {
    const sameStrength = Math.abs(top.confidence - runnerUp.confidence) <= AMBIGUITY_DELTA;
    if (sameStrength) {
      return {
        device: null,
        confidence: top.confidence,
        matchType: 'multiple_matches',
        normalizedInput,
        resolvedInput,
        aliasApplied,
        candidates: candidates.slice(0, 3).map(stripCandidate)
      };
    }
  }

  return {
    device: top.device,
    confidence: top.confidence,
    matchType: top.matchType,
    normalizedInput,
    resolvedInput,
    aliasApplied,
    candidates: candidates.slice(0, 3).map(stripCandidate)
  };
}

function scoreWordCoverage(input: string, device: TriggerDevice) {
  const inputWords = splitWords(input);
  if (inputWords.length === 0) return null;

  const nameWords = splitWords(device.name);
  const cmdWords = splitWords(device.cmd);
  const allWords = [...new Set([...nameWords, ...cmdWords])];
  if (allWords.length === 0) return null;

  const matchedWords = inputWords.filter((word) => allWords.includes(word));
  if (matchedWords.length === 0) return null;

  const inputCoverage = matchedWords.length / inputWords.length;
  const phraseCoverage = matchedWords.length / allWords.length;
  const firstWordBonus = inputWords[0] && allWords.includes(inputWords[0]) ? 0.05 : 0;
  const fullInputBonus = matchedWords.length === inputWords.length ? 0.05 : 0;

  const score = Math.min(0.84, 0.45 + inputCoverage * 0.2 + phraseCoverage * 0.15 + firstWordBonus + fullInputBonus);
  if (score < MATCH_CONFIDENCE_THRESHOLD) {
    return null;
  }

  return { confidence: score, matchType: 'word_match' as const };
}

function scoreFallback(input: string, device: TriggerDevice) {
  const inputWords = splitWords(input);
  if (inputWords.length !== 1) return null;

  const allWords = [...new Set([...splitWords(device.name), ...splitWords(device.cmd)])];
  if (!allWords.includes(inputWords[0])) return null;

  return { confidence: 0.49, matchType: 'fallback' as const };
}

function getDevicePhrases(device: TriggerDevice): string[] {
  return [...new Set([normalizeText(device.name), normalizeText(device.cmd)].filter(Boolean))];
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function stripCandidate(candidate: ScoredCandidate): VoiceMatchCandidate {
  return {
    deviceId: candidate.deviceId,
    name: candidate.name,
    confidence: candidate.confidence,
    matchType: candidate.matchType,
  };
}
