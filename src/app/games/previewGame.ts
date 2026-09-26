import { Kysely } from 'kysely';
import { DB } from '../../config/types/db';
import { DivisionClassification, GameStatus, SeasonType } from '../enums';
import { mapGamePlayoff } from './service';
import {
  GamePreviewMetadata,
  PreviewReason,
  PreviewTeamIdentity,
} from './previewTypes';
import { PreviewDataError, storedUtc } from './previewRead';

export const previewGameQuery = (db: Kysely<DB>) =>
  db
    .selectFrom('game as g')
    .leftJoin('gameTeam as h', (j) =>
      j.onRef('h.gameId', '=', 'g.id').on('h.homeAway', '=', 'home'),
    )
    .leftJoin('gameTeam as a', (j) =>
      j.onRef('a.gameId', '=', 'g.id').on('a.homeAway', '=', 'away'),
    )
    .leftJoin('team as ht', 'ht.id', 'h.teamId')
    .leftJoin('team as at', 'at.id', 'a.teamId')
    .leftJoin('conferenceTeam as hc', (j) =>
      j
        .onRef('hc.teamId', '=', 'ht.id')
        .onRef('hc.startYear', '<=', 'g.season')
        .on((eb) =>
          eb.or([
            eb('hc.endYear', 'is', null),
            eb('hc.endYear', '>=', eb.ref('g.season')),
          ]),
        ),
    )
    .leftJoin('conference as hconf', 'hconf.id', 'hc.conferenceId')
    .leftJoin('conferenceTeam as ac', (j) =>
      j
        .onRef('ac.teamId', '=', 'at.id')
        .onRef('ac.startYear', '<=', 'g.season')
        .on((eb) =>
          eb.or([
            eb('ac.endYear', 'is', null),
            eb('ac.endYear', '>=', eb.ref('g.season')),
          ]),
        ),
    )
    .leftJoin('conference as aconf', 'aconf.id', 'ac.conferenceId')
    .leftJoin('venue as v', 'v.id', 'g.venueId')
    .leftJoin('playoffMatchup as pm', 'pm.gameId', 'g.id')
    .leftJoin('playoffTournament as pt', 'pt.id', 'pm.playoffId')
    .leftJoin('playoffRound as pr', 'pr.id', 'pm.roundId')
    .leftJoin('playoffParticipant as hp', (j) =>
      j.onRef('hp.playoffId', '=', 'pt.id').onRef('hp.teamId', '=', 'ht.id'),
    )
    .leftJoin('playoffParticipant as ap', (j) =>
      j.onRef('ap.playoffId', '=', 'pt.id').onRef('ap.teamId', '=', 'at.id'),
    )
    .select([
      'g.id',
      'g.season',
      'g.seasonType',
      'g.week',
      'g.status',
      'g.startTimeTbd',
      'g.neutralSite',
      'g.conferenceGame',
      'g.currentHomeScore',
      'g.currentAwayScore',
      'h.id as homeGameTeamId',
      'a.id as awayGameTeamId',
      'ht.id as homeId',
      'at.id as awayId',
      'ht.school as homeName',
      'at.school as awayName',
      'h.points as homePoints',
      'a.points as awayPoints',
      'hconf.name as homeConference',
      'hconf.abbreviation as homeAbbreviation',
      'hconf.division as homeClassification',
      'aconf.name as awayConference',
      'aconf.abbreviation as awayAbbreviation',
      'aconf.division as awayClassification',
      'v.id as venueId',
      'v.name as venueName',
      'v.city as venueCity',
      'v.state as venueState',
      'pm.id as playoffMatchupId',
      'pt.competition as playoffCompetition',
      'pt.format as playoffFormat',
      'pr.code as playoffRound',
      'pr.name as playoffRoundName',
      'pm.bracketSlot as playoffBracketSlot',
      'hp.seed as homeSeed',
      'ap.seed as awaySeed',
      'pm.bowlName',
    ])
    .select((eb) => eb.cast<string>('g.startDate', 'text').as('startDate'));

type GameRow = Awaited<
  ReturnType<ReturnType<typeof previewGameQuery>['execute']>
