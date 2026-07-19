import { ValidateError } from 'tsoa';

import { SeasonType } from '../enums';
import { PlayoffCompetition, PlayoffRound } from '../playoffs/types';
import {
  getGames,
  mapGamePlayoff,
  validateGamePlayoffFilters,
} from './service';

jest.mock('../../config/database', () => ({
  db: {},
  authDb: {},
  kdb: { selectFrom: jest.fn() },
}));

import { kdb } from '../../config/database';

const selectFrom = kdb.selectFrom as jest.Mock;

const createQueryBuilder = () => {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'leftJoin',
    'orderBy',
    'select',
    'where',
  ]) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.execute = jest.fn().mockResolvedValue([]);
  return builder;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('validateGamePlayoffFilters', () => {
  test('rejects round without competition', () => {
    expect(() =>
      validateGamePlayoffFilters(undefined, undefined, PlayoffRound.Semifinal),
    ).toThrow(ValidateError);
  });

  test('rejects CFP with the regular season type', () => {
    expect(() =>
      validateGamePlayoffFilters(SeasonType.Regular, PlayoffCompetition.Cfp),
    ).toThrow(ValidateError);
  });

  test('accepts CFP with postseason or an omitted season type', () => {
    expect(() =>
      validateGamePlayoffFilters(
        SeasonType.Postseason,
        PlayoffCompetition.Cfp,
        PlayoffRound.Quarterfinal,
      ),
    ).not.toThrow();
    expect(() =>
      validateGamePlayoffFilters(undefined, PlayoffCompetition.Cfp),
    ).not.toThrow();
  });
});

describe('mapGamePlayoff', () => {
  test('maps structured CFP metadata', () => {
    expect(
      mapGamePlayoff({
        playoffMatchupId: 10,
        playoffCompetition: 'cfp',
        playoffFormat: 'twelve_team_2024',
        playoffRound: 'quarterfinal',
        playoffRoundName: 'Quarterfinal',
        playoffBracketSlot: 'QF1',
        homeSeed: 1,
        awaySeed: 8,
        bowlName: 'Rose Bowl',
      }),
    ).toEqual({
      competition: PlayoffCompetition.Cfp,
      format: 'twelve_team_2024',
      round: PlayoffRound.Quarterfinal,
      roundName: 'Quarterfinal',
      bracketSlot: 'QF1',
      homeSeed: 1,
      awaySeed: 8,
      bowlName: 'Rose Bowl',
    });
  });

  test('returns null for a non-playoff postseason game', () => {
    expect(
      mapGamePlayoff({
        playoffMatchupId: null,
        playoffCompetition: null,
        playoffFormat: null,
        playoffRound: null,
        playoffRoundName: null,
        playoffBracketSlot: null,
        homeSeed: null,
        awaySeed: null,
        bowlName: null,
      }),
    ).toBeNull();
  });
});

describe('getGames playoff query construction', () => {
  test('applies CFP and postseason predicates alongside a game id', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getGames(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      123,
      PlayoffCompetition.Cfp,
      PlayoffRound.Semifinal,
    );

    expect(builder.where.mock.calls).toEqual(
      expect.arrayContaining([
        ['game.id', '=', 123],
        ['playoffTournament.competition', '=', PlayoffCompetition.Cfp],
        ['game.seasonType', '=', SeasonType.Postseason],
        ['playoffRound.code', '=', PlayoffRound.Semifinal],
      ]),
    );
  });

  test('omitted playoff filters add no playoff predicate', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getGames(2024);

    const filteredColumns = builder.where.mock.calls.map((call) => call[0]);
    expect(filteredColumns).not.toContain('playoffTournament.competition');
    expect(filteredColumns).not.toContain('playoffRound.code');
  });
});
