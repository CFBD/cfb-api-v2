import { PlayerPassingGame, TeamPassingGame } from '../passing/types';
import { StoredPassingProduction, StoredTeamPassing } from './cpoe';
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
interface Payload<TeamPassing, PlayerPassing> {
  teams: LegacyWire<
    Omit<AdvancedBoxScore['teams'], 'passing' | 'rushingAdvanced'>
  > &
    Pick<AdvancedBoxScore['teams'], 'rushingAdvanced'> & {
      passing: TeamPassing[];
    };
  players: {
    usage: LegacyPlayer<PlayerGameUsage>[];
    ppa: LegacyPlayer<PlayerPPA>[];
    passing: PlayerPassing[];
  } & Pick<AdvancedBoxScore['players'], 'rushing'>;
}
/** Response shape; stored CPOE is projected through the selected model. */
export type BoxScorePayload = Payload<TeamPassingGame, PlayerPassingGame>;
export type SnapshotPayload = Payload<
  StoredTeamPassing<TeamPassingGame>,
  StoredPassingProduction<PlayerPassingGame>
>;
export interface BoxScoreWire extends BoxScorePayload {
  gameInfo: LegacyWire<AdvancedBoxScore['gameInfo']>;
}
export const finite = (value: number): number | null =>
  Number.isFinite(value) ? value : null;
export const legacyFloat = (value: string | number | null): number | null =>
  finite(Number.parseFloat(String(value)));

export class UnsupportedBoxScoreError extends Error {}