>[number];
export interface PreviewCore {
  game: GamePreviewMetadata;
  classifications: string[];
  conferences: string[];
}
const consensus = <T>(values: T[]): T | null =>
  new Set(values).size === 1 ? values[0] : null;
const classification = (value: string | null): DivisionClassification | null =>
  Object.values(DivisionClassification).find((v) => v === value) ?? null;

export const mapPreviewGames = (
  rows: GameRow[],
  now = new Date().toISOString(),
): PreviewCore[] => {
  const groups = new Map<number, GameRow[]>();
  for (const row of rows)
    groups.set(row.id, [...(groups.get(row.id) ?? []), row]);
  return [...groups.values()]
    .map((group): PreviewCore => {
      const r = group[0];
      const status = Object.values(GameStatus).find((s) => s === r.status);
      const seasonType =
        r.seasonType === 'preseason'
          ? 'preseason'
          : Object.values(SeasonType).find((s) => s === r.seasonType);
      if (
        !status ||
        !seasonType ||
        !r.homeId ||
        !r.awayId ||
        !r.homeName ||
        !r.awayName ||
        r.homeId === r.awayId ||
        new Set(group.map((x) => x.homeGameTeamId)).size !== 1 ||
        new Set(group.map((x) => x.awayGameTeamId)).size !== 1 ||
        !r.homeGameTeamId ||
        !r.awayGameTeamId
      )
        throw new PreviewDataError();
      const homeTeam: PreviewTeamIdentity = {
        id: r.homeId,
        name: r.homeName,
        conference: consensus(group.map((x) => x.homeConference)),
        conferenceAbbreviation: consensus(group.map((x) => x.homeAbbreviation)),
        classification: classification(
          consensus(group.map((x) => x.homeClassification)),
        ),
        points:
          status === GameStatus.InProgress
            ? (r.currentHomeScore ?? r.homePoints)
            : r.homePoints,
      };
      const awayTeam: PreviewTeamIdentity = {
        id: r.awayId,
        name: r.awayName,
        conference: consensus(group.map((x) => x.awayConference)),
        conferenceAbbreviation: consensus(group.map((x) => x.awayAbbreviation)),
        classification: classification(
          consensus(group.map((x) => x.awayClassification)),
        ),
        points:
          status === GameStatus.InProgress
            ? (r.currentAwayScore ?? r.awayPoints)
            : r.awayPoints,
      };
      return {
        game: {
          id: r.id,
          season: r.season,
          week: r.week,
          seasonType,
          status,
          statusCheckedAt: now,
          startDate: storedUtc(r.startDate),
          startTimeTBD: r.startTimeTbd,
          neutralSite: r.neutralSite,
          conferenceGame: r.conferenceGame,
          homeTeam,
          awayTeam,
          venue:
            r.venueId === null
              ? null
              : {
                  id: r.venueId,
                  name: r.venueName,
                  city: r.venueCity,
                  state: r.venueState,
                },
          playoff: mapGamePlayoff(r),
        },
        classifications: [
          ...new Set(
            group
              .flatMap((x) => [x.homeClassification, x.awayClassification])
              .filter((x): x is NonNullable<typeof x> => x !== null),
          ),
        ],
        conferences: [
          ...new Set(
            group
              .flatMap((x) => [x.homeAbbreviation, x.awayAbbreviation])
              .filter((x): x is string => x !== null)
              .map((x) => x.toLowerCase()),
          ),
        ],
      };
    })
    .sort(
      (a, b) =>
        (a.game.startDate ?? '').localeCompare(b.game.startDate ?? '') ||
        a.game.id - b.game.id,
    );
};
export const previewReason = (game: GamePreviewMetadata): PreviewReason => {
  if (game.status === GameStatus.Completed) return 'game_completed';
  if (!game.startDate) return 'kickoff_unknown';
  return null;
};
export const previewIdentity = (game: GamePreviewMetadata): string =>
  `${game.id}:${game.season}:${game.homeTeam.id}:${game.awayTeam.id}:${game.startDate}:${game.startTimeTBD}`;
