import { SnapshotPayload } from './wire';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || number(value);
const string = (value: unknown) => typeof value === 'string';
const nullableString = (value: unknown) => value === null || string(value);
const seasonType = (value: unknown) =>
  [
    'regular',
    'postseason',
    'allstar',
    'spring_regular',
    'spring_postseason',
  ].some((type) => type === value);
const array = (value: unknown, row: (value: unknown) => boolean) =>
  Array.isArray(value) && value.every(row);

const isStatsByQuarter = (value: unknown): boolean =>
  object(value) &&
  nullableNumber(value['total']) &&
  nullableNumber(value['quarter1']) &&
  nullableNumber(value['quarter2']) &&
  nullableNumber(value['quarter3']) &&
  nullableNumber(value['quarter4']);

const isTeamPPA = (value: unknown): boolean =>
  object(value) &&
  string(value['team']) &&
  nullableNumber(value['plays']) &&
  isStatsByQuarter(value['overall']) &&
  isStatsByQuarter(value['passing']) &&
  isStatsByQuarter(value['rushing']);

const isTeamSuccessRates = (value: unknown): boolean =>
  object(value) &&
  string(value['team']) &&
  isStatsByQuarter(value['overall']) &&
  isStatsByQuarter(value['standardDowns']) &&
  isStatsByQuarter(value['passingDowns']);

const isTeamExplosiveness = (value: unknown): boolean =>
  object(value) && string(value['team']) && isStatsByQuarter(value['overall']);

const isTeamRushingStats = (value: unknown): boolean =>
  object(value) &&
  string(value['team']) &&
  nullableNumber(value['powerSuccess']) &&
  nullableNumber(value['stuffRate']) &&
  nullableNumber(value['lineYards']) &&
  nullableNumber(value['lineYardsAverage']) &&
  nullableNumber(value['secondLevelYards']) &&
  nullableNumber(value['secondLevelYardsAverage']) &&
  nullableNumber(value['openFieldYards']) &&
  nullableNumber(value['openFieldYardsAverage']);

const isTeamHavoc = (value: unknown): boolean =>
  object(value) &&
  string(value['team']) &&
  nullableNumber(value['total']) &&
  nullableNumber(value['frontSeven']) &&
  nullableNumber(value['db']);

const isTeamScoringOpportunities = (value: unknown): boolean =>
  object(value) &&
  string(value['team']) &&
  nullableNumber(value['opportunities']) &&
  nullableNumber(value['points']) &&
  nullableNumber(value['pointsPerOpportunity']);

const isTeamFieldPosition = (value: unknown): boolean =>
  object(value) &&
  string(value['team']) &&
  nullableNumber(value['averageStart']) &&
  nullableNumber(value['averageStartingPredictedPoints']);

const isPlayerStatsByQuarter = (value: unknown): boolean =>
  object(value) &&
  isStatsByQuarter(value) &&
  nullableNumber(value['rushing']) &&
  nullableNumber(value['passing']);

const isPlayerGameUsage = (value: unknown): boolean =>
  object(value) &&
  isPlayerStatsByQuarter(value) &&
  nullableString(value['player']) &&
  nullableString(value['team']) &&
  nullableString(value['position']);

const isPlayerPPA = (value: unknown): boolean =>
  object(value) &&
  nullableString(value['player']) &&
  nullableString(value['team']) &&
  nullableString(value['position']) &&
  isPlayerStatsByQuarter(value['average']) &&
  isPlayerStatsByQuarter(value['cumulative']);

const isPassingBaseProduction = (value: unknown): boolean =>
  object(value) &&
  number(value['attempts']) &&
  number(value['completions']) &&
  number(value['incompletions']) &&
  number(value['interceptions']) &&
  nullableNumber(value['completionRate']) &&
  number(value['airYardsAttemptsAvailable']) &&
  nullableNumber(value['totalAirYards']) &&
  nullableNumber(value['averageDepthOfTarget']) &&
  number(value['totalYardsAttemptsAvailable']) &&
  nullableNumber(value['totalYards']) &&
  number(value['yardsAfterCatchAttemptsAvailable']) &&
  nullableNumber(value['totalYardsAfterCatch']) &&
  nullableNumber(value['averageYardsAfterCatch']);

const isPassingAdvancedProduction = (value: unknown): boolean =>
  object(value) &&
  number(value['successRate']) &&
  number(value['ppa']) &&
  number(value['totalPpa']) &&
  number(value['explosiveness']) &&
  number(value['ppaAttemptsAvailable']) &&
  number(value['successAttemptsAvailable']) &&
  number(value['successfulAttempts']) &&
  number(value['successfulPpaAttemptsAvailable']);

const isPassingLocationProduction = (value: unknown): boolean =>
  object(value) &&
  isPassingBaseProduction(value) &&
  isPassingAdvancedProduction(value) &&
  nullableNumber(value['yardsPerAttempt']) &&
  nullableNumber(value['airYardsPerAttempt']);

const isPassingLocations = (value: unknown): boolean =>
  object(value) &&
  isPassingLocationProduction(value['short left']) &&
  isPassingLocationProduction(value['short middle']) &&
  isPassingLocationProduction(value['short right']) &&
  isPassingLocationProduction(value['deep left']) &&
  isPassingLocationProduction(value['deep middle']) &&
  isPassingLocationProduction(value['deep right']) &&
  isPassingLocationProduction(value['unknown']);

