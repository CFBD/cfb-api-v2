import { PlayerStat } from '../stats/types';
import {
  mapPlayerSearchStintSummaries,
  mapPlayerSeasonOverviewCategories,
} from './service';

jest.mock('../../config/database', () => ({
  db: {},
  authDb: {},
  kdb: {},
}));

const buildStat = (
  category: string,
  statType: string,
  stat: string,
): PlayerStat => ({
  season: 2024,
  playerId: '123',
  player: 'Test Quarterback',
  position: 'QB',
  team: 'Test State',
  conference: 'Test Conference',
  category,
  statType,
  stat,
});

describe('mapPlayerSeasonOverviewCategories', () => {
  test('groups quarterback passing stats into one category', () => {
    const categories = mapPlayerSeasonOverviewCategories([
      buildStat('passing', 'COMPLETIONS', '250'),
      buildStat('passing', 'ATT', '375'),
      buildStat('passing', 'YDS', '3200'),
      buildStat('passing', 'TD', '28'),
      buildStat('passing', 'INT', '8'),
      buildStat('passing', 'PCT', '0.667'),
    ]);

    expect(categories).toEqual([
      {
        name: 'passing',
        stats: [
          { name: 'COMPLETIONS', value: '250' },
          { name: 'ATT', value: '375' },
          { name: 'YDS', value: '3200' },
          { name: 'TD', value: '28' },
          { name: 'INT', value: '8' },
          { name: 'PCT', value: '0.667' },
        ],
      },
    ]);
  });

  test('keeps separate stat categories for multi-category players', () => {
    const categories = mapPlayerSeasonOverviewCategories([
      buildStat('passing', 'YDS', '3200'),
      buildStat('rushing', 'CAR', '120'),
      buildStat('rushing', 'YDS', '540'),
      buildStat('passing', 'TD', '28'),
    ]);

    expect(categories).toEqual([
      {
        name: 'passing',
        stats: [
          { name: 'YDS', value: '3200' },
          { name: 'TD', value: '28' },
        ],
      },
      {
        name: 'rushing',
        stats: [
          { name: 'CAR', value: '120' },
          { name: 'YDS', value: '540' },
        ],
      },
    ]);
  });
});

