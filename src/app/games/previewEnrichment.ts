import { MediaType } from '../enums';
import { PreviewBroadcast, PreviewSection, SelectedOdds } from './previewTypes';
import {
  finiteNumber,
  optionalRead,
  previewRead,
  section,
  PreviewDataError,
} from './previewRead';

export const readPreviewEnrichment = async (
  ids: number[],
  deadline: number,
) => {
  const [media, lines] = await Promise.all([
    optionalRead(() =>
      previewRead(deadline, (db) =>
        db
          .selectFrom('gameMedia')
          .where('gameId', 'in', ids)
          .select(['gameId', 'mediaType', 'name'])
          .execute(),
      ),
    ),
    optionalRead(() =>
      previewRead(deadline, (db) =>
        db
          .selectFrom('gameLines as l')
          .leftJoin('linesProvider as p', 'p.id', 'l.linesProviderId')
          .where('l.gameId', 'in', ids)
          .where('l.linesProviderId', 'in', [888888, 999999])
          .select([
            'l.gameId',
            'l.linesProviderId',
            'p.name',
            'l.spread',
            'l.overUnder',
            'l.moneylineHome',
            'l.moneylineAway',
          ])
          .execute(),
      ),
    ),
  ]);
  return ids.map((id) => {
    let broadcasts: PreviewSection<PreviewBroadcast[]>;
    let odds: PreviewSection<SelectedOdds>;
    if (media.data === null) broadcasts = section(null, media.reason);
    else {
      const rows = media.data.filter((r) => r.gameId === id);
      const data: PreviewBroadcast[] = [];
      let invalid = false;
      for (const row of rows) {
        const mediaType = Object.values(MediaType).find(
          (v) => v === row.mediaType,
        );
        if (!row.name?.trim() || !mediaType) {
          invalid = true;
          break;
        }
        if (
          !data.some((x) => x.mediaType === mediaType && x.outlet === row.name)
        )
          data.push({ mediaType, outlet: row.name });
      }
      data.sort(
        (a, b) =>
          compare(a.mediaType, b.mediaType) || compare(a.outlet, b.outlet),
      );
      broadcasts = invalid
        ? section(null, 'invalid_data')
        : section(data, data.length ? null : 'no_data');
    }
    if (lines.data === null) odds = section(null, lines.reason);
    else {
      try {
        let selected: SelectedOdds | null = null;
        for (const providerId of [888888, 999999]) {
          const rows = lines.data.filter(
            (r) => r.gameId === id && r.linesProviderId === providerId,
          );
          if (rows.length > 1) throw new PreviewDataError();
          const row = rows[0];
          if (!row) continue;
          const provider = providerId === 888888 ? 'DraftKings' : 'Bovada';
          if (row.name !== provider) throw new PreviewDataError();
          const markets = {
            spread: finiteNumber(row.spread),
            overUnder: finiteNumber(row.overUnder),
            homeMoneyline: finiteNumber(row.moneylineHome),
            awayMoneyline: finiteNumber(row.moneylineAway),
          };
          if (Object.values(markets).some((v) => v !== null)) {
            selected = { providerId, provider, ...markets };
            break;
          }
        }
        odds = section(selected, selected ? null : 'no_data');
      } catch {
        odds = section(null, 'invalid_data');
      }
    }
    return { id, broadcasts, odds };
  });
};
export const compare = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
