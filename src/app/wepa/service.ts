import { kdb } from '../../config/database';
import { AdjustedTeamMetrics, KickerPAAR, PlayerWeightedEPA } from './types';

export const getAdjustedTeamStats = async (
  year?: number,
  team?: string,
  conference?: string,
) => {
  let query = kdb
    .selectFrom('adjustedTeamMetrics')
    .innerJoin('teamInfo', (join) =>
      join
        .onRef('adjustedTeamMetrics.teamId', '=', 'teamInfo.id')
        .onRef('teamInfo.startYear', '<=', 'adjustedTeamMetrics.year')
        .on((eb) =>
          eb.or([
            eb('teamInfo.endYear', 'is', null),
            eb('teamInfo.endYear', '>=', eb.ref('adjustedTeamMetrics.year')),
          ]),
        ),
    )
    .selectAll('adjustedTeamMetrics')
    .select([
      'teamInfo.id as teamId',
      'teamInfo.school as team',
      'teamInfo.conferenceAbbreviation as conference',
    ]);

  if (year) {
    query = query.where('adjustedTeamMetrics.year', '=', year);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['teamInfo.school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['teamInfo.conferenceAbbreviation']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  const results = await query.execute();

  return results.map(
    (r): AdjustedTeamMetrics => ({
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
    }),
  );
};

export const getPlayerPassingWepa = async (
  year?: number,
  team?: string,
  conference?: string,
  position?: string,
): Promise<PlayerWeightedEPA[]> => {
  let query = kdb
    .selectFrom('adjustedPlayerMetrics')
    .innerJoin('athlete', 'adjustedPlayerMetrics.athleteId', 'athlete.id')
    .innerJoin('athleteTeam', (join) =>
      join
        .onRef('athlete.id', '=', 'athleteTeam.athleteId')
        .onRef('adjustedPlayerMetrics.year', '>=', 'athleteTeam.startYear')
        .onRef('adjustedPlayerMetrics.year', '<=', 'athleteTeam.endYear'),
    )
    .innerJoin('position', 'athlete.positionId', 'position.id')
    .innerJoin('teamInfo', (join) =>
      join
        .onRef('athleteTeam.teamId', '=', 'teamInfo.id')
        .onRef('adjustedPlayerMetrics.year', '>=', 'teamInfo.startYear')
        .on((eb) =>
          eb.or([
            eb('teamInfo.endYear', '>=', eb.ref('adjustedPlayerMetrics.year')),
            eb('teamInfo.endYear', 'is', null),
          ]),
        ),
    )
    .where('adjustedPlayerMetrics.metricType', '=', 'passing')
    .where('position.abbreviation', '=', 'QB')
    .select([
      'athlete.id',
      'athlete.name',
      'adjustedPlayerMetrics.year',
      'position.abbreviation as position',
      'teamInfo.school as team',
      'teamInfo.conference',
      'adjustedPlayerMetrics.metricValue as epa',
      'adjustedPlayerMetrics.plays',
    ])
    .distinct();

  if (year) {
    query = query.where('adjustedPlayerMetrics.year', '=', year);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['teamInfo.school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['teamInfo.conference']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  if (position) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['position.abbreviation']),
        '=',
        position.toLowerCase(),
      ),
    );
  }

  const results = await query.execute();

  return results.map(
    (r): PlayerWeightedEPA => ({
      year: r.year,
      athleteId: r.id,
      athleteName: r.name,
      position: r.position,
      team: r.team ?? '',
      conference: r.conference ?? '',
      wepa: Math.round(Number(r.epa) * 100) / 100,
      plays: r.plays ?? 0,
    }),
  );
};

export const getPlayerRushingWepa = async (
  year?: number,
  team?: string,
  conference?: string,
  position?: string,
): Promise<PlayerWeightedEPA[]> => {
  let query = kdb
    .selectFrom('adjustedPlayerMetrics')
    .innerJoin('athlete', 'adjustedPlayerMetrics.athleteId', 'athlete.id')
    .innerJoin('athleteTeam', (join) =>
      join
        .onRef('athlete.id', '=', 'athleteTeam.athleteId')
        .onRef('adjustedPlayerMetrics.year', '>=', 'athleteTeam.startYear')
        .onRef('adjustedPlayerMetrics.year', '<=', 'athleteTeam.endYear'),
    )
    .innerJoin('position', 'athlete.positionId', 'position.id')
    .innerJoin('teamInfo', (join) =>
      join
        .onRef('athleteTeam.teamId', '=', 'teamInfo.id')
        .onRef('adjustedPlayerMetrics.year', '>=', 'teamInfo.startYear')
        .on((eb) =>
          eb.or([
            eb('teamInfo.endYear', '>=', eb.ref('adjustedPlayerMetrics.year')),
            eb('teamInfo.endYear', 'is', null),
          ]),
        ),
    )
    .where('adjustedPlayerMetrics.metricType', '=', 'rushing')
    .where('position.abbreviation', 'in', ['QB', 'RB', 'WR', 'TE', 'FB'])
    .select([
      'athlete.id',
      'athlete.name',
      'adjustedPlayerMetrics.year',
      'position.abbreviation as position',
      'teamInfo.school as team',
      'teamInfo.conference',
      'adjustedPlayerMetrics.metricValue as epa',
      'adjustedPlayerMetrics.plays',
    ])
    .distinct();

  if (year) {
    query = query.where('adjustedPlayerMetrics.year', '=', year);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['teamInfo.school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['teamInfo.conference']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  if (position) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['position.abbreviation']),
        '=',
        position.toLowerCase(),
      ),
    );
  }

  const results = await query.execute();

  return results.map(
    (r): PlayerWeightedEPA => ({
      year: r.year,
      athleteId: r.id,
      athleteName: r.name,
      position: r.position,
      team: r.team ?? '',
      conference: r.conference ?? '',
      wepa: Math.round(Number(r.epa) * 100) / 100,
      plays: r.plays ?? 0,
    }),
  );
};

