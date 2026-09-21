import { AdvancedBoxScore, PlayerGameUsage, PlayerPPA } from './types';

// Legacy non-finite numbers serialize to null. Keep public declarations intact.
type LegacyWire<T> = T extends number
  ? number | null
  : T extends boolean
    ? boolean | null
    : T extends Array<infer Row>
      ? LegacyWire<Row>[]
      : T extends object
        ? { [K in keyof T]: LegacyWire<T[K]> }
        : T;
type LegacyPlayer<T> = LegacyWire<Omit<T, 'player' | 'team' | 'position'>> & {
  player: string | null;
  team: string | null;
  position: string | null;
};
export interface SnapshotPayload {
  teams: LegacyWire<
    Omit<AdvancedBoxScore['teams'], 'passing' | 'rushingAdvanced'>
  > &
    Pick<AdvancedBoxScore['teams'], 'passing' | 'rushingAdvanced'>;
  players: {
    usage: LegacyPlayer<PlayerGameUsage>[];
    ppa: LegacyPlayer<PlayerPPA>[];
  } & Pick<AdvancedBoxScore['players'], 'passing' | 'rushing'>;
}
export interface BoxScoreWire extends SnapshotPayload {
  gameInfo: LegacyWire<AdvancedBoxScore['gameInfo']>;
}
export const finite = (value: number): number | null =>
  Number.isFinite(value) ? value : null;
export const legacyFloat = (value: string | number | null): number | null =>
  finite(Number.parseFloat(String(value)));

export class UnsupportedBoxScoreError extends Error {}
