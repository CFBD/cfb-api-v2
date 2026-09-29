import { Division } from '../../config/types/db';
import { isSeasonAdvanced } from './seasonOverviewPayload';
import {
  StatMetricKey,
  TeamSeasonStatRankings,
  TeamStatRank,
} from './seasonStatRankingTypes';
import { TeamSeasonAdvancedStats } from './seasonOverviewTypes';

export const STAT_RANK_TTL = 600000;
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number =>
  finite(v) && Number.isSafeInteger(v) && v > 0;
const fraction = (v: unknown): v is number => finite(v) && v >= 0 && v <= 1;
export const statDate = (v: unknown): v is string =>
  typeof v === 'string' &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const divisions: Division[] = ['fbs', 'fcs', 'ii', 'ii/iii', 'iii'];
type Unit =
  | TeamSeasonAdvancedStats['offense']
  | TeamSeasonAdvancedStats['defense'];
const observed = (u: Unit) => positive(u.plays);
const split =
  (
    key: 'passingPlays' | 'rushingPlays' | 'standardDowns' | 'passingDowns',
    successful = false,
  ) =>
  (u: Unit) =>
    observed(u) &&
    fraction(u[key].rate) &&
    u[key].rate > 0 &&
    (!successful || (fraction(u[key].successRate) && u[key].successRate > 0));
interface Metric {
  key: StatMetricKey;
  offenseHigh: boolean;
  defenseHigh: boolean;
  eligible: (u: Unit) => boolean;
  rate?: boolean;
}
const production = (
  key: StatMetricKey,
  eligible = observed,
  rate = false,
): Metric => ({ key, offenseHigh: true, defenseHigh: false, eligible, rate });
export const statCatalog: readonly Metric[] = [
  production('ppa'),
  production('successRate', observed, true),
  production(
    'explosiveness',
    (u) => observed(u) && fraction(u.successRate) && u.successRate > 0,
  ),
  production('standardDowns.successRate', split('standardDowns'), true),
  production('passingDowns.successRate', split('passingDowns'), true),
  production('passingPlays.ppa', split('passingPlays')),
  production('rushingPlays.ppa', split('rushingPlays')),
  production('passingPlays.explosiveness', split('passingPlays', true)),
  production('rushingPlays.explosiveness', split('rushingPlays', true)),
  ...(['lineYards', 'secondLevelYards', 'openFieldYards'] as const).map((k) =>
    production(k, split('rushingPlays')),
  ),
  {
    ...production('stuffRate', split('rushingPlays'), true),
    offenseHigh: false,
    defenseHigh: true,
  },
  production(
    'powerSuccess',
    (u) =>
      observed(u) &&
      positive(u.powerRushAttempts) &&
      u.powerRushAttempts <= u.plays,
    true,
  ),
  ...(['havoc.total', 'havoc.frontSeven', 'havoc.db'] as const).map((key) => ({
    key,
    offenseHigh: false,
    defenseHigh: true,
    eligible: () => true,
    rate: true,
  })),
  production('pointsPerOpportunity', (u) => positive(u.totalOpportunies)),
  {
    key: 'fieldPosition.averageStart',
    offenseHigh: false,
    defenseHigh: true,
    eligible: () => true,
  },
  {
    key: 'fieldPosition.averagePredictedPoints',
    offenseHigh: true,
    defenseHigh: true,
    eligible: () => true,
  },
];
export const statMetricKeys = statCatalog.map((m) => m.key);
const valueAt = (unit: Unit, key: StatMetricKey): unknown =>
  key
    .split('.')
    .reduce<unknown>((v, k) => (object(v) ? v[k] : undefined), unit);
const empty = () =>
  Object.fromEntries(
    statMetricKeys.map((k) => [k, null]),
  ) as TeamSeasonStatRankings['offense'];
