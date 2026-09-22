import { TeamSeasonAdvancedStats } from './seasonOverviewTypes';

const round = (value: number, places = 3): number =>
  Math.round(value * 10 ** places) / 10 ** places;
const nullableRound = (value: number | null, places = 3): number | null =>
  value === null ? null : round(value, places);

type Unit = TeamSeasonAdvancedStats['offense'];
const split = <T extends Unit['standardDowns'] & { totalPPA?: number }>(
  value: T,
) => ({
  ...value,
  rate: round(value.rate),
  ppa: round(value.ppa),
  successRate: round(value.successRate),
  explosiveness: nullableRound(value.explosiveness),
  ...(value.totalPPA === undefined ? {} : { totalPPA: round(value.totalPPA) }),
});

const unit = <T extends Unit>(value: T) => ({
  ...value,
  ppa: round(value.ppa),
  totalPPA: round(value.totalPPA),
  successRate: round(value.successRate),
  explosiveness: nullableRound(value.explosiveness),
  powerSuccess: nullableRound(value.powerSuccess),
  stuffRate: round(value.stuffRate),
  lineYards: round(value.lineYards, 2),
  secondLevelYards: round(value.secondLevelYards, 2),
  openFieldYards: round(value.openFieldYards, 2),
  pointsPerOpportunity: round(value.pointsPerOpportunity, 2),
  fieldPosition: {
    averageStart: nullableRound(value.fieldPosition.averageStart, 2),
    averagePredictedPoints: nullableRound(
      value.fieldPosition.averagePredictedPoints,
    ),
  },
  havoc: {
    total: nullableRound(value.havoc.total),
    frontSeven: nullableRound(value.havoc.frontSeven),
    db: nullableRound(value.havoc.db),
  },
  standardDowns: split(value.standardDowns),
  passingDowns: split(value.passingDowns),
  rushingPlays: split(value.rushingPlays),
  passingPlays: split(value.passingPlays),
});

// Format only at the response boundary so existing snapshots need no rebuild.
export const formatSeasonAdvancedStats = (
  value: TeamSeasonAdvancedStats,
): TeamSeasonAdvancedStats => ({
  ...value,
  offense: unit(value.offense),
  defense: unit(value.defense),
});
