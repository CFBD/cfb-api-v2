import { TeamSeasonSnapshotPayload } from './seasonOverviewTypes';
import {
  isPassingProduction,
  isTeamRushingProduction,
} from '../boxScores/payload';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || number(value);
const string = (value: unknown) => typeof value === 'string';
const nullableString = (value: unknown) => value === null || string(value);
const numbers = (value: unknown, keys: string[], nullable = false): boolean =>
  object(value) &&
  keys.every((key) => (nullable ? nullableNumber : number)(value[key]));
const split = (value: unknown) =>
  numbers(value, ['rate', 'ppa', 'successRate']) &&
  object(value) &&
  nullableNumber(value.explosiveness);
const unit = (value: unknown): boolean =>
  object(value) &&
  numbers(value, [
    'plays',
    'drives',
    'ppa',
    'totalPPA',
    'successRate',
    'stuffRate',
    'lineYards',
    'lineYardsTotal',
    'secondLevelYards',
    'secondLevelYardsTotal',
    'openFieldYards',
    'openFieldYardsTotal',
    'totalOpportunies',
    'pointsPerOpportunity',
  ]) &&
  nullableNumber(value.explosiveness) &&
  nullableNumber(value.powerSuccess) &&
  numbers(
    value.fieldPosition,
    ['averageStart', 'averagePredictedPoints'],
    true,
  ) &&
  numbers(value.havoc, ['total', 'frontSeven', 'db'], true) &&
  split(value.standardDowns) &&
  split(value.passingDowns) &&
  split(value.rushingPlays) &&
  numbers(value.rushingPlays, ['totalPPA']) &&
  split(value.passingPlays) &&
  numbers(value.passingPlays, ['totalPPA']);
const identity = (
  value: unknown,
  season: number,
  team: string,
): value is Record<string, unknown> =>
  object(value) && value.season === season && value.team === team;
const player = (
  value: unknown,
  season: number,
  team: string,
): value is Record<string, unknown> =>
  identity(value, season, team) &&
  string(value.id) &&
  nullableString(value.name) &&
  nullableString(value.position) &&
  string(value.conference);
const ppaKeys = [
  'all',
  'pass',
  'rush',
  'firstDown',
  'secondDown',
  'thirdDown',
  'standardDowns',
  'passingDowns',
];
const enriched = (
  value: unknown,
  season: number,
  team: string,
  production: (v: unknown) => boolean,
) =>
  value === null ||
  (identity(value, season, team) &&
    nullableString(value.conference) &&
    production(value.offense) &&
    production(value.defense));

export const isTeamSeasonSnapshotPayload = (
  value: unknown,
  season: number,
  team: string,
): value is TeamSeasonSnapshotPayload =>
  object(value) &&
  identity(value.advanced, season, team) &&
  string(value.advanced.conference) &&
  unit(value.advanced.offense) &&
  unit(value.advanced.defense) &&
  object(value.advanced.defense) &&
  numbers(value.advanced.defense.passingDowns, ['totalPPA']) &&
  object(value.players) &&
  Array.isArray(value.players.ppa) &&
  value.players.ppa.every(
    (row: unknown) =>
      player(row, season, team) &&
      numbers(row.averagePPA, ppaKeys, true) &&
      numbers(row.totalPPA, ppaKeys, true),
  ) &&
  Array.isArray(value.players.usage) &&
  value.players.usage.every(
    (row: unknown) =>
      player(row, season, team) &&
      numbers(row.usage, ['overall', ...ppaKeys.slice(1)], true),
  ) &&
  enriched(value.passing, season, team, isPassingProduction) &&
  enriched(value.rushing, season, team, isTeamRushingProduction);