export const getKickerPaar = async (
  year?: number,
  team?: string,
  conference?: string,
): Promise<KickerPAAR[]> => {
  let query = kdb
    .selectFrom('adjustedPlayerMetrics')
    .innerJoin('athlete', 'adjustedPlayerMetrics.athleteId', 'athlete.id')
    .innerJoin('athleteTeam', (join) =>
      join
        .onRef('athlete.id', '=', 'athleteTeam.athleteId')
        .onRef('adjustedPlayerMetrics.year', '>=', 'athleteTeam.startYear')
        .onRef('adjustedPlayerMetrics.year', '<=', 'athleteTeam.endYear'),
    )
    .innerJoin('position', 'athlete.positionId', 'position.id')
    .innerJoin('teamInfo', (join) =>
      join
        .onRef('athleteTeam.teamId', '=', 'teamInfo.id')
        .onRef('adjustedPlayerMetrics.year', '>=', 'teamInfo.startYear')
        .on((eb) =>
          eb.or([
            eb('teamInfo.endYear', '>=', eb.ref('adjustedPlayerMetrics.year')),
            eb('teamInfo.endYear', 'is', null),
          ]),
        ),
    )
    .where('adjustedPlayerMetrics.metricType', '=', 'field_goals')
    .select([
      'athlete.id',
      'athlete.name',
      'adjustedPlayerMetrics.year',
      'position.abbreviation as position',
      'teamInfo.school as team',
      'teamInfo.conference',
      'adjustedPlayerMetrics.metricValue as epa',
      'adjustedPlayerMetrics.plays',
    ])
    .distinct();

  if (year) {
    query = query.where('adjustedPlayerMetrics.year', '=', year);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['teamInfo.school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['teamInfo.conference']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  const results = await query.execute();

  return results.map(
    (r): KickerPAAR => ({
      year: r.year,
      athleteId: r.id,
      athleteName: r.name,
      team: r.team ?? '',
      conference: r.conference ?? '',
      paar: Math.round(Number(r.epa) * 100) / 100,
      attempts: r.plays ?? 0,
    }),
  );
};
