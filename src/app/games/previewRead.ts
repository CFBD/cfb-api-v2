import { CamelCasePlugin, Kysely } from 'kysely';
import { ValidateError } from 'tsoa';
import { kdb } from '../../config/database';
import { DB } from '../../config/types/db';
import {
  PreviewSection,
  GamePreview,
  AdjustedGamePreview,
  GameSchedule,
} from './previewTypes';

export class PreviewDataError extends Error {
  constructor(
    public readonly reason: 'invalid_data' | 'source_error' = 'invalid_data',
  ) {
    super(reason);
  }
}
export class PreviewNotFound extends Error {}
export const checkDeadline = (deadline: number): void => {
  if (Date.now() >= deadline) throw new PreviewDataError('source_error');
};

// Keep the transaction (and refresh slot) alive until PostgreSQL settles.
export const previewRead = async <T>(
  deadline: number,
  read: (db: Kysely<DB>) => Promise<T>,
  db: Kysely<DB> = kdb,
): Promise<T> => {
  checkDeadline(deadline);
  return db.transaction().execute(async (trx) => {
    checkDeadline(deadline);
    await trx
      .selectNoFrom((eb) =>
        eb
          .fn<string>('set_config', [
            eb.val('statement_timeout'),
            eb.val(String(Math.max(1, Math.min(3000, deadline - Date.now())))),
            eb.val(true),
          ])
          .as('timeout'),
      )
      .execute();
    checkDeadline(deadline);
    return read(
      trx
        .withoutPlugins()
        .withPlugin(new CamelCasePlugin({ maintainNestedObjectKeys: true })),
    );
  });
};
export const recognizedSourceError = (error: unknown): boolean =>
  error instanceof PreviewDataError ||
  (error instanceof Error &&
    'code' in error &&
    [
      '57014',
      '42P01',
      '42501',
      '42703',
      '53300',
      '57P01',
      '08006',
      'ECONNREFUSED',
      'ETIMEDOUT',
    ].includes(String(error.code)));

export function section(
  data: null,
  reason?: PreviewSection<never>['reason'],
  sourceUpdatedAt?: string | null,
): PreviewSection<never>;
export function section<T>(
  data: T | null,
  reason?: PreviewSection<T>['reason'],
  sourceUpdatedAt?: string | null,
): PreviewSection<T>;
export function section<T>(
  data: T | null,
  reason: PreviewSection<T>['reason'] = null,
  sourceUpdatedAt: string | null = null,
): PreviewSection<T> {
  return {
    status:
      reason === 'source_error' || reason === 'invalid_data'
        ? 'unavailable'
        : reason
          ? 'no_data'
          : 'available',
    reason,
    assembledAt: new Date().toISOString(),
    sourceUpdatedAt,
    data,
  };
}
export const optionalRead = async <T>(
  read: () => Promise<T>,
): Promise<PreviewSection<T>> => {
  try {
    return section(await read());
  } catch (error) {
    const reason =
      error instanceof PreviewDataError ? error.reason : 'source_error';
    console.warn('Game preview source unavailable', { reason });
    return section<T>(null, reason);
  }
};
export function invalidParameter(key: string, message: string): never {
  throw new ValidateError({ [key]: { message } }, 'Validation error');
}
export const validatePreviewQuery = (
  query: Record<string, unknown>,
  allowed: string[] = [],
): void => {
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.includes(key) || typeof value !== 'string' || !value.trim())
      invalidParameter(key, 'Unsupported or non-scalar query parameter');
  }
};
export const validatePreviewInteger = (
  value: number,
  name: string,
  minimum = 1,
): void => {
  if (!Number.isSafeInteger(value) || value < minimum)
    invalidParameter(name, `${name} must be a safe integer >= ${minimum}`);
};
// Cast timestamp-without-zone to text in SQL, then interpret its wall clock as UTC.
export const storedUtc = (value: string | null): string | null => {
  if (
    value === null ||
    !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
  )
    return null;
  const date = new Date(value.replace(' ', 'T') + 'Z');
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
export const utcBinding = (value: string): string =>
  value.replace('T', ' ').replace(/Z$/, '');
export const finiteNumber = (value: string | number | null): number | null => {
  if (value === null) return null;
  const parsed =
    typeof value === 'string' && !value.trim() ? NaN : Number(value);
  if (!Number.isFinite(parsed)) throw new PreviewDataError();
  return parsed;
};

export const logPreviewResponse = (
  operation: string,
  result: GamePreview | AdjustedGamePreview | GameSchedule,
  started: number,
  cache: string[],
): void => {
  const statuses: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  const sourceSeasons = new Set<number>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (
      'status' in value &&
      typeof value.status === 'string' &&
      ['available', 'no_data', 'unavailable'].includes(value.status)
    )
      statuses[value.status] = (statuses[value.status] ?? 0) + 1;
    if (
      'isPreviousSeason' in value &&
      'season' in value &&
      typeof value.season === 'number'
    )
      sourceSeasons.add(value.season);
    if ('reason' in value && typeof value.reason === 'string')
      reasons[value.reason] = (reasons[value.reason] ?? 0) + 1;
    for (const child of Object.values(value)) visit(child);
  };
  visit(result);
  console.info('Game preview response', {
    operation,
    elapsedMs: Date.now() - started,
    statuses,
    reasons,
    targetSeason: 'game' in result ? result.game.season : result.window?.year,
    sourceSeasons: [...sourceSeasons],
    cache,
    bytes: Buffer.byteLength(JSON.stringify(result)),
  });
};
