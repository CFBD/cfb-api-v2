import { CamelCasePlugin, Kysely, sql } from 'kysely';

import type { DB } from '../../config/types/db';
import { currentTeamPassingCpoe } from '../boxScores/cpoeProjection';
import { DivisionClassification } from '../enums';
import { isStoredTeamPassingSeason } from '../teams/seasonOverviewPayload';
import { TeamPassingSeason } from './types';

export interface TeamPassingSeasonSnapshotScope {
  year?: number;
  team?: string;
  conference?: string;
  classification: DivisionClassification;
}

export type TeamPassingSeasonSnapshotRead =
  | { status: 'found'; rows: TeamPassingSeason[] }
  | { status: 'incomplete'; reason: string; season: number; teamId: number };

interface TeamSeason {
  season: number;
  teamId: number;
}

// Payload keys are already API field names; keep nested JSON keys intact.
const snapshotExecutor = (db: Kysely<DB>) =>
  db
    .withoutPlugins()
    .withPlugin(new CamelCasePlugin({ maintainNestedObjectKeys: true }));

/**
 * Season-valid participants matching the live endpoint's scope, each joined to
 * its stored team-season passing payload and the season's selected CPOE model.
 */
export const teamPassingSeasonSnapshotQuery = (
  db: Kysely<DB>,
  { year, team, conference, classification }: TeamPassingSeasonSnapshotScope,
) => {
  const executor = snapshotExecutor(db);
  // Deduplicate game participants before checking affiliations so a year
  // filter drives from that season's games, not each team's full history.
  let participants = executor
    .selectFrom('game')
    .innerJoin('gameTeam as gt', 'gt.gameId', 'game.id')
    .innerJoin('team', 'team.id', 'gt.teamId')
    .select(['game.season', 'team.id as teamId', 'team.school'])
    .distinct();

  if (year !== undefined) {
    participants = participants.where('game.season', '=', year);
  }
  if (team !== undefined) {
    const value = team.toLowerCase();
    participants = participants.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['team.school']), '=', value),
        eb(eb.fn('lower', ['team.abbreviation']), '=', value),
      ]),
    );
  }

  let query = executor
    .selectFrom(participants.as('participant'))
    .innerJoin('conferenceTeam as ct', (join) =>
      join
        .onRef('ct.teamId', '=', 'participant.teamId')
        .on((eb) =>
          eb('ct.startYear', '<=', year ?? eb.ref('participant.season')),
        )
        .on((eb) =>
          eb.or([
            eb('ct.endYear', '>=', year ?? eb.ref('participant.season')),
            eb('ct.endYear', 'is', null),
          ]),
        ),
    )
    .innerJoin('conference', 'conference.id', 'ct.conferenceId')
    .leftJoin('teamSeasonSnapshot as snapshot', (join) =>
      join
        .onRef('snapshot.teamId', '=', 'participant.teamId')
        .onRef('snapshot.season', '=', 'participant.season'),
    )
    .leftJoin(
      'cpoeSeasonModel as cpoeModel',
      'cpoeModel.season',
      'participant.season',
    )
    .where('conference.division', '=', classification)
    .select((eb) => [
      'participant.season',
      'participant.teamId',
      'participant.school',
      'conference.abbreviation as conference',
      'snapshot.teamId as snapshotTeamId',
      'snapshot.formatVersion',
      sql<unknown>`${eb.ref('snapshot.payload')} -> 'passing'`.as('passing'),
      'cpoeModel.modelVersion as selectedCpoeModelVersion',
    ])
    .orderBy('participant.season', 'desc')
    .orderBy('participant.school');

  if (conference !== undefined) {
    const value = conference.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['conference.name']), '=', value),
        eb(eb.fn('lower', ['conference.abbreviation']), '=', value),
      ]),
    );
  }
  return query;
};

/**
 * First team-season, among those without a snapshot row, that has a pass play
 * the live aggregate would count. Proving absence scans those games' plays, so
 * this only runs when the snapshot read finds unsnapshotted participants.
 */
export const unsnapshottedPassingQuery = (
  db: Kysely<DB>,
  teamSeasons: readonly TeamSeason[],
) =>
  snapshotExecutor(db)
    .selectFrom('gameTeam as gt')
    .innerJoin('game', 'game.id', 'gt.gameId')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('passPlay as pp', 'pp.playId', 'play.id')
    .where((eb) =>
      eb(
        eb.refTuple('gt.teamId', 'game.season'),
        'in',
        teamSeasons.map(({ teamId, season }) => eb.tuple(teamId, season)),
      ),
    )
    .where((eb) =>
      eb.or([
        eb('play.offenseId', '=', eb.ref('gt.teamId')),
        eb('play.defenseId', '=', eb.ref('gt.teamId')),
      ]),
    )
    .select(['gt.teamId', 'game.season'])
    .limit(1);

/**
 * Returns stored rows only when every in-scope team-season with pass plays has
 * a valid, current-format snapshot; otherwise reports the first gap so the
 * caller can serve the live aggregate instead of a partial response.
 */
export const readTeamPassingSeasonSnapshots = async (
  db: Kysely<DB>,
  scope: TeamPassingSeasonSnapshotScope,
): Promise<TeamPassingSeasonSnapshotRead> => {
  const rows = await teamPassingSeasonSnapshotQuery(db, scope).execute();
  const result: TeamPassingSeason[] = [];
  const unsnapshotted: TeamSeason[] = [];
  for (const row of rows) {
    const gap = (reason: string): TeamPassingSeasonSnapshotRead => ({
      status: 'incomplete',
      reason,
      season: row.season,
      teamId: row.teamId,
    });
    if (row.snapshotTeamId === null) {
      unsnapshotted.push({ season: row.season, teamId: row.teamId });
      continue;
    }
    if (row.formatVersion !== 1) return gap('unsupported-format');
    if (!isStoredTeamPassingSeason(row.passing, row.season, row.school))
      return gap('invalid-payload');
    if (row.passing === null) continue;
    // Snapshots group by the affiliation valid when they were generated.
    if (row.passing.conference !== row.conference)
      return gap('conference-mismatch');
    const { offense, defense } = currentTeamPassingCpoe(
      row.passing,
      row.selectedCpoeModelVersion,
    );
    result.push({
      season: row.season,
      team: row.school,
      conference: row.conference,
      offense,
      defense,
    });
  }
  if (unsnapshotted.length) {
    const [missing] = await unsnapshottedPassingQuery(
      db,
      unsnapshotted,
    ).execute();
    if (missing)
      return {
        status: 'incomplete',
        reason: 'missing-snapshot',
        season: missing.season,
        teamId: missing.teamId,
      };
  }
  return { status: 'found', rows: result };
};
