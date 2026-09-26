import { GameSchedule, ScheduleWindow } from './previewTypes';
import {
  previewRead,
  storedUtc,
  utcBinding,
  PreviewDataError,
  PreviewNotFound,
  validatePreviewInteger,
  invalidParameter,
  logPreviewResponse,
} from './previewRead';
import { mapPreviewGames, previewGameQuery } from './previewGame';
import { readPreviewEnrichment } from './previewEnrichment';
import { previewCache } from './previewCache';
import { validCalendar, validSlate } from './previewValidation';

export interface ScheduleSelector {
  year: number;
  seasonType: 'regular' | 'postseason';
  week: number;
}
export interface CalendarRow {
  year: number;
  seasonType: string;
  week: number;
  startDate: string;
  endDate: string;
}
export const normalizeCalendar = (rows: CalendarRow[]): ScheduleWindow[] =>
  rows.map((row) => {
    const startDate = storedUtc(row.startDate);
    const end = storedUtc(row.endDate);
    if (
      !startDate ||
      !end ||
      !Number.isSafeInteger(row.year) ||
      row.year <= 0 ||
      !Number.isSafeInteger(row.week) ||
      row.week < 0 ||
      (row.seasonType !== 'regular' && row.seasonType !== 'postseason') ||
      Date.parse(startDate) % 60000 !== 0 ||
      Date.parse(end) % 60000 !== 0 ||
      Date.parse(end) < Date.parse(startDate)
    )
      throw new PreviewDataError();
    return {
      year: row.year,
      week: row.week,
      seasonType: row.seasonType,
      startDate,
      endDate: new Date(Date.parse(end) + 60000).toISOString(),
    };
  });
