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

  let data = await query.execute();
  let results = [];

  let seasons = Array.from(new Set(data.map((d) => d.season)));
  for (let season of seasons) {
    let seasonTypes = Array.from(
      new Set(data.filter((d) => d.season == season).map((d) => d.seasonType)),
    );
    for (let seasonType of seasonTypes) {
      let weeks = Array.from(
        new Set(
          data
            .filter((d) => d.season == season && d.seasonType == seasonType)
            .map((d) => d.week),
        ),
      );
      for (let week of weeks) {
        let weekRecord: PollWeek = {
          season,
          // @ts-ignore
          seasonType,
          week,
          polls: [],
        };

        let records = data
          .filter(
            (d) =>
              d.season == season &&
              d.seasonType == seasonType &&
              d.week == week,
          )
          .map((d) => d);
        let polls = Array.from(new Set(records.map((r) => r.poll)));

        for (let poll of polls) {
          weekRecord.polls.push({
            poll,
            ranks: records
              .filter((r) => r.poll == poll)
              .map((r) => {
                return {
                  rank: r.rank,
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
