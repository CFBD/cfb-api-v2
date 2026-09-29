import { TeamSeasonAdvancedStats } from './seasonOverviewTypes';
import {
  calculateStatCohort,
  matchingStatRankings,
  StatCohortRow,
  statCatalog,
  validStatCohort,
} from './seasonStatRankings';
import fixture from './fixtures/team-season-snapshots/contract.json';
const now = Date.now();
function row(id: number, value = 0): StatCohortRow {
  const advanced: TeamSeasonAdvancedStats = structuredClone(fixture.advanced);
  advanced.team = `Team ${id}`;
  for (const unit of [advanced.offense, advanced.defense]) {
    unit.ppa = value;
    unit.plays = 100;
    unit.successRate = 0.5;
    unit.havoc = { total: 0, frontSeven: 0, db: 0 };
    unit.totalOpportunies = 10;
    Object.assign(unit, { powerRushAttempts: 10 });
    for (const split of [
      unit.passingPlays,
      unit.rushingPlays,
      unit.standardDowns,
      unit.passingDowns,
    ])
      Object.assign(split, { rate: 0.5, successRate: 0.5 });
  }
  return {
    teamId: id,
    team: advanced.team,
    season: 2025,
    snapshotTeamId: id,
    division: 'fbs',
    formatVersion: 1,
    generatedAt: new Date(now - 1000),
    advanced,
  };
}
const advanced = (r: StatCohortRow) => r.advanced as typeof fixture.advanced;
it('ranks ties, zero and negative values using competition ranks and average positions', () => {
  const cohort = calculateStatCohort(
    [row(1, 10), row(2, 8), row(3, 8), row(4, -2)],
    2025,
    now,
  );
  expect([1, 2, 3, 4].map((id) => cohort.teams[id].offense.ppa)).toEqual([
    { rank: 1, percentile: 100, population: 4, tied: false },
    { rank: 2, percentile: 50, population: 4, tied: true },
    { rank: 2, percentile: 50, population: 4, tied: true },
    { rank: 4, percentile: 0, population: 4, tied: false },
  ]);
  expect(cohort.teams[4].defense.ppa?.rank).toBe(1);
  const equal = calculateStatCohort([row(1), row(2)], 2025, now);
  expect(equal.teams[1].offense.ppa).toEqual({
    rank: 1,
    population: 2,
    tied: true,
    percentile: 50,
  });
});
// Independent expected direction examples, including the already-negated defensive EP.
it.each([
  ['ppa', -0.5, 0.5, 2, 1],
  ['successRate', 0, 0.5, 2, 1],
  ['explosiveness', -1, 1, 2, 1],
  ['standardDowns.successRate', 0, 0.5, 2, 1],
  ['passingDowns.successRate', 0, 0.5, 2, 1],
  ['passingPlays.ppa', -1, 1, 2, 1],
  ['rushingPlays.ppa', -1, 1, 2, 1],
  ['passingPlays.explosiveness', -1, 1, 2, 1],
  ['rushingPlays.explosiveness', -1, 1, 2, 1],
  ['lineYards', -1, 1, 2, 1],
  ['secondLevelYards', -1, 1, 2, 1],
  ['openFieldYards', -1, 1, 2, 1],
  ['stuffRate', 0, 0.5, 1, 2],
  ['powerSuccess', 0, 0.5, 2, 1],
  ['havoc.total', 0, 0.5, 1, 2],
  ['havoc.frontSeven', 0, 0.5, 1, 2],
  ['havoc.db', 0, 0.5, 1, 2],
  ['pointsPerOpportunity', 0, 3, 2, 1],
  ['fieldPosition.averageStart', 30, 80, 1, 2],
  ['fieldPosition.averagePredictedPoints', -1.5, -0.5, 2, 2],
])('%s retains unit-specific direction', (key, low, high, offRank, defRank) => {
  const a = row(1),
    b = row(2);
  for (const [r, value] of [
    [a, low],
    [b, high],
  ] as const)
    for (const unit of ['offense', 'defense'] as const) {
      const path = String(key).split('.');
      const obj = advanced(r)[unit] as unknown as Record<string, unknown>;
      if (path.length === 1) obj[path[0]] = value;
      else (obj[path[0]] as Record<string, unknown>)[path[1]] = value;
    }
  const c = calculateStatCohort([a, b], 2025, now);
  const metric = statCatalog.find((m) => m.key === key)!.key;
  expect(c.teams[1].offense[metric]?.rank).toBe(offRank);
  expect(c.teams[1].defense[metric]?.rank).toBe(defRank);
});
it('excludes unverifiable samples per metric without rejecting otherwise usable snapshots', () => {
  const a = row(1),
    b = row(2),
    c = row(3);
  const unit = advanced(a).offense;
  Object.assign(unit, {
    powerRushAttempts: -1,
    totalOpportunies: 0,
    successRate: 0,
  });
  unit.passingPlays.rate = 0;
  unit.rushingPlays.successRate = 0;
  const cohort = calculateStatCohort([a, b, c], 2025, now);
  for (const key of [
    'powerSuccess',
    'pointsPerOpportunity',
    'explosiveness',
    'passingPlays.ppa',
    'passingPlays.explosiveness',
    'rushingPlays.explosiveness',
  ] as const)
    expect(cohort.teams[1].offense[key]).toBeNull();
  expect(cohort.teams[1].offense.successRate?.population).toBe(3);
  expect(cohort.teams[2].offense.pointsPerOpportunity?.population).toBe(2);
  expect(cohort.teams[1].offense['havoc.total']?.population).toBe(3);
  Object.assign(advanced(b).offense, { powerRushAttempts: undefined });
  expect(
    calculateStatCohort([a, b, c], 2025, now).teams[3].offense.powerSuccess,
  ).toBeNull();
});
it('separates divisions, collapses duplicates, excludes ambiguous affiliations and retains membership size', () => {
  const a = row(1),
    b = row(2),
    missing = { ...row(3), advanced: null };
  const c = calculateStatCohort(
    [
      a,
      a,
      b,
      missing,
      { ...row(4), division: 'fcs' },
      row(5),
      { ...row(5), division: 'fcs' },
      { ...row(6), division: null },
    ],
    2025,
    now,
  );
  expect(Object.keys(c.teams)).toEqual(['1', '2', '4']);
  expect(c.teams[1].divisionTeamCount).toBe(3);
  expect(c.teams[1].offense.ppa?.population).toBe(2);
  expect(c.teams[4].offense.ppa).toBeNull();
});
it('uses stored precision and requires matching source, valid identity, and absolute expiry', () => {
  const c = calculateStatCohort([row(1, 0.12341), row(2, 0.12342)], 2025, now);
  expect(c.teams[1].offense.ppa?.rank).toBe(2);
  expect(matchingStatRankings(c, 1, 2025, new Date(now - 1000))).toBe(
    c.teams[1],
  );
  expect(matchingStatRankings(c, 1, 2025, new Date(now - 2000))).toBeNull();
  expect(matchingStatRankings(c, 1, 2026, new Date(now - 1000))).toBeNull();
  expect(validStatCohort(c, 2025)).toBe(true);
  c.teams[1].offense.ppa!.population = 10;
  expect(validStatCohort(c, 2025)).toBe(false);
  const expired = calculateStatCohort([row(1), row(2)], 2025, now - 700000);
  expect(validStatCohort(expired, 2025)).toBe(false);
  for (const bad of [
    { ...row(1), season: 2024 },
    { ...row(1), snapshotTeamId: 9 },
    { ...row(1), formatVersion: 2 },
    { ...row(1), generatedAt: 'bad' },
  ])
    expect(
      calculateStatCohort([bad, row(2)], 2025, now).teams[1],
    ).toBeUndefined();
});