describe('mapPlayerSearchStintSummaries', () => {
  test('maps a single raw stint', () => {
    const summaries = mapPlayerSearchStintSummaries([
      {
        rowId: 1,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2021,
        endYear: 2023,
      },
    ]);

    expect(summaries.get('1')).toMatchObject({
      activeStartYear: 2021,
      activeEndYear: 2023,
      teamStints: [{ team: 'Team A', startYear: 2021, endYear: 2023 }],
    });
  });

  test('merges consecutive same-team rows', () => {
    const summaries = mapPlayerSearchStintSummaries([
      {
        rowId: 1,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2021,
        endYear: 2021,
      },
      {
        rowId: 2,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2022,
        endYear: 2023,
      },
    ]);

    expect(summaries.get('1')).toMatchObject({
      activeStartYear: 2021,
      activeEndYear: 2023,
      teamStints: [{ team: 'Team A', startYear: 2021, endYear: 2023 }],
    });
  });

  test('merges overlapping same-team rows', () => {
    const summaries = mapPlayerSearchStintSummaries([
      {
        rowId: 1,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2021,
        endYear: 2023,
      },
      {
        rowId: 2,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2022,
        endYear: 2024,
      },
    ]);

    expect(summaries.get('1')).toMatchObject({
      activeStartYear: 2021,
      activeEndYear: 2024,
      teamStints: [{ team: 'Team A', startYear: 2021, endYear: 2024 }],
    });
  });

  test('keeps non-consecutive same-team rows separate', () => {
    const summaries = mapPlayerSearchStintSummaries([
      {
        rowId: 1,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2021,
        endYear: 2021,
      },
      {
        rowId: 2,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2023,
        endYear: 2023,
      },
    ]);

    expect(summaries.get('1')).toMatchObject({
      activeStartYear: 2021,
      activeEndYear: 2023,
      teamStints: [
        { team: 'Team A', startYear: 2021, endYear: 2021 },
        { team: 'Team A', startYear: 2023, endYear: 2023 },
      ],
    });
  });

  test('keeps active end year null for open-ended current stints', () => {
    const summaries = mapPlayerSearchStintSummaries([
      {
        rowId: 1,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2023,
        endYear: null,
      },
      {
        rowId: 2,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2024,
        endYear: 2024,
      },
    ]);

    expect(summaries.get('1')).toMatchObject({
      activeStartYear: 2023,
      activeEndYear: null,
      teamStints: [{ team: 'Team A', startYear: 2023, endYear: null }],
    });
  });

  test('keeps transfer stints distinct', () => {
    const summaries = mapPlayerSearchStintSummaries([
      {
        rowId: 1,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2021,
        endYear: 2022,
      },
      {
        rowId: 2,
        athleteId: '1',
        teamId: 20,
        team: 'Team B',
        startYear: 2023,
        endYear: 2024,
      },
    ]);

    expect(summaries.get('1')).toMatchObject({
      activeStartYear: 2021,
      activeEndYear: 2024,
      teamStints: [
        { team: 'Team A', startYear: 2021, endYear: 2022 },
        { team: 'Team B', startYear: 2023, endYear: 2024 },
      ],
    });
  });

  test('tracks latest team details from the most recent stint', () => {
    const summaries = mapPlayerSearchStintSummaries([
      {
        rowId: 1,
        athleteId: '1',
        teamId: 10,
        team: 'Idaho State',
        color: 'ef8c00',
        altColor: 'e9a126',
        startYear: 2022,
        endYear: 2022,
      },
      {
        rowId: 2,
        athleteId: '1',
        teamId: 20,
        team: 'Utah',
        color: 'ea002a',
        altColor: 'ffffff',
        startYear: 2023,
        endYear: 2024,
      },
    ]);

    expect(summaries.get('1')).toMatchObject({
      activeStartYear: 2022,
      activeEndYear: 2024,
      latestTeam: {
        team: 'Utah',
        teamColor: '#ea002a',
        teamColorSecondary: '#ffffff',
      },
      teamStints: [
        { team: 'Idaho State', startYear: 2022, endYear: 2022 },
        { team: 'Utah', startYear: 2023, endYear: 2024 },
      ],
    });
  });

  test('keeps same-team returns after a gap separate', () => {
    const summaries = mapPlayerSearchStintSummaries([
      {
        rowId: 1,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2021,
        endYear: 2021,
      },
      {
        rowId: 2,
        athleteId: '1',
        teamId: 20,
        team: 'Team B',
        startYear: 2022,
        endYear: 2022,
      },
      {
        rowId: 3,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2024,
        endYear: 2024,
      },
    ]);

    expect(summaries.get('1')).toMatchObject({
      activeStartYear: 2021,
      activeEndYear: 2024,
      teamStints: [
        { team: 'Team A', startYear: 2021, endYear: 2021 },
        { team: 'Team B', startYear: 2022, endYear: 2022 },
        { team: 'Team A', startYear: 2024, endYear: 2024 },
      ],
    });
  });

  test('maps multiple athletes independently', () => {
    const summaries = mapPlayerSearchStintSummaries([
      {
        rowId: 1,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2021,
        endYear: 2022,
      },
      {
        rowId: 2,
        athleteId: '2',
        teamId: 20,
        team: 'Team B',
        startYear: 2023,
        endYear: 2024,
      },
    ]);

    expect(summaries.size).toBe(2);
    expect(summaries.get('1')).toMatchObject({
      activeStartYear: 2021,
      activeEndYear: 2022,
      teamStints: [{ team: 'Team A', startYear: 2021, endYear: 2022 }],
    });
    expect(summaries.get('2')).toMatchObject({
      activeStartYear: 2023,
      activeEndYear: 2024,
      teamStints: [{ team: 'Team B', startYear: 2023, endYear: 2024 }],
    });
  });

  test('preserves null-start rows without using them for adjacency', () => {
    const summaries = mapPlayerSearchStintSummaries([
      {
        rowId: 1,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: null,
        endYear: 2023,
      },
      {
        rowId: 2,
        athleteId: '1',
        teamId: 10,
        team: 'Team A',
        startYear: 2024,
        endYear: 2024,
      },
    ]);

    expect(summaries.get('1')).toMatchObject({
      activeStartYear: 2024,
      activeEndYear: 2024,
      teamStints: [
        { team: 'Team A', startYear: 2024, endYear: 2024 },
        { team: 'Team A', startYear: null, endYear: 2023 },
      ],
    });
  });
});
