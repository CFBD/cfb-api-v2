import { CamelCasePlugin, Kysely, sql } from 'kysely';

import type { DB } from '../../config/types/db';
import { DivisionClassification } from '../enums';
import { isStoredTeamRushingSeason } from '../teams/seasonOverviewPayload';
import { TeamRushingSeason } from './types';

export interface TeamRushingSeasonSnapshotScope {
  year?: number;
  team?: string;
  conference?: string;
  classification: DivisionClassification;
}

export type TeamRushingSeasonSnapshotRead =
  | { status: 'found'; rows: TeamRushingSeason[] }
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
 * its stored team-season rushing payload.
 */
export const teamRushingSeasonSnapshotQuery = (
  db: Kysely<DB>,
  { year, team, conference, classification }: TeamRushingSeasonSnapshotScope,
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
    .where('conference.division', '=', classification)
    .select((eb) => [
      'participant.season',
      'participant.teamId',
      'participant.school',
      'conference.abbreviation as conference',
      'snapshot.teamId as snapshotTeamId',
      'snapshot.formatVersion',
      sql<unknown>`${eb.ref('snapshot.payload')} -> 'rushing'`.as('rushing'),
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
 * First team-season, among those without a snapshot row, that has a rush play
 * the live aggregate would count. Proving absence scans those games' plays, so
 * this only runs when the snapshot read finds unsnapshotted participants.
 */
export const unsnapshottedRushingQuery = (
  db: Kysely<DB>,
  teamSeasons: readonly TeamSeason[],
) =>
  snapshotExecutor(db)
    .selectFrom('gameTeam as gt')
    .innerJoin('game', 'game.id', 'gt.gameId')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('rushPlay as rp', 'rp.playId', 'play.id')
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
 * Returns stored rows only when every in-scope team-season with rush plays has
 * a valid, current-format snapshot; otherwise reports the first gap so the
 * caller can serve the live aggregate instead of a partial response.
 */
export const readTeamRushingSeasonSnapshots = async (
  db: Kysely<DB>,
  scope: TeamRushingSeasonSnapshotScope,
): Promise<TeamRushingSeasonSnapshotRead> => {
  const rows = await teamRushingSeasonSnapshotQuery(db, scope).execute();
  const result: TeamRushingSeason[] = [];
  const unsnapshotted: TeamSeason[] = [];
  for (const row of rows) {
    const gap = (reason: string): TeamRushingSeasonSnapshotRead => ({
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
    if (!isStoredTeamRushingSeason(row.rushing, row.season, row.school))
      return gap('invalid-payload');
    if (row.rushing === null) continue;
    // Snapshots group by the affiliation valid when they were generated.
    if (row.rushing.conference !== row.conference)
      return gap('conference-mismatch');
    result.push({
      season: row.season,
      team: row.school,
      conference: row.conference,
      offense: row.rushing.offense,
      defense: row.rushing.defense,
    });
  }
  if (unsnapshotted.length) {
    const [missing] = await unsnapshottedRushingQuery(
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
