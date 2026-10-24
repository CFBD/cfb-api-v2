import type { Selectable } from 'kysely';

import type { DB } from '../../config/types/db';
import { mapCpoeProduction } from '../boxScores/cpoe';
import type { CpoeProduction } from './types';

type Game = Selectable<DB['game']>;
type Team = Selectable<DB['team']>;
export interface TeamSeasonParticipant {
  gameId: Game['id'];
  season: Game['season'];
  id: Team['id'];
  school: Team['school'];
  conference: Selectable<DB['conference']>['abbreviation'];
}
export type CurrentTeamSeasonPrediction = Pick<
  Selectable<DB['passPlayCpoeCurrent']>,
  'gameId' | 'playId' | 'completionProbability' | 'modelVersion'
> &
  Pick<Selectable<DB['play']>, 'offenseId' | 'defenseId'> &
  Pick<Selectable<DB['passPlay']>, 'outcome'>;

type Side = 'offense' | 'defense';
export const teamSeasonKey = (
  season: number,
  school: string,
  conference: string | null,
): string => JSON.stringify([season, school, conference]);

/** Inputs must share a snapshot; predictions must come from the current view. */
export const aggregateTeamSeasonCpoe = (
  participants: readonly TeamSeasonParticipant[],
  predictions: readonly CurrentTeamSeasonPrediction[],
): Map<string, Record<Side, CpoeProduction>> => {
  const byGame = new Map<number, TeamSeasonParticipant[]>();
  for (const participant of participants) {
    const gameTeams = byGame.get(participant.gameId) ?? [];
    gameTeams.push(participant);
    byGame.set(participant.gameId, gameTeams);
  }
  interface ScoredProduction {
    cpoeAttemptsAvailable: number;
    cpoeCompletions: number;
    expectedCompletions: number | null;
    versions: Set<string>;
  }
  const byTeam = new Map<string, Partial<Record<Side, ScoredProduction>>>();
  for (const prediction of predictions) {
    if (prediction.gameId == null || prediction.playId == null) continue;
    for (const participant of byGame.get(prediction.gameId) ?? []) {
      const teamKey = teamSeasonKey(
        participant.season,
        participant.school,
        participant.conference,
      );
      const teamScores = byTeam.get(teamKey) ?? {};
      for (const side of ['offense', 'defense'] as const) {
        if (
          participant.id !==
          prediction[side === 'offense' ? 'offenseId' : 'defenseId']
        )
          continue;
        const scored = teamScores[side] ?? {
          cpoeAttemptsAvailable: 0,
          cpoeCompletions: 0,
          expectedCompletions: null,
          versions: new Set<string>(),
        };
        scored.cpoeAttemptsAvailable++;
        if (prediction.outcome === 'completion') scored.cpoeCompletions++;
        if (prediction.completionProbability != null)
          scored.expectedCompletions =
            (scored.expectedCompletions ?? 0) +
            Number(prediction.completionProbability);
        if (prediction.modelVersion != null)
          scored.versions.add(prediction.modelVersion);
        teamScores[side] = scored;
      }
      byTeam.set(teamKey, teamScores);
    }
  }
  const result = new Map<string, Record<Side, CpoeProduction>>();
  for (const [key, value] of byTeam) {
    const map = (side: Side): CpoeProduction => {
      const scored = value[side];
      return mapCpoeProduction(
        scored
          ? {
              cpoeAttemptsAvailable: scored.cpoeAttemptsAvailable,
              cpoeCompletions: scored.cpoeCompletions,
              expectedCompletions: scored.expectedCompletions,
              cpoeVersions: scored.versions.size,
              cpoeModelVersion: scored.versions.values().next().value ?? null,
            }
          : {},
      );
    };
    result.set(key, { offense: map('offense'), defense: map('defense') });
  }
  return result;
};
