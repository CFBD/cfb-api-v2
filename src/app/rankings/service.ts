import { kdb } from '../../config/database';
import { SeasonType } from '../enums';
import { PollWeek } from './types';

export const getRankings = async (
  year: number,
  seasonType?: SeasonType,
  week?: number,
): Promise<PollWeek[]> => {
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
        const polls = Array.from(new Set(records.map((r) => r.poll)));

        for (const poll of polls) {
          weekRecord.polls.push({
            poll,
            ranks: records
              .filter((r) => r.poll == poll)
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
