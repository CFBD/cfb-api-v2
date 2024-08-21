import { ValidateError } from 'tsoa';
import { kdb } from '../../config/database';
import { DivisionClassification, SeasonType } from '../enums';
import { BettingGame, GameLine } from './types';

export const getLines = async (
  gameId?: number,
  year?: number,
  seasonType?: SeasonType,
  week?: number,
  team?: string,
  home?: string,
  away?: string,
  conference?: string,
  provider?: string,
): Promise<BettingGame[]> => {
  if (!year && !gameId) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required' },
      },
      'Validation error',
    );
  }

  let gamesQuery = kdb
    .selectFrom('game')
    .innerJoin('gameTeam as hgt', (join) =>
      join.onRef('game.id', '=', 'hgt.gameId').on('hgt.homeAway', '=', 'home'),
    )
    .innerJoin('team as ht', 'hgt.teamId', 'ht.id')
    .innerJoin('gameTeam as agt', (join) =>
      join.onRef('game.id', '=', 'agt.gameId').on('agt.homeAway', '=', 'away'),
    )
    .innerJoin('team as awt', 'agt.teamId', 'awt.id')
    .leftJoin('conferenceTeam as hct', (join) =>
      join
        .onRef('ht.id', '=', 'hct.teamId')
        .onRef('hct.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('hct.endYear', 'is', null),
            eb('hct.endYear', '>=', eb.ref('game.season')),
          ]),
        ),
    )
    .leftJoin('conference as hc', 'hct.conferenceId', 'hc.id')
    .leftJoin('conferenceTeam as act', (join) =>
      join
        .onRef('awt.id', '=', 'act.teamId')
        .onRef('act.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('act.endYear', 'is', null),
            eb('act.endYear', '>=', eb.ref('game.season')),
          ]),
        ),
    )
    .leftJoin('conference as ac', 'act.conferenceId', 'ac.id')
    .leftJoin('gameLines', 'game.id', 'gameLines.gameId')
    .leftJoin('linesProvider', 'gameLines.linesProviderId', 'linesProvider.id')
    .select([
      'game.id',
      'game.season',
      'game.week',
      'game.seasonType',
      'game.startDate',
      'ht.school as homeSchool',
      'hc.name as homeConference',
      'hc.division as homeClassification',
      'hgt.points as homeScore',
      'awt.school as awaySchool',
      'ac.name as awayConference',
      'ac.division as awayClassification',
      'agt.points as awayScore',
      'linesProvider.name',
      'gameLines.spread',
      'gameLines.spreadOpen',
      'gameLines.overUnder',
      'gameLines.overUnderOpen',
      'gameLines.moneylineHome',
      'gameLines.moneylineAway',
    ]);

  if (gameId) {
    gamesQuery = gamesQuery.where('game.id', '=', gameId);
  } else if (year) {
    gamesQuery = gamesQuery.where('game.season', '=', year);

    if (seasonType && seasonType != SeasonType.Both) {
      gamesQuery = gamesQuery.where('game.seasonType', '=', seasonType);
    }

    if (week) {
      gamesQuery = gamesQuery.where('game.week', '=', week);
    }

    if (team) {
      gamesQuery = gamesQuery.where((eb) =>
        eb.or([
          eb(eb.fn('lower', ['awt.school']), '=', team.toLowerCase()),
          eb(eb.fn('lower', ['ht.school']), '=', team.toLowerCase()),
        ]),
      );
    }

    if (home) {
      gamesQuery = gamesQuery.where((eb) =>
        eb(eb.fn('lower', ['ht.school']), '=', home.toLowerCase()),
      );
    }

    if (away) {
      gamesQuery = gamesQuery.where((eb) =>
        eb(eb.fn('lower', ['awt.school']), '=', away.toLowerCase()),
      );
    }

    if (conference) {
      gamesQuery = gamesQuery.where((eb) =>
        eb.or([
          eb(
            eb.fn('lower', ['hc.abbreviation']),
            '=',
            conference.toLowerCase(),
          ),
          eb(
            eb.fn('lower', ['ac.abbreviation']),
            '=',
            conference.toLowerCase(),
          ),
        ]),
      );
    }
  }

  if (provider) {
    gamesQuery = gamesQuery.where((eb) =>
      eb(eb.fn('lower', ['linesProvider.name']), '=', provider.toLowerCase()),
    );
  }

  const games = await gamesQuery.execute();

  const gameIds = Array.from(new Set(games.map((g) => g.id)));
  if (!gameIds.length) {
    return [];
  }

  const results = gameIds.map((id): BettingGame => {
    const records = games.filter((l) => l.id == id);

    const gameLines = records
      .filter((l) => l.name)
      .map(
        (l): GameLine => ({
          provider: l.name || '',
          spread: l.spread ? parseFloat(l.spread) : null,
          formattedSpread: !l.spread
            ? ''
            : parseFloat(l.spread) < 0
              ? `${l.homeSchool} ${l.spread}`
              : `${l.awaySchool} -${l.spread}`,
          spreadOpen: l.spreadOpen ? parseFloat(l.spreadOpen) : null,
          overUnder: l.overUnder ? parseFloat(l.overUnder) : null,
          overUnderOpen: l.overUnderOpen ? parseFloat(l.overUnderOpen) : null,
          homeMoneyline: l.moneylineHome,
          awayMoneyline: l.moneylineAway,
        }),
      );

    const g = records[0];

    return {
      id: g.id,
      season: g.season,
      // @ts-ignore
      seasonType: g.seasonType,
      week: g.week,
      startDate: g.startDate,
      homeTeam: g.homeSchool,
      homeConference: g.homeConference,
      // @ts-ignore
      homeClassification: g.homeClassification,
      homeScore: g.homeScore,
      awayTeam: g.awaySchool,
      awayConference: g.awayConference,
      // @ts-ignore
      awayClassification: g.awayClassification,
      awayScore: g.awayScore,
      lines: gameLines,
    };
  });

  return results.filter(
    (r) =>
      r.lines.length > 0 ||
      r.homeClassification === DivisionClassification.FBS ||
      r.awayClassification === DivisionClassification.FBS,
  );
};
