import { Kysely, Selectable } from 'kysely';
import { DB } from '../../config/types/db';
import { AdjustedTeamMetrics } from '../wepa/types';
import {
  AdjustedPreviewAnalysis,
  GamePreviewMetadata,
  PreviewAdjustedTeamMetrics,
  PreviewSection,
  PreviewPlayerWepa,
  PreviewKickerPaar,
} from './previewTypes';
import {
  optionalRead,
  previewRead,
  section,
  finiteNumber,
  PreviewDataError,
} from './previewRead';

const mapAdjustedTeam = (
  r: Selectable<DB['adjustedTeamMetrics']> & {
    team: string;
    conference: string;
  },
): AdjustedTeamMetrics => ({
  year: r.year,
  teamId: r.teamId,
  team: r.team ?? '',
  conference: r.conference ?? '',
  epa: {
    total: Number(r.epa),
    passing: Number(r.passingEpa),
    rushing: Number(r.rushingEpa),
  },
  epaAllowed: {
    total: Number(r.epaAllowed),
    passing: Number(r.passingEpaAllowed),
    rushing: Number(r.rushingEpaAllowed),
  },
  successRate: {
    total: Number(r.success),
    standardDowns: Number(r.standardDownsSuccess),
    passingDowns: Number(r.passingDownsSuccess),
  },
  successRateAllowed: {
    total: Number(r.successAllowed),
    standardDowns: Number(r.standardDownsSuccessAllowed),
    passingDowns: Number(r.passingDownsSuccessAllowed),
  },
  rushing: {
    lineYards: Number(r.lineYards),
    secondLevelYards: Number(r.secondLevelYards),
    openFieldYards: Number(r.openFieldYards),
    highlightYards: Number(r.highlightYards),
  },
  rushingAllowed: {
    lineYards: Number(r.lineYardsAllowed),
    secondLevelYards: Number(r.secondLevelYardsAllowed),
    openFieldYards: Number(r.openFieldYardsAllowed),
    highlightYards: Number(r.highlightYardsAllowed),
  },
  explosiveness: Number(r.explosiveness),
  explosivenessAllowed: Number(r.explosivenessAllowed),
});

