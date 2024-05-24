import { db } from '../../config/database';
import { SeasonType } from '../enums';
import { PollWeek } from './types';

export const getRankings = async (
  year: number,
  seasonType?: SeasonType,
  week?: number,
): Promise<PollWeek[]> => {
  const filters = ['p.season = $1'];
  const params: any[] = [year];

  let index = 2;

  if (seasonType && seasonType !== SeasonType.Both) {
    filters.push(`p.season_type = $${index}`);
    params.push(seasonType);
    index++;
  }

  if (week) {
    filters.push(`p.week = $${index}`);
    params.push(week);
    index++;
  }

  const filter = `WHERE ${filters.join(' AND ')}`;

  let data = await db.any(
    `
  select p.season_type, p.season, p.week, pt.name as poll, pr.rank, t.school, c.name as conference, pr.first_place_votes, pr.points
  from poll_type pt
      inner join poll p on pt.id = p.poll_type_id
      inner join poll_rank pr on p.id = pr.poll_id
      inner join team t on pr.team_id = t.id
      left join conference_team ct on t.id = ct.team_id AND ct.start_year <= p.season AND (ct.end_year >= p.season OR ct.end_year IS NULL)
      left join conference c on ct.conference_id = c.id
                                            ${filter}`,
    params,
  );

  let results = [];

  let seasons = Array.from(new Set(data.map((d) => d.season)));
  for (let season of seasons) {
    let seasonTypes = Array.from(
      new Set(data.filter((d) => d.season == season).map((d) => d.season_type)),
    );
    for (let seasonType of seasonTypes) {
      let weeks = Array.from(
        new Set(
          data
            .filter((d) => d.season == season && d.season_type == seasonType)
            .map((d) => d.week),
        ),
      );
      for (let week of weeks) {
        let weekRecord: PollWeek = {
          season,
          seasonType,
          week,
          polls: [],
        };

        let records = data
          .filter(
            (d) =>
              d.season == season &&
              d.season_type == seasonType &&
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
                  firstPlaceVotes: r.first_place_votes,
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
