import {
  CamelCasePlugin,
  CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { DB } from '../../../../config/types/db';
import { DivisionClassification, GameStatus, SeasonType } from '../../../enums';
import { GamePreviewMetadata } from '../../previewTypes';

export const game: GamePreviewMetadata = {
  id: 123,
  season: 2025,
  week: 4,
  seasonType: SeasonType.Regular,
  startDate: '2025-09-27T19:30:00.000Z',
  startTimeTBD: false,
  status: GameStatus.Scheduled,
  statusCheckedAt: '2025-09-25T12:00:00.000Z',
  neutralSite: false,
  conferenceGame: true,
  venue: null,
  playoff: null,
  homeTeam: {
    id: 130,
    name: 'Michigan',
    conference: 'Big Ten',
    conferenceAbbreviation: 'B1G',
    classification: DivisionClassification.FBS,
    points: null,
  },
  awayTeam: {
    id: 194,
    name: 'Ohio State',
    conference: 'Big Ten',
    conferenceAbbreviation: 'B1G',
    classification: DivisionClassification.FBS,
    points: null,
  },
};
export const gameRow: Awaited<
  ReturnType<
    ReturnType<typeof import('../../previewGame').previewGameQuery>['execute']
  >
>[number] = {
  id: 123,
  season: 2025,
  week: 4,
  seasonType: 'regular',
  startDate: '2025-09-27 19:30:00',
  startTimeTbd: false,
  status: 'scheduled',
  neutralSite: false,
  conferenceGame: true,
  currentHomeScore: null,
  currentAwayScore: null,
  homeGameTeamId: '1',
  awayGameTeamId: '2',
  homeId: 130,
  awayId: 194,
  homeName: 'Michigan',
  awayName: 'Ohio State',
  homePoints: null,
  awayPoints: null,
  homeConference: 'Big Ten',
  homeAbbreviation: 'B1G',
  homeClassification: 'fbs',
  awayConference: 'Big Ten',
  awayAbbreviation: 'B1G',
  awayClassification: 'fbs',
  venueId: null,
  venueName: null,
  venueCity: null,
  venueState: null,
  playoffMatchupId: null,
  playoffCompetition: null,
  playoffFormat: null,
  playoffRound: null,
  playoffRoundName: null,
  playoffBracketSlot: null,
  homeSeed: null,
  awaySeed: null,
  bowlName: null,
};
export const testDatabase = async (
  respond: (query: CompiledQuery) => unknown[] | Promise<unknown[]>,
) => {
  const driver = new DummyDriver(),
    connection = await driver.acquireConnection(),
    queries: CompiledQuery[] = [];
  const original = connection.executeQuery.bind(connection);
  connection.executeQuery = async <R>(query: CompiledQuery) => {
    queries.push(query);
    const rows = await respond(query);
    return Object.assign(await original<R>(query), { rows });
  };
  driver.acquireConnection = async () => connection;
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin({ maintainNestedObjectKeys: true })],
  });
  return { db, queries };
};