export const previewAdjustedPlayersQuery = (
  db: Kysely<DB>,
  game: GamePreviewMetadata,
) => {
  const rows = db
    .selectFrom('adjustedPlayerMetrics as m')
    .innerJoin('athlete as a', 'a.id', 'm.athleteId')
    .innerJoin('athleteTeam as membership', (j) =>
      j
        .onRef('membership.athleteId', '=', 'a.id')
        .onRef('membership.startYear', '<=', 'm.year')
        .onRef('membership.endYear', '>=', 'm.year'),
    )
    .innerJoin('position as p', 'p.id', 'a.positionId')
    .innerJoin('team as t', 't.id', 'membership.teamId')
    .leftJoin('conferenceTeam as ct', (j) =>
      j
        .onRef('ct.teamId', '=', 't.id')
        .onRef('ct.startYear', '<=', 'm.year')
        .on((eb) =>
          eb.or([
            eb('ct.endYear', 'is', null),
            eb('ct.endYear', '>=', eb.ref('m.year')),
          ]),
        ),
    )
    .leftJoin('conference as c', 'c.id', 'ct.conferenceId')
    .where('m.year', '=', game.season)
    .where((eb) =>
      eb.or([
        eb.and([
          eb('m.metricType', '=', 'passing'),
          eb('p.abbreviation', '=', 'QB'),
        ]),
        eb.and([
          eb('m.metricType', '=', 'rushing'),
          eb('p.abbreviation', 'in', ['QB', 'RB', 'FB', 'WR', 'TE']),
        ]),
        eb('m.metricType', '=', 'field_goals'),
      ]),
    )
    .where('t.id', 'in', [game.homeTeam.id, game.awayTeam.id])
    .select([
      't.id as teamId',
      'a.id as athleteId',
      'a.name as athleteName',
      'p.abbreviation as position',
      't.school as team',
      'm.year',
      'm.metricType',
      'm.metricValue',
      'm.plays',
    ])
    .select((eb) =>
      eb
        .case()
        .when(eb.fn.count('c.name').distinct(), '=', 1)
        .then(eb.fn.min('c.name'))
        .else(null)
        .end()
        .as('conference'),
    )
    .groupBy([
      't.id',
      'a.id',
      'a.name',
      'p.abbreviation',
      't.school',
      'm.year',
      'm.metricType',
      'm.metricValue',
      'm.plays',
    ]);
  const ranked = db
    .selectFrom(rows.as('players'))
    .selectAll()
    .select((eb) =>
      eb.fn
        .agg<string>('row_number')
        .over((w) =>
          w
            .partitionBy(['teamId', 'metricType'])
            .orderBy('plays', (ob) => ob.desc().nullsLast())
            .orderBy(eb.cast<string>('athleteId', 'text')),
        )
        .as('positionOrder'),
    )
    .as('ranked');
  return db
    .selectFrom(ranked)
    .selectAll()
    .where((eb) =>
      eb.or([
        eb.and([
          eb('metricType', '=', 'passing'),
          eb('positionOrder', '<=', '2'),
        ]),
        eb.and([
          eb('metricType', '=', 'rushing'),
          eb('positionOrder', '<=', '3'),
        ]),
        eb.and([
          eb('metricType', '=', 'field_goals'),
          eb('positionOrder', '<=', '1'),
        ]),
      ]),
    )
    .orderBy('teamId')
    .orderBy('metricType')
    .orderBy('positionOrder');
};
export const readAdjustedPreview = async (
  game: GamePreviewMetadata,
  deadline: number,
): Promise<AdjustedPreviewAnalysis> => {
  const teams = [game.homeTeam, game.awayTeam];
  const readTeam = (ids: number[], year: number) =>
    optionalRead(() =>
      previewRead(deadline, (db) =>
        db
          .selectFrom('adjustedTeamMetrics as m')
          .innerJoin('team as t', 't.id', 'm.teamId')
          .leftJoin('conferenceTeam as ct', (j) =>
            j
              .onRef('ct.teamId', '=', 't.id')
              .on('ct.startYear', '<=', year)
              .on((eb) =>
                eb.or([
                  eb('ct.endYear', 'is', null),
                  eb('ct.endYear', '>=', year),
                ]),
              ),
          )
          .leftJoin('conference as c', 'c.id', 'ct.conferenceId')
          .where('m.teamId', 'in', ids)
          .where('m.year', '=', year)
          .selectAll('m')
          .select(['t.school as team', 'c.abbreviation as conference'])
          .execute(),
      ),
    );
  const readTeams = async () => {
    const current = await readTeam(
      teams.map((t) => t.id),
      game.season,
    );
    const missing = current.data
      ? teams
          .filter((t) => !current.data!.some((r) => r.teamId === t.id))
          .map((t) => t.id)
      : [];
    const previous = missing.length
      ? await readTeam(missing, game.season - 1)
      : null;
    return { current, previous };
  };
  // Team fallback and all player categories occupy at most two connections.
  const [{ current, previous }, playerSource] = await Promise.all([
    readTeams(),
    optionalRead(() =>
      previewRead(deadline, (db) =>
        previewAdjustedPlayersQuery(db, game).execute(),
      ),
    ),
  ]);
  const mapped = teams.map((team) => {
    const currentRows = current.data?.filter((r) => r.teamId === team.id) ?? [];
    const rows = currentRows.length
      ? currentRows
      : (previous?.data?.filter((r) => r.teamId === team.id) ?? []);
    const source = currentRows.length ? current : (previous ?? current);
    let teamMetrics: PreviewSection<PreviewAdjustedTeamMetrics>;
    try {
      if (!source.data) teamMetrics = section(null, source.reason);
      else if (!rows.length) teamMetrics = section(null, 'no_data');
      else {
        const row = rows[0];
        const { teamId, year, team: name, conference, ...metrics } = row;
        for (const value of Object.values(metrics))
          if (finiteNumber(value) === null) throw new PreviewDataError();
        const conferenceNames = new Set(rows.map((r) => r.conference));
        teamMetrics = section({
          season: year,
          isPreviousSeason: year !== game.season,
          metrics: mapAdjustedTeam({
            ...row,
            teamId,
            year,
            team: name,
            conference: conferenceNames.size === 1 ? (conference ?? '') : '',
          }),
        });
      }
    } catch {
      teamMetrics = section(null, 'invalid_data');
    }
    const players = (
      metric: 'passing' | 'rushing' | 'field_goals',
    ): PreviewSection<PreviewPlayerWepa[]> => {
      if (!playerSource.data) return section(null, playerSource.reason);
      try {
        const data = playerSource.data
          .filter((r) => r.teamId === team.id && r.metricType === metric)
          .map((r) => {
            const metric = finiteNumber(r.metricValue);
            if (
              metric === null ||
              (r.plays !== null &&
                (!Number.isSafeInteger(r.plays) || r.plays < 0))
            )
              throw new PreviewDataError();
            return {
              year: r.year,
              athleteId: r.athleteId,
              athleteName: r.athleteName,
              team: r.team,
              conference: r.conference ?? '',
              position: r.position,
              wepa: Math.round(metric * 100) / 100,
              plays: r.plays,
            };
          });
        return section(data, data.length ? null : 'no_data');
      } catch {
        return section(null, 'invalid_data');
      }
    };
    const kickers = players('field_goals');
    const kickingSection: PreviewSection<PreviewKickerPaar[]> = {
      ...kickers,
      data:
        kickers.data?.map((p) => ({
          year: p.year,
          athleteId: p.athleteId,
          athleteName: p.athleteName,
          team: p.team,
          conference: p.conference,
          paar: p.wepa,
          attempts: p.plays,
        })) ?? null,
    };
    return {
      teamId: team.id,
      season: game.season,
      teamMetrics,
      passing: players('passing'),
      rushing: players('rushing'),
      kicking: kickingSection,
    };
  });
  return { home: mapped[0], away: mapped[1] };
};
