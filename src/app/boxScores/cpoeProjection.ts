import { PassingProduction } from '../passing/types';
import { currentSnapshotCpoe, StoredPassingProduction } from './cpoe';
import { BoxScorePayload, SnapshotPayload } from './wire';

export const currentTeamPassingCpoe = <
  T extends {
    offense: StoredPassingProduction;
    defense: StoredPassingProduction;
  },
>(
  row: T,
  version: string | null | undefined,
): Omit<T, 'offense' | 'defense'> & {
  offense: PassingProduction;
  defense: PassingProduction;
} => ({
  ...row,
  offense: currentSnapshotCpoe(row.offense, version),
  defense: currentSnapshotCpoe(row.defense, version),
});

export const currentBoxScoreCpoe = (
  payload: SnapshotPayload,
  version: string | null | undefined,
): BoxScorePayload => ({
  teams: {
    ...payload.teams,
    passing: payload.teams.passing.map((row) =>
      currentTeamPassingCpoe(row, version),
    ),
  },
  players: {
    ...payload.players,
    passing: payload.players.passing.map((row) =>
      currentSnapshotCpoe(row, version),
    ),
  },
});
