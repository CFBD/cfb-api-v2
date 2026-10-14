import { expressionBuilder } from 'kysely';

import type { DB } from '../../config/types/db';

export interface CpoeProduction {
  /** Attempts with a current compatible probability; zero if unavailable.
   * @isInt
   */
  cpoeAttemptsAvailable?: number;
  /** Completions on that same scored subset.
   * @isInt
   */
  cpoeCompletions?: number;
  /** Sum of scored probabilities, rounded to three decimals after aggregation. */
  expectedCompletions?: number | null;
  /** Expected completions / scored attempts, 0–1, rounded to three decimals. */
  expectedCompletionRate?: number | null;
  /** Percentage points, two decimals; defense retains the offensive residual sign. */
  cpoe?: number | null;
  /** Selected release shared by the scored attempts; null if unavailable. */
  cpoeModelVersion?: string | null;
}

interface Tables {
  cp: DB['passPlayCpoeCurrent'];
  pp: DB['passPlay'];
  play: DB['play'];
  representedTeam: DB['team'];
}

const field = (prefix: string, name: string) =>
  prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;

/** Join the unique current-read view; never aggregate stale stored predictions. */
export const cpoeAggregateSelections = (side?: 'offense' | 'defense') => {
  const eb = expressionBuilder<Tables, keyof Tables>();
  const scope = side
    ? eb(
        side === 'offense' ? 'play.offenseId' : 'play.defenseId',
        '=',
        eb.ref('representedTeam.id'),
      )
    : eb.val(true);
  const alias = (name: string) => field(side ?? '', name);
  return [
    eb.fn
      .count<number | string>('cp.playId')
      .filterWhere(scope)
      .as(alias('cpoeAttemptsAvailable')),
    eb.fn
      .count<number | string>('cp.playId')
      .filterWhere(eb.and([scope, eb('pp.outcome', '=', 'completion')]))
      .as(alias('cpoeCompletions')),
    eb.fn
      .sum<number | string | null>('cp.completionProbability')
      .filterWhere(scope)
      .as(alias('expectedCompletions')),
    eb.fn
      .count<number | string>('cp.modelVersion')
      .distinct()
      .filterWhere(scope)
      .as(alias('cpoeVersions')),
    eb.fn
      .min<string>('cp.modelVersion')
      .filterWhere(scope)
      .as(alias('cpoeModelVersion')),
  ];
};

export const unavailableCpoe = (): Required<CpoeProduction> => ({
  cpoeAttemptsAvailable: 0,
  cpoeCompletions: 0,
  expectedCompletions: null,
  expectedCompletionRate: null,
  cpoe: null,
  cpoeModelVersion: null,
});

const round = (value: number, places: number) =>
  Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places || 0;

export const mapCpoeProduction = (
  row: Record<string, string | number | null>,
  prefix = '',
): Required<CpoeProduction> => {
  const get = (name: string) => row[field(prefix, name)];
  const attempts = Number(get('cpoeAttemptsAvailable') ?? 0);
  const completions = Number(get('cpoeCompletions') ?? 0);
  const expected = Number(get('expectedCompletions'));
  const version = get('cpoeModelVersion');
  if (attempts === 0) return unavailableCpoe();
  if (
    Number(get('cpoeVersions')) !== 1 ||
    typeof version !== 'string' ||
    !version.trim() ||
    !Number.isSafeInteger(attempts) ||
    attempts < 0 ||
    !Number.isSafeInteger(completions) ||
    completions < 0 ||
    completions > attempts ||
    get('expectedCompletions') == null ||
    !Number.isFinite(expected) ||
    expected < 0 ||
    expected > attempts
  ) {
    console.error('Passing CPOE unavailable: inconsistent scored aggregate');
    return unavailableCpoe();
  }
  return {
    cpoeAttemptsAvailable: attempts,
    cpoeCompletions: completions,
    expectedCompletions: round(expected, 3),
    expectedCompletionRate: round(expected / attempts, 3),
    cpoe: round((100 * (completions - expected)) / attempts, 2),
    cpoeModelVersion: version,
  };
};

/** Old format-1 payloads may omit the entire additive projection. */
export const isOptionalCpoeProduction = (
  value: Record<string, unknown>,
): boolean => {
  const keys = Object.keys(unavailableCpoe());
  if (keys.every((key) => value[key] === undefined)) return true;
  const n = value.cpoeAttemptsAvailable;
  const c = value.cpoeCompletions;
  if (
    typeof n !== 'number' ||
    !Number.isSafeInteger(n) ||
    n < 0 ||
    typeof c !== 'number' ||
    !Number.isSafeInteger(c) ||
    c < 0 ||
    c > n ||
    typeof value.attempts !== 'number' ||
    n > value.attempts
  )
    return false;
  if (n === 0)
    return keys.every(
      (key) => value[key] === unavailableCpoe()[key as keyof CpoeProduction],
    );
  return (
    typeof value.expectedCompletions === 'number' &&
    Number.isFinite(value.expectedCompletions) &&
    value.expectedCompletions >= 0 &&
    value.expectedCompletions <= n &&
    typeof value.expectedCompletionRate === 'number' &&
    Number.isFinite(value.expectedCompletionRate) &&
    value.expectedCompletionRate >= 0 &&
    value.expectedCompletionRate <= 1 &&
    typeof value.cpoe === 'number' &&
    Number.isFinite(value.cpoe) &&
    Math.abs(value.cpoe) <= 100 &&
    typeof value.cpoeModelVersion === 'string' &&
    !!value.cpoeModelVersion.trim()
  );
};

/** Suppress a stored projection after withdrawal/replacement, without hiding base stats. */
export const currentSnapshotCpoe = <T extends Partial<CpoeProduction>>(
  value: T,
  selectedVersion: string | null | undefined,
): T & Required<CpoeProduction> => ({
  ...value,
  ...(selectedVersion && value.cpoeModelVersion === selectedVersion
    ? {
        cpoeAttemptsAvailable: value.cpoeAttemptsAvailable ?? 0,
        cpoeCompletions: value.cpoeCompletions ?? 0,
        expectedCompletions: value.expectedCompletions ?? null,
        expectedCompletionRate: value.expectedCompletionRate ?? null,
        cpoe: value.cpoe ?? null,
        cpoeModelVersion: value.cpoeModelVersion ?? null,
      }
    : unavailableCpoe()),
});
