jest.mock('../../config/database', () => ({
  db: {},
  authDb: {},
  kdb: { selectFrom: jest.fn() },
}));

import { ValidateError } from 'tsoa';

import { kdb } from '../../config/database';
import {
  getConferences,
  getTeamConferenceAffiliations,
  getTeamConferenceChanges,
  validateAffiliationYearFilters,
} from './service';
import { ConferenceClassification } from './types';

const selectFrom = kdb.selectFrom as jest.Mock;

const createQueryBuilder = (rows: unknown[] = []) => {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'leftJoin',
    'select',
    'where',
    'groupBy',
    'orderBy',
  ]) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.execute = jest.fn().mockResolvedValue(rows);
  return builder;
};

const createJoinBuilder = () => {
  const builder: Record<string, jest.Mock> = {};
  builder.on = jest.fn().mockReturnValue(builder);
  builder.onRef = jest.fn().mockReturnValue(builder);
  return builder;
};

const createExpressionBuilder = () => {
  const builder = jest.fn((...args: unknown[]) => args) as jest.Mock & {
    fn: jest.Mock;
    or: jest.Mock;
  };
  builder.fn = jest.fn((...args: unknown[]) => args);
  builder.or = jest.fn((expressions: unknown[]) => expressions);
  return builder;
};

beforeEach(() => {
  selectFrom.mockReset();
});

describe('affiliation year validation', () => {
  test('accepts point-in-time, half-range, and bounded-range filters', () => {
    expect(() => validateAffiliationYearFilters()).not.toThrow();
    expect(() => validateAffiliationYearFilters(2024)).not.toThrow();
    expect(() => validateAffiliationYearFilters(undefined, 1990)).not.toThrow();
    expect(() =>
      validateAffiliationYearFilters(undefined, undefined, 1999),
    ).not.toThrow();
    expect(() =>
      validateAffiliationYearFilters(undefined, 1990, 1999),
    ).not.toThrow();
  });

  test('rejects a point-in-time year combined with range filters', () => {
    expect(() => validateAffiliationYearFilters(2024, 2020)).toThrow(
      ValidateError,
    );
    expect(() => validateAffiliationYearFilters(2024, undefined, 2025)).toThrow(
      ValidateError,
    );
  });

  test('rejects a reversed year range', () => {
    expect(() => validateAffiliationYearFilters(undefined, 2025, 2020)).toThrow(
      ValidateError,
    );
  });
});

describe('team conference affiliations', () => {
  const row = {
    teamId: 10,
    team: 'Test State',
    conferenceId: 20,
    conference: 'Pre-classification Independents',
    conferenceAbbreviation: 'IND-PC',
    classification: 'ii/iii',
    conferenceDivision: null,
    startYear: 1890,
    endYear: null,
  };

  test('maps stored intervals without expansion', async () => {
    const builder = createQueryBuilder([row]);
    selectFrom.mockReturnValue(builder);

    await expect(getTeamConferenceAffiliations()).resolves.toEqual([
      {
        ...row,
        classification: ConferenceClassification.IIOrIII,
      },
    ]);
    expect(selectFrom).toHaveBeenCalledWith('conferenceTeam as ct');
    expect(builder.where).not.toHaveBeenCalled();
  });

  test('matches team and conference names or abbreviations case-insensitively', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getTeamConferenceAffiliations('TEST STATE', 'TEST CONFERENCE');

    const predicates = builder.where.mock.calls
      .map(([predicate]) => predicate)
      .filter((predicate) => predicate instanceof Function);
    expect(predicates).toHaveLength(2);

    const teamExpression = createExpressionBuilder();
    predicates[0](teamExpression);
    expect(teamExpression.fn).toHaveBeenCalledWith('lower', ['team.school']);
    expect(teamExpression.fn).toHaveBeenCalledWith('lower', [
      'team.abbreviation',
    ]);
    expect(teamExpression).toHaveBeenCalledWith(
      expect.anything(),
      '=',
      'test state',
    );

    const conferenceExpression = createExpressionBuilder();
    predicates[1](conferenceExpression);
    expect(conferenceExpression.fn).toHaveBeenCalledWith('lower', [
      'conference.name',
    ]);
    expect(conferenceExpression.fn).toHaveBeenCalledWith('lower', [
      'conference.abbreviation',
    ]);
    expect(conferenceExpression).toHaveBeenCalledWith(
      expect.anything(),
      '=',
      'test conference',
    );
  });

  test('applies inclusive point-in-time filtering', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getTeamConferenceAffiliations(undefined, undefined, 2024);

    expect(builder.where).toHaveBeenCalledWith('ct.startYear', '<=', 2024);
    expect(
      builder.where.mock.calls.some(
        ([predicate]) => predicate instanceof Function,
      ),
    ).toBe(true);
  });

  test('applies independent lower and upper range bounds', async () => {
    const lowerBuilder = createQueryBuilder();
    selectFrom.mockReturnValueOnce(lowerBuilder);

    await getTeamConferenceAffiliations(undefined, undefined, undefined, 1990);

    expect(
      lowerBuilder.where.mock.calls.some(
        ([predicate]) => predicate instanceof Function,
      ),
    ).toBe(true);

    const upperBuilder = createQueryBuilder();
    selectFrom.mockReturnValueOnce(upperBuilder);

    await getTeamConferenceAffiliations(
      undefined,
      undefined,
      undefined,
      undefined,
      1999,
    );

    expect(upperBuilder.where).toHaveBeenCalledWith('ct.startYear', '<=', 1999);
  });

  test('fails rather than emitting an affiliation without a start year', async () => {
    const builder = createQueryBuilder([{ ...row, startYear: null }]);
    selectFrom.mockReturnValue(builder);

    await expect(getTeamConferenceAffiliations()).rejects.toThrow(
      'has no start year',
    );
  });
});

