import { PlayerStat } from '../stats/types';
import { mapPlayerSeasonOverviewCategories } from './service';

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
