import { Division } from '../../config/types/db';

export type StatMetricKey =
  | 'ppa'
  | 'successRate'
  | 'explosiveness'
  | 'standardDowns.successRate'
  | 'passingDowns.successRate'
  | 'passingPlays.ppa'
  | 'rushingPlays.ppa'
  | 'passingPlays.explosiveness'
  | 'rushingPlays.explosiveness'
  | 'lineYards'
  | 'secondLevelYards'
  | 'openFieldYards'
  | 'stuffRate'
  | 'powerSuccess'
  | 'havoc.total'
  | 'havoc.frontSeven'
  | 'havoc.db'
  | 'pointsPerOpportunity'
  | 'fieldPosition.averageStart'
  | 'fieldPosition.averagePredictedPoints';
export interface TeamStatRank {
  rank: number;
  population: number;
  tied: boolean;
  percentile: number;
}
export interface TeamSeasonStatRankings {
  teamId: number;
  season: number;
  division: Division;
  divisionTeamCount: number;
  calculatedAt: string;
  expiresAt: string;
  sourceUpdatedAt: string;
  offense: Record<StatMetricKey, TeamStatRank | null>;
  defense: Record<StatMetricKey, TeamStatRank | null>;
}