describe('team conference changes', () => {
  test('maps a contiguous different-conference transition', async () => {
    const builder = createQueryBuilder([
      {
        teamId: 10,
        team: 'Test State',
        fromConferenceId: 20,
        fromConference: 'Old Conference',
        fromConferenceAbbreviation: 'OLD',
        fromClassification: 'fcs',
        toConferenceId: 30,
        toConference: 'New Conference',
        toConferenceAbbreviation: 'NEW',
        toClassification: 'fbs',
      },
    ]);
    selectFrom.mockReturnValue(builder);

    await expect(getTeamConferenceChanges(2024)).resolves.toEqual([
      {
        teamId: 10,
        team: 'Test State',
        fromConferenceId: 20,
        fromConference: 'Old Conference',
        fromConferenceAbbreviation: 'OLD',
        fromClassification: ConferenceClassification.FCS,
        toConferenceId: 30,
        toConference: 'New Conference',
        toConferenceAbbreviation: 'NEW',
        toClassification: ConferenceClassification.FBS,
        effectiveYear: 2024,
      },
    ]);

    expect(selectFrom).toHaveBeenCalledWith('conferenceTeam as destination');
    expect(builder.where).toHaveBeenCalledWith(
      'destination.startYear',
      '=',
      2024,
    );

    const join = createJoinBuilder();
    const sourceJoin = builder.innerJoin.mock.calls[0][1];
    sourceJoin(join);
    expect(join.onRef).toHaveBeenCalledWith(
      'source.teamId',
      '=',
      'destination.teamId',
    );
    expect(join.on).toHaveBeenCalledWith('source.endYear', '=', 2023);
    expect(join.onRef).toHaveBeenCalledWith(
      'source.conferenceId',
      '!=',
      'destination.conferenceId',
    );
  });
});

describe('conference discovery', () => {
  const conferenceRow = {
    id: 20,
    name: 'Test Conference',
    shortName: 'Test',
    abbreviation: 'TEST',
    classification: 'fbs',
    memberCount: '12',
  };

  test('returns all conferences with current member counts by default', async () => {
    const builder = createQueryBuilder([conferenceRow]);
    selectFrom.mockReturnValue(builder);

    await expect(getConferences()).resolves.toEqual([
      {
        ...conferenceRow,
        classification: ConferenceClassification.FBS,
        memberCount: 12,
      },
    ]);
    expect(selectFrom).toHaveBeenCalledWith('conference');
    expect(builder.where).not.toHaveBeenCalled();

    const join = createJoinBuilder();
    const membershipJoin = builder.leftJoin.mock.calls[0][1];
    membershipJoin(join);
    expect(join.on).toHaveBeenCalledWith('ct.endYear', 'is', null);
  });

  test('requires a matched active membership for year discovery', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getConferences(1995, ConferenceClassification.FBS);

    expect(builder.where).toHaveBeenCalledWith('ct.id', 'is not', null);
    expect(builder.where).toHaveBeenCalledWith(
      'conference.division',
      '=',
      ConferenceClassification.FBS,
    );

    const join = createJoinBuilder();
    const membershipJoin = builder.leftJoin.mock.calls[0][1];
    membershipJoin(join);
    expect(join.on).toHaveBeenCalledWith('ct.startYear', '<=', 1995);
  });
});
