import { ValidateError } from 'tsoa';

import { kdb } from '../../config/database';
import { SeasonType } from '../enums';
import { PollWeek, RankingPoll } from './types';

const CFP_POLL_TYPE_NAME = 'Playoff Committee Rankings';

export interface RankingSnapshotRecord {
  id: number;
  week: number;
  isFinal: boolean;
}

export const validateRankingSelectors = (
  poll?: RankingPoll,
  latest?: boolean,
  finalOnly?: boolean,
): void => {
  if (latest && finalOnly) {
    throw new ValidateError(
      {
        latest: {
          value: latest,
          message: 'latest and final cannot both be true',
        },
        final: {
          value: finalOnly,
          message: 'latest and final cannot both be true',
        },
      },
      'Validation error',
    );
  }

  if ((latest || finalOnly) && poll !== RankingPoll.Cfp) {
    throw new ValidateError(
      {
        poll: {
          value: poll,
          message: 'poll=cfp is required for latest or final',
        },
      },
      'Validation error',
    );
  }
};

export const selectLatestRankingSnapshotId = (
  snapshots: RankingSnapshotRecord[],
): number | null => {
  const latest = [...snapshots].sort(
    (a, b) =>
      Number(b.isFinal) - Number(a.isFinal) || b.week - a.week || b.id - a.id,
  )[0];

  return latest?.id ?? null;
};

export const getRankings = async (
  year: number,
  seasonType?: SeasonType,
  week?: number,
  poll?: RankingPoll,
  latest?: boolean,
  finalOnly?: boolean,
): Promise<PollWeek[]> => {
  validateRankingSelectors(poll, latest, finalOnly);

  let latestSnapshotId: number | null = null;
  if (latest) {
    let snapshotQuery = kdb
      .selectFrom('poll')
      .innerJoin('pollType', 'poll.pollTypeId', 'pollType.id')
      .where('poll.season', '=', year)
      .select(['poll.id', 'poll.week', 'poll.isFinal']);

    if (seasonType && seasonType !== SeasonType.Both) {
      snapshotQuery = snapshotQuery.where('poll.seasonType', '=', seasonType);
    }

    if (week) {
      snapshotQuery = snapshotQuery.where('poll.week', '=', week);
    }

    if (poll) {
      snapshotQuery = snapshotQuery.where(
        'pollType.name',
        '=',
        CFP_POLL_TYPE_NAME,
      );
    }

    latestSnapshotId = selectLatestRankingSnapshotId(
      await snapshotQuery.execute(),
    );
    if (latestSnapshotId === null) {
      return [];
    }
  }

  let query = kdb
    .selectFrom('pollType')
    .innerJoin('poll', 'pollType.id', 'poll.pollTypeId')
    .innerJoin('pollRank', 'poll.id', 'pollRank.pollId')
    .innerJoin('team', 'pollRank.teamId', 'team.id')
    .leftJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.teamId')
        .onRef('conferenceTeam.startYear', '<=', 'poll.season')
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', 'is', null),
            eb('conferenceTeam.endYear', '>=', eb.ref('poll.season')),
          ]),
        ),
    )
    .leftJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .where('poll.season', '=', year)
    .select([
      'poll.seasonType',
      'poll.season',
      'poll.week',
      'poll.id as pollId',
      'poll.isFinal',
      'pollType.name as poll',
      'pollRank.rank',
      'team.id as teamId',
      'team.school',
      'conference.name as conference',
      'pollRank.firstPlaceVotes',
      'pollRank.points',
    ]);

  if (seasonType && seasonType !== SeasonType.Both) {
    query = query.where('poll.seasonType', '=', seasonType);
  }

  if (week) {
    query = query.where('poll.week', '=', week);
  }

  if (poll) {
    query = query.where('pollType.name', '=', CFP_POLL_TYPE_NAME);
  }

  if (finalOnly) {
    query = query.where('poll.isFinal', '=', true);
  }

  if (latestSnapshotId !== null) {
    query = query.where('poll.id', '=', latestSnapshotId);
  }

  const data = await query.execute();
  const results = [];

  const seasons = Array.from(new Set(data.map((d) => d.season)));
  for (const season of seasons) {
    const seasonTypes = Array.from(
      new Set(data.filter((d) => d.season == season).map((d) => d.seasonType)),
    );
    for (const seasonType of seasonTypes) {
      const weeks = Array.from(
        new Set(
          data
            .filter((d) => d.season == season && d.seasonType == seasonType)
            .map((d) => d.week),
        ),
      );
      for (const week of weeks) {
        const weekRecord: PollWeek = {
          season,
          // @ts-ignore
          seasonType,
          week,
          polls: [],
        };

        const records = data
          .filter(
            (d) =>
              d.season == season &&
              d.seasonType == seasonType &&
              d.week == week,
          )
          .map((d) => d);
        const pollIds = Array.from(new Set(records.map((r) => r.pollId)));

        for (const pollId of pollIds) {
          const pollRecord = records.find((record) => record.pollId === pollId);
          if (!pollRecord) {
            continue;
          }

          weekRecord.polls.push({
            poll: pollRecord.poll,
            isFinal:
              pollRecord.poll === CFP_POLL_TYPE_NAME
                ? pollRecord.isFinal
                : null,
            ranks: records
              .filter((r) => r.pollId === pollId)
              .map((r) => {
                return {
                  rank: r.rank,
                  teamId: r.teamId,
                  school: r.school,
                  conference: r.conference,
                  firstPlaceVotes: r.firstPlaceVotes,
                  points: r.points,
                };
              }),
          });
        }

        results.push(weekRecord);
      }
    }
  }

  return results;
};