export const selectScheduleWindow = (
  rows: ScheduleWindow[],
  now: number,
  explicit?: ScheduleSelector,
): Pick<GameSchedule, 'selection' | 'window' | 'followingWindow'> => {
  const sorted = [...rows].sort(
    (a, b) => Date.parse(a.startDate) - Date.parse(b.startDate),
  );
  const candidates = explicit
    ? sorted.filter(
        (r) =>
          r.year === explicit.year &&
          r.seasonType === explicit.seasonType &&
          r.week === explicit.week,
      )
    : sorted.filter(
        (r) => Date.parse(r.startDate) <= now && now < Date.parse(r.endDate),
      );
  let selection: GameSchedule['selection'] = explicit ? 'explicit' : 'active';
  if (!candidates.length && !explicit) {
    const future = sorted.filter((r) => Date.parse(r.startDate) > now);
    candidates.push(
      ...future.filter((r) => r.startDate === future[0]?.startDate),
    );
    selection = candidates.length ? 'next' : 'none';
  }
  if (candidates.length > 1) throw new PreviewDataError();
  const window = candidates[0] ?? null;
  if (!window) {
    if (explicit) throw new PreviewNotFound();
    return { selection, window: null, followingWindow: null };
  }
  if (
    sorted.filter(
      (r) =>
        r.year === window.year &&
        r.seasonType === window.seasonType &&
        r.week === window.week,
    ).length > 1
  )
    throw new PreviewDataError();
  const following = sorted.filter((r) => r.startDate > window.startDate);
  const ambiguous =
    sorted.some(
      (r) =>
        r !== window &&
        r.startDate < window.endDate &&
        r.endDate > window.startDate,
    ) ||
    (following.length > 1 && following[0].startDate === following[1].startDate);
  if (ambiguous && !explicit) throw new PreviewDataError();
  return {
    selection,
    window,
    followingWindow: ambiguous ? null : (following[0] ?? null),
  };
};
export const getGameSchedule = async (
  year?: number,
  seasonType?: 'regular' | 'postseason',
  week?: number,
  classification: 'fbs' | 'fcs' = 'fbs',
  conference?: string,
): Promise<GameSchedule> => {
  const started = Date.now(),
    deadline = started + 8000;
  const cacheOutcomes: string[] = [];
  const observe = (outcome: string) => cacheOutcomes.push(outcome);
  const finish = (result: GameSchedule): GameSchedule => {
    logPreviewResponse(
      `schedule:${result.window?.year}:${result.window?.seasonType}:${result.window?.week}`,
      result,
      started,
      cacheOutcomes,
    );
    return result;
  };
  if (classification !== 'fbs' && classification !== 'fcs')
    invalidParameter('classification', 'classification must be fbs or fcs');
  if (conference !== undefined && !conference.trim())
    invalidParameter('conference', 'conference must be nonblank');
  const hasSelector =
    year !== undefined || seasonType !== undefined || week !== undefined;
  let explicit: ScheduleSelector | undefined;
  if (hasSelector) {
    if (year === undefined || week === undefined || seasonType === undefined)
      invalidParameter(
        'year',
        'year, seasonType, and week are required together',
      );
    validatePreviewInteger(year, 'year');
    validatePreviewInteger(week, 'week', 0);
    if (seasonType !== 'regular' && seasonType !== 'postseason')
      invalidParameter(
        'seasonType',
        'seasonType must be regular or postseason',
      );
    explicit = { year, seasonType, week };
  }
  const filters = {
    classification,
    conference: conference?.trim().toLowerCase() ?? null,
  };
  const calendar = await previewCache(
    `calendar:${explicit ? `${year}:${seasonType}:${week}` : 'default'}`,
    60000,
    validCalendar,
    () =>
      previewRead(deadline, async (db) => {
        let query = db
          .selectFrom('calendar')
          .where('seasonType', 'in', ['regular', 'postseason']);
        // Include relevant overlaps and the next season, without deriving a slate from game weeks.
        if (explicit) query = query.where('year', '>=', explicit.year);
        else
          query = query.where((eb) =>
            eb.or([
              eb(
                'endDate',
                '>=',
                eb.cast<Date>(
                  eb.val(
                    utcBinding(new Date(Date.now() - 60000).toISOString()),
                  ),
                  'timestamp',
                ),
              ),
              eb(
                'startDate',
                '>=',
                eb.cast<Date>(
                  eb.val(utcBinding(new Date().toISOString())),
                  'timestamp',
                ),
              ),
              eb('endDate', 'is', null),
              eb('startDate', 'is', null),
            ]),
          );
        const rows = await query
          .select(['year', 'seasonType', 'week'])
          .select((eb) => [
            eb.cast<string>('startDate', 'text').as('startDate'),
            eb.cast<string>('endDate', 'text').as('endDate'),
          ])
          .orderBy('startDate')
          .execute();
        return normalizeCalendar(rows);
      }),
    deadline,
    observe,
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const selected = selectScheduleWindow(calendar, Date.now(), explicit);
    if (!selected.window)
      return finish({
        assembledAt: new Date().toISOString(),
        ...selected,
        filters,
        games: [],
      });
    const w = selected.window;
    const identity = `${w.year}:${w.seasonType}:${w.week}:${w.startDate}:${w.endDate}`;
    const slate = await previewCache(
      `schedule:${identity}:odds1`,
      60000,
      (value): value is import('./previewValidation').PreviewSlate =>
        validSlate(value) &&
        new Set(value.core.map((c) => c.game.id)).size === value.core.length &&
        value.enrichment.length === value.core.length &&
        value.core.every(
          (c) =>
            c.game.season === w.year &&
            c.game.seasonType === w.seasonType &&
            c.game.startDate !== null &&
            c.game.startDate >= w.startDate &&
            c.game.startDate < w.endDate &&
            value.enrichment.filter((e) => e.id === c.game.id).length === 1,
        ),
      async () => {
        const core = await previewRead(deadline, async (db) =>
          mapPreviewGames(
            await previewGameQuery(db)
              .where('g.season', '=', w.year)
              .where('g.seasonType', '=', w.seasonType)
              .where((eb) =>
                eb(
                  'g.startDate',
                  '>=',
                  eb.cast<Date>(eb.val(utcBinding(w.startDate)), 'timestamp'),
                ),
              )
              .where((eb) =>
                eb(
                  'g.startDate',
                  '<',
                  eb.cast<Date>(eb.val(utcBinding(w.endDate)), 'timestamp'),
                ),
              )
              .execute(),
          ),
        );
        const enrichment = core.length
          ? await readPreviewEnrichment(
              core.map((x) => x.game.id),
              deadline,
            )
          : [];
        return { assembledAt: new Date().toISOString(), core, enrichment };
      },
      deadline,
      observe,
    );
    const final = selectScheduleWindow(calendar, Date.now(), explicit);
    if (
      final.window?.startDate !== w.startDate ||
      final.window?.year !== w.year ||
      final.window?.week !== w.week ||
      final.window?.seasonType !== w.seasonType
    )
      continue;
    return finish({
      assembledAt: slate.assembledAt,
      ...final,
      filters,
      games: slate.core
        .filter(
          (x) =>
            x.classifications.includes(classification) &&
            (!filters.conference || x.conferences.includes(filters.conference)),
        )
        .map((x) => {
          const enrichment = slate.enrichment.find((e) => e.id === x.game.id);
          if (!enrichment) throw new PreviewDataError();
          return {
            ...x.game,
            broadcasts: enrichment.broadcasts,
            odds: enrichment.odds,
          };
        }),
    });
  }
  throw new PreviewDataError('source_error');
};