const isPassingProduction = (value: unknown): boolean =>
  object(value) &&
  isPassingBaseProduction(value) &&
  isPassingAdvancedProduction(value) &&
  number(value['locationEligibleAttempts']) &&
  number(value['locationAvailableAttempts']) &&
  isPassingLocations(value['locations']);

const isPlayerPassingGame = (value: unknown): boolean =>
  object(value) &&
  isPassingProduction(value) &&
  number(value['gameId']) &&
  number(value['season']) &&
  number(value['week']) &&
  seasonType(value['seasonType']) &&
  string(value['playerId']) &&
  string(value['player']) &&
  string(value['team']) &&
  nullableString(value['conference']) &&
  string(value['opponent']);

const isTeamPassingGame = (value: unknown): boolean =>
  object(value) &&
  number(value['gameId']) &&
  number(value['season']) &&
  number(value['week']) &&
  seasonType(value['seasonType']) &&
  string(value['team']) &&
  nullableString(value['conference']) &&
  string(value['opponent']) &&
  isPassingProduction(value['offense']) &&
  isPassingProduction(value['defense']);

const isRushingDirectionProduction = (value: unknown): boolean =>
  object(value) &&
  number(value['carries']) &&
  number(value['yards']) &&
  number(value['yardsPerCarry']) &&
  number(value['successRate']) &&
  number(value['ppa']) &&
  number(value['totalPpa']) &&
  number(value['lineYards']) &&
  number(value['lineYardsTotal']) &&
  number(value['secondLevelYards']) &&
  number(value['secondLevelYardsTotal']) &&
  number(value['openFieldYards']) &&
  number(value['openFieldYardsTotal']) &&
  number(value['stuffRate']) &&
  number(value['powerSuccess']) &&
  number(value['explosiveness']);

const isRushingProduction = (value: unknown): boolean =>
  object(value) &&
  number(value['attempts']) &&
  number(value['rushingYardsAvailable']) &&
  nullableNumber(value['totalRushingYards']) &&
  nullableNumber(value['yardsPerCarry']) &&
  number(value['individualAttempts']) &&
  number(value['unattributedAttempts']) &&
  number(value['sacks']) &&
  number(value['kneels']) &&
  number(value['teamRushes']) &&
  number(value['multiCarrierAttempts']) &&
  number(value['directionEligibleAttempts']) &&
  number(value['directionAvailableAttempts']) &&
  number(value['successRate']) &&
  number(value['ppa']) &&
  number(value['totalPpa']) &&
  number(value['lineYards']) &&
  number(value['lineYardsTotal']) &&
  number(value['secondLevelYards']) &&
  number(value['secondLevelYardsTotal']) &&
  number(value['openFieldYards']) &&
  number(value['openFieldYardsTotal']) &&
  number(value['stuffRate']) &&
  number(value['powerSuccess']) &&
  number(value['explosiveness']) &&
  object(value.directions) &&
  isRushingDirectionProduction(value.directions.left) &&
  isRushingDirectionProduction(value.directions.middle) &&
  isRushingDirectionProduction(value.directions.right) &&
  isRushingDirectionProduction(value.directions.unknown);

const isTeamRushingProduction = (value: unknown): boolean =>
  object(value) &&
  isRushingProduction(value) &&
  number(value['touchdownStatusAvailable']) &&
  number(value['rushingTouchdowns']);

const isPlayerRushingGame = (value: unknown): boolean =>
  object(value) &&
  isRushingProduction(value) &&
  number(value['gameId']) &&
  number(value['season']) &&
  number(value['week']) &&
  seasonType(value['seasonType']) &&
  string(value['playerId']) &&
  string(value['player']) &&
  string(value['team']) &&
  nullableString(value['conference']) &&
  string(value['opponent']);

const isTeamRushingGame = (value: unknown): boolean =>
  object(value) &&
  number(value['gameId']) &&
  number(value['season']) &&
  number(value['week']) &&
  seasonType(value['seasonType']) &&
  string(value['team']) &&
  nullableString(value['conference']) &&
  string(value['opponent']) &&
  isTeamRushingProduction(value['offense']) &&
  isTeamRushingProduction(value['defense']);

export const isSnapshotPayload = (value: unknown): value is SnapshotPayload =>
  object(value) &&
  object(value.teams) &&
  object(value.players) &&
  array(value.teams.ppa, isTeamPPA) &&
  array(value.teams.cumulativePpa, isTeamPPA) &&
  array(value.teams.successRates, isTeamSuccessRates) &&
  array(value.teams.explosiveness, isTeamExplosiveness) &&
  array(value.teams.rushing, isTeamRushingStats) &&
  array(value.teams.havoc, isTeamHavoc) &&
  array(value.teams.scoringOpportunities, isTeamScoringOpportunities) &&
  array(value.teams.fieldPosition, isTeamFieldPosition) &&
  array(value.teams.passing, isTeamPassingGame) &&
  array(value.teams.rushingAdvanced, isTeamRushingGame) &&
  array(value.players.usage, isPlayerGameUsage) &&
  array(value.players.ppa, isPlayerPPA) &&
  array(value.players.passing, isPlayerPassingGame) &&
  array(value.players.rushing, isPlayerRushingGame);
