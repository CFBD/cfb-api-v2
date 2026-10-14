import { SnapshotPassingProduction } from '../passing/types';
import { currentSnapshotCpoe } from './cpoe';
import { SnapshotPayload } from './wire';

export const currentTeamPassingCpoe = <
  T extends {
    offense: SnapshotPassingProduction;
    defense: SnapshotPassingProduction;
  },
>(
  row: T,
  version: string | null | undefined,
): T => ({
  ...row,
  offense: currentSnapshotCpoe(row.offense, version),
  defense: currentSnapshotCpoe(row.defense, version),
});

export const currentBoxScoreCpoe = (
  payload: SnapshotPayload,
  version: string | null | undefined,
): SnapshotPayload => ({
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
