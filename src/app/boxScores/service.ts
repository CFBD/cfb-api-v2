import { kdb } from '../../config/database';
import { calculatePayload } from './calculator';
import { isSnapshotPayload } from './payload';
import {
  canonicalQuery,
  isSnapshotStorageError,
  mapGameInfo,
  snapshotQuery,
} from './snapshot';
import { BoxScoreWire } from './wire';

export const getAdvancedBoxScore = async (
  id: number,
): Promise<BoxScoreWire> => {
  const started = Date.now();
  let reason = 'missing';
  try {
    const rows = await snapshotQuery(kdb, id).execute();
    const gameInfo = mapGameInfo(rows);
    const row = rows[0];
    if (row.formatVersion === 1 && isSnapshotPayload(row.payload)) {
      console.log('Advanced box score', {
        gameId: id,
        source: 'snapshot',
        durationMs: Date.now() - started,
      });
      return {
        gameInfo,
        teams: row.payload.teams,
        players: row.payload.players,
      };
    }
    reason =
      row.formatVersion === null
        ? 'missing'
        : row.formatVersion !== 1
          ? 'unsupported'
          : 'invalid';
    if (reason === 'invalid')
      console.error('Invalid box score snapshot', { gameId: id });
  } catch (error) {
    if (!isSnapshotStorageError(error)) throw error;
    reason = 'storage';
    console.error('Box score snapshot storage unavailable', { gameId: id });
  }
  const result = await kdb
    .transaction()
    .setIsolationLevel('repeatable read')
    .setAccessMode('read only')
    .execute(async (db) => {
      const gameInfo = mapGameInfo(await canonicalQuery(db, id).execute());
      const payload = await calculatePayload(db, id);
      return { gameInfo, teams: payload.teams, players: payload.players };
    });
  console.log('Advanced box score', {
    gameId: id,
    source: 'calculated',
    reason,
    durationMs: Date.now() - started,
  });
  return result;
};
