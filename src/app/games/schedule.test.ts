import fixtures from './fixtures/game-previews/calendar-source.json';
import {
  normalizeCalendar,
  selectScheduleWindow,
  getGameSchedule,
} from './schedule';
import { PreviewDataError, PreviewNotFound, storedUtc } from './previewRead';
import { ScheduleSelector } from './schedule';
import { validatePreviewQuery } from './previewRead';

const rows = normalizeCalendar([
  {
    year: 2026,
    seasonType: 'regular',
    week: 4,
    startDate: '2026-09-21 07:00:00',
    endDate: '2026-09-28 06:59:00',
  },
  {
    year: 2026,
    seasonType: 'regular',
    week: 5,
    startDate: '2026-09-28 07:00:00',
    endDate: '2026-10-05 06:59:00',
  },
]);
it.each([
  ['2026-09-28T06:58:59.999Z', 4],
  ['2026-09-28T06:59:00Z', 4],
  ['2026-09-28T06:59:59.999Z', 4],
  ['2026-09-28T07:00:00Z', 5],
  ['2026-09-28T07:00:00.001Z', 5],
])('selects exact inclusive-minute boundary %s', (time, week) => {
  expect(selectScheduleWindow(rows, Date.parse(time)).window?.week).toBe(week);
});
it('uses next across gaps and seasons, and none after the last window', () => {
  expect(selectScheduleWindow(rows, Date.parse('2025-01-01Z')).selection).toBe(
    'next',
  );
  expect(selectScheduleWindow(rows, Date.parse('2027-01-01Z'))).toEqual({
    selection: 'none',
    window: null,
    followingWindow: null,
  });
});
it('supports explicit historical Week 0 and reports missing identity', () => {
  const zero = { ...rows[0], week: 0 };
  expect(
    selectScheduleWindow([zero], 0, {
      year: 2026,
      seasonType: 'regular',
      week: 0,
    }).selection,
  ).toBe('explicit');
  expect(() =>
    selectScheduleWindow(rows, 0, {
      year: 2026,
      seasonType: 'regular',
      week: 0,
    }),
  ).toThrow(PreviewNotFound);
});
it('rejects duplicates, overlaps, and competing next windows', () => {
  expect(() =>
    selectScheduleWindow([rows[0], rows[0]], Date.parse(rows[0].startDate)),
  ).toThrow(PreviewDataError);
  const overlap = {
    ...rows[1],
    seasonType: 'postseason' as const,
    startDate: '2026-09-27T07:00:00.000Z',
  };
  expect(() =>
    selectScheduleWindow([rows[0], overlap], Date.parse(rows[0].startDate)),
  ).toThrow(PreviewDataError);
  const selector: ScheduleSelector = {
    year: 2026,
    seasonType: 'regular',
    week: 4,
  };
  expect(
    selectScheduleWindow([rows[0], overlap], 0, selector).followingWindow,
  ).toBeNull();
  expect(() =>
    selectScheduleWindow([rows[0], { ...rows[0], week: 6 }], 0),
  ).toThrow(PreviewDataError);
});
it('preserves DST and January football season without offset arithmetic', () => {
  const normalized = normalizeCalendar([
    {
      year: 2026,
      seasonType: 'regular',
      week: 9,
      startDate: '2026-10-26 07:00:00',
      endDate: '2026-11-02 07:59:00',
    },
    {
      year: 2026,
      seasonType: 'postseason',
      week: 1,
      startDate: '2026-12-12 08:00:00',
      endDate: '2027-01-28 07:59:00',
    },
  ]);
  expect(normalized[0].endDate).toBe('2026-11-02T08:00:00.000Z');
  expect(
    selectScheduleWindow(normalized, Date.parse('2027-01-01Z')).window?.year,
  ).toBe(2026);
});
it.each(['bad', '2026-09-28 06:59:30', '2026-09-20 07:00:00'])(
  'rejects unsupported or invalid ends %s',
  (endDate) => {
    expect(() =>
      normalizeCalendar([
        {
          year: 2026,
          seasonType: 'regular',
          week: 4,
          startDate: '2026-09-21 07:00:00',
          endDate,
        },
      ]),
    ).toThrow(PreviewDataError);
  },
);
it('does not parse ambiguous timestamps or unknown query shapes', () => {
  expect(storedUtc('2026-09-25T00:00:00-04:00')).toBeNull();
  for (const query of [
    { refresh: 'true' },
    { week: ['1', '2'] },
    { conference: { name: 'sec' } },
    { conference: ' ' },
  ])
    expect(() => validatePreviewQuery(query, ['conference', 'week'])).toThrow();
});
it('validates complete selectors and safe integers before reads', async () => {
  await expect(getGameSchedule(2026)).rejects.toThrow();
  await expect(getGameSchedule(2026, 'regular', -1)).rejects.toThrow();
  await expect(
    getGameSchedule(Number.MAX_SAFE_INTEGER + 1, 'regular', 0),
  ).rejects.toThrow();
});

it('matches original source fixtures across early years, DST, and postseason', () => {
  for (const fixture of fixtures) {
    for (const week of fixture.weeks) {
      if (![2, 3].includes(week.seasonType)) continue;
      const [normalized] = normalizeCalendar([
        {
          year: week.year,
          seasonType: week.seasonType === 2 ? 'regular' : 'postseason',
          week: week.weekNumber,
          startDate: week.startDate.replace('T', ' ').replace('Z', ':00'),
          endDate: week.endDate.replace('T', ' ').replace('Z', ':00'),
        },
      ]);
      expect(Date.parse(normalized.startDate)).toBe(Date.parse(week.startDate));
      expect(Date.parse(normalized.endDate)).toBe(
        Date.parse(week.endDate) + 60000,
      );
    }
  }
});