export interface StatCohortRow {
  teamId: number;
  team: string;
  division: Division | null;
  season: number | null;
  snapshotTeamId: number | null;
  formatVersion: number | null;
  generatedAt: Date | string | null;
  advanced: unknown;
}
export interface StatCohort {
  catalogVersion: 1;
  season: number;
  calculatedAt: string;
  expiresAt: string;
  teams: Record<string, TeamSeasonStatRankings>;
}
export function calculateStatCohort(
  rows: StatCohortRow[],
  season: number,
  now = Date.now(),
): StatCohort {
  const calculatedAt = new Date(now).toISOString(),
    expiresAt = new Date(now + STAT_RANK_TTL).toISOString();
  const cohort: StatCohort = {
    catalogVersion: 1,
    season,
    calculatedAt,
    expiresAt,
    teams: {},
  };
  // Collapse repeated memberships and exclude ambiguous identities even in source fixtures.
  const membership = new Map<number, StatCohortRow[]>();
  for (const row of rows)
    if (
      positive(row.teamId) &&
      row.division &&
      divisions.includes(row.division)
    ) {
      membership.set(row.teamId, [...(membership.get(row.teamId) ?? []), row]);
    }
  const members = [...membership.values()]
    .filter((rs) => new Set(rs.map((r) => r.division)).size === 1)
    .map((rs) => rs[0]);
  for (const division of divisions) {
    const group = members.filter((r) => r.division === division);
    const valid: Array<{
      row: StatCohortRow;
      advanced: TeamSeasonAdvancedStats;
    }> = [];
    for (const row of group) {
      const date =
        row.generatedAt instanceof Date &&
        Number.isFinite(row.generatedAt.getTime())
          ? row.generatedAt.toISOString()
          : row.generatedAt;
      if (
        row.season !== season ||
        row.snapshotTeamId !== row.teamId ||
        row.formatVersion !== 1 ||
        !statDate(date) ||
        Date.parse(date) > now ||
        !isSeasonAdvanced(row.advanced, season, row.team)
      )
        continue;
      valid.push({ row, advanced: row.advanced });
      cohort.teams[row.teamId] = {
        teamId: row.teamId,
        season,
        division,
        divisionTeamCount: group.length,
        calculatedAt,
        expiresAt,
        sourceUpdatedAt: date,
        offense: empty(),
        defense: empty(),
      };
    }
    for (const unit of ['offense', 'defense'] as const)
      for (const metric of statCatalog) {
        const values = valid.flatMap(({ row, advanced }) => {
          const u = advanced[unit],
            value = valueAt(u, metric.key);
          return finite(value) &&
            (!metric.rate || fraction(value)) &&
            metric.eligible(u) &&
            (metric.key !== 'fieldPosition.averageStart' ||
              (value >= 0 && value <= 100))
            ? [{ id: row.teamId, value }]
            : [];
        });
        const n = values.length;
        if (n < 2) continue;
        const high =
          unit === 'offense' ? metric.offenseHigh : metric.defenseHigh;
        values.sort((a, b) => (high ? b.value - a.value : a.value - b.value));
        for (let i = 0; i < n; ) {
          let end = i + 1;
          while (end < n && values[end].value === values[i].value) end++;
          const rank: TeamStatRank = {
            rank: i + 1,
            population: n,
            tied: end - i > 1,
            percentile:
              Math.round((1000 * (n - end + (end - i - 1) / 2)) / (n - 1)) / 10,
          };
          for (let j = i; j < end; j++)
            cohort.teams[values[j].id][unit][metric.key] = { ...rank };
          i = end;
        }
      }
  }
  return cohort;
}
export function validStatRankings(
  v: unknown,
  teamId: number,
  season: number,
  now = Date.now(),
): v is TeamSeasonStatRankings {
  if (
    !object(v) ||
    v.teamId !== teamId ||
    !positive(teamId) ||
    v.season !== season ||
    !positive(season) ||
    !divisions.includes(v.division as Division) ||
    !positive(v.divisionTeamCount) ||
    !statDate(v.calculatedAt) ||
    !statDate(v.expiresAt) ||
    !statDate(v.sourceUpdatedAt) ||
    Date.parse(v.calculatedAt) > now ||
    Date.parse(v.sourceUpdatedAt) > Date.parse(v.calculatedAt) ||
    Date.parse(v.expiresAt) <= now ||
    Date.parse(v.expiresAt) <= Date.parse(v.calculatedAt) ||
    Date.parse(v.expiresAt) - Date.parse(v.calculatedAt) > STAT_RANK_TTL
  )
    return false;
  const count = v.divisionTeamCount;
  return ['offense', 'defense'].every((unit) => {
    const map = v[unit];
    return (
      object(map) &&
      statMetricKeys.every((key) => {
        const rank = map[key];
        return (
          rank === null ||
          (object(rank) &&
            positive(rank.rank) &&
            positive(rank.population) &&
            rank.population >= 2 &&
            rank.rank <= rank.population &&
            rank.population <= count &&
            typeof rank.tied === 'boolean' &&
            finite(rank.percentile) &&
            rank.percentile >= 0 &&
            rank.percentile <= 100)
        );
      })
    );
  });
}
export function validStatCohort(v: unknown, season: number): v is StatCohort {
  return (
    object(v) &&
    v.catalogVersion === 1 &&
    v.season === season &&
    statDate(v.calculatedAt) &&
    statDate(v.expiresAt) &&
    Date.parse(v.calculatedAt) <= Date.now() &&
    Date.parse(v.expiresAt) > Date.now() &&
    Date.parse(v.expiresAt) > Date.parse(v.calculatedAt) &&
    Date.parse(v.expiresAt) - Date.parse(v.calculatedAt) <= STAT_RANK_TTL &&
    object(v.teams) &&
    Object.entries(v.teams).every(
      ([id, team]) =>
        validStatRankings(team, Number(id), season) &&
        team.calculatedAt === v.calculatedAt &&
        team.expiresAt === v.expiresAt,
    )
  );
}
export function matchingStatRankings(
  cohort: StatCohort | null,
  teamId: number,
  season: number,
  source: unknown,
): TeamSeasonStatRankings | null {
  const value = cohort?.teams[teamId];
  const date =
    source instanceof Date && Number.isFinite(source.getTime())
      ? source.toISOString()
      : source;
  return value &&
    validStatRankings(value, teamId, season) &&
    value.sourceUpdatedAt === date
    ? value
    : null;
}
