import { Kysely } from 'kysely';
import { DB } from '../../config/types/db';
import {
  getPlayerPassingForGame,
  getTeamPassingForGame,
} from '../passing/service';
import {
  getPlayerRushingForGame,
  getTeamRushingForGame,
} from '../rushing/service';
import {
  fieldPositionQuery,
  playerQuery,
  scoringQuery,
  teamQuery,
} from './queries';
import {
  finite,
  legacyFloat,
  SnapshotPayload,
  UnsupportedBoxScoreError,
} from './wire';

const otherTeam = (teams: string[], team: string): string => {
  const other = teams.find((candidate) => candidate !== team);
  if (!other) throw new Error('Missing legacy opponent');
  return other;
};

export const calculatePayload = async (
  db: Kysely<DB>,
  id: number,
): Promise<SnapshotPayload> => {
  const teamResults = await teamQuery(db, id).execute();
  if (
    !teamResults.some((t) => t.homeAway === 'home') ||
    new Set(teamResults.map((t) => t.team)).size < 2
  )
    throw new UnsupportedBoxScoreError('Unsupported legacy box score');
  const scoringOppResults = await scoringQuery(db, id).execute();
  const fieldPositionResults = await fieldPositionQuery(db, id).execute();
  const playerResults = await playerQuery(db, id).execute();
  const teamPassing = await getTeamPassingForGame(db, id);
  const playerPassing = await getPlayerPassingForGame(db, id);
  const teamRushing = await getTeamRushingForGame(db, id);
  const playerRushing = await getPlayerRushingForGame(db, id);
  const teams = Array.from(new Set(teamResults.map((t) => t.team)));
  return {
    teams: {
      passing: teamPassing,
      rushingAdvanced: teamRushing,
      ppa: teamResults.map((t) => ({
        team: t.team,
        plays: Number(t.plays),
        overall: {
          total: legacyFloat(t.ppa),
          quarter1: t.ppa1 ? legacyFloat(t.ppa1) : null,
          quarter2: t.ppa2 ? legacyFloat(t.ppa2) : null,
          quarter3: t.ppa3 ? legacyFloat(t.ppa3) : null,
          quarter4: t.ppa4 ? legacyFloat(t.ppa4) : null,
        },
        passing: {
          total: legacyFloat(t.passingPpa),
          quarter1: t.passingPpa1 ? legacyFloat(t.passingPpa1) : null,
          quarter2: t.passingPpa2 ? legacyFloat(t.passingPpa2) : null,
          quarter3: t.passingPpa3 ? legacyFloat(t.passingPpa3) : null,
          quarter4: t.passingPpa4 ? legacyFloat(t.passingPpa4) : null,
        },
        rushing: {
          total: legacyFloat(t.rushingPpa),
          quarter1: t.rushingPpa1 ? legacyFloat(t.rushingPpa1) : null,
          quarter2: t.rushingPpa2 ? legacyFloat(t.rushingPpa2) : null,
          quarter3: t.rushingPpa3 ? legacyFloat(t.rushingPpa3) : null,
          quarter4: t.rushingPpa4 ? legacyFloat(t.rushingPpa4) : null,
        },
      })),
      cumulativePpa: teamResults.map((t) => ({
        team: t.team,
        plays: Number(t.plays),
        overall: {
          total: legacyFloat(t.cumPpa),
          quarter1: t.cumPpa1 ? legacyFloat(t.cumPpa1) : null,
          quarter2: t.cumPpa2 ? legacyFloat(t.cumPpa2) : null,
          quarter3: t.cumPpa3 ? legacyFloat(t.cumPpa3) : null,
          quarter4: t.cumPpa4 ? legacyFloat(t.cumPpa4) : null,
        },
        passing: {
          total: legacyFloat(t.cumPassingPpa),
          quarter1: t.cumPassingPpa1 ? legacyFloat(t.cumPassingPpa1) : null,
          quarter2: t.cumPassingPpa2 ? legacyFloat(t.cumPassingPpa2) : null,
          quarter3: t.cumPassingPpa3 ? legacyFloat(t.cumPassingPpa3) : null,
          quarter4: t.cumPassingPpa4 ? legacyFloat(t.cumPassingPpa4) : null,
        },
        rushing: {
          total: legacyFloat(t.cumRushingPpa),
          quarter1: t.cumRushingPpa1 ? legacyFloat(t.cumRushingPpa1) : null,
          quarter2: t.cumRushingPpa2 ? legacyFloat(t.cumRushingPpa2) : null,
          quarter3: t.cumRushingPpa3 ? legacyFloat(t.cumRushingPpa3) : null,
          quarter4: t.cumRushingPpa4 ? legacyFloat(t.cumRushingPpa4) : null,
        },
      })),
      successRates: teamResults.map((t) => ({
        team: t.team,
        overall: {
          total: legacyFloat(t.successRate),
          quarter1: t.successRate1 ? legacyFloat(t.successRate1) : null,
          quarter2: t.successRate2 ? legacyFloat(t.successRate2) : null,
          quarter3: t.successRate3 ? legacyFloat(t.successRate3) : null,
          quarter4: t.successRate4 ? legacyFloat(t.successRate4) : null,
        },
        standardDowns: {
          total: legacyFloat(t.standardSuccessRate),
          quarter1: t.standardSuccessRate1
            ? legacyFloat(t.standardSuccessRate1)
            : null,
          quarter2: t.standardSuccessRate2
            ? legacyFloat(t.standardSuccessRate2)
            : null,
          quarter3: t.standardSuccessRate3
            ? legacyFloat(t.standardSuccessRate3)
            : null,
          quarter4: t.standardSuccessRate4
            ? legacyFloat(t.standardSuccessRate4)
            : null,
        },
        passingDowns: {
          total: legacyFloat(t.passingSuccessRate),
          quarter1: t.passingSuccessRate1
            ? legacyFloat(t.passingSuccessRate1)
            : null,
          quarter2: t.passingSuccessRate2
            ? legacyFloat(t.passingSuccessRate2)
            : null,
          quarter3: t.passingSuccessRate3
            ? legacyFloat(t.passingSuccessRate3)
            : null,
          quarter4: t.passingSuccessRate4
            ? legacyFloat(t.passingSuccessRate4)
            : null,
        },
      })),
      explosiveness: teamResults.map((t) => ({
        team: t.team,
        overall: {
          total: legacyFloat(t.explosiveness),
          quarter1: t.explosiveness1 ? legacyFloat(t.explosiveness1) : null,
          quarter2: t.explosiveness2 ? legacyFloat(t.explosiveness2) : null,
          quarter3: t.explosiveness3 ? legacyFloat(t.explosiveness3) : null,
          quarter4: t.explosiveness4 ? legacyFloat(t.explosiveness4) : null,
        },
      })),
      rushing: teamResults.map((t) => ({
        team: t.team,
        powerSuccess: Number(t.powerSuccess),
        stuffRate: Number(t.stuffRate),
        lineYards: Number(t.lineYards),
        lineYardsAverage: Number(t.lineYardsAvg),
        secondLevelYards: Number(t.secondLevelYards),
        secondLevelYardsAverage: Number(t.secondLevelYardsAvg),
        openFieldYards: Number(t.openFieldYards),
        openFieldYardsAverage: Number(t.openFieldYardsAvg),
      })),
      havoc: teamResults.map((t) => ({
        team: otherTeam(teams, t.team),
        total: Number(t.totalHavoc),
        frontSeven: Number(t.frontSevenHavoc),
        db: Number(t.dbHavoc),
      })),
      scoringOpportunities: teamResults.map((t) => {
        const scoring = scoringOppResults.find(
          (o) => t.team == o.team && o.unit == 'offense',
        );

        return {
          team: t.team,
          opportunities: scoring ? Number(scoring.opportunities) : 0,
          points: scoring ? Number(scoring.points) : 0,
          pointsPerOpportunity: scoring ? legacyFloat(scoring.avgPoints) : 0,
        };
      }),
      fieldPosition: teamResults.map((t) => {
        const fieldPosition = fieldPositionResults.find(
          (o) => t.team == o.school,
        );

        if (!fieldPosition) throw new Error('Missing legacy field position');
        return {
          team: t.team,
          averageStart: Number(fieldPosition.avgStartOff),
          averageStartingPredictedPoints: Number(
            fieldPosition.avgPredictedPointsOff,
          ),
        };
      }),
    },
    players: {
      passing: playerPassing,
      rushing: playerRushing,
      usage: playerResults.map((p) => ({
        player: p.name,
        team: p.school,
        position: p.position,
        total: p.plays
          ? finite(
              Math.round((Number(p.plays) * 1000) / Number(p.teamPlays)) / 1000,
            )
          : 0,
        quarter1: p.plays1
          ? finite(
              Math.round((Number(p.plays1) * 1000) / Number(p.teamPlays1)) /
                1000,
            )
          : null,
        quarter2: p.plays2
          ? finite(
              Math.round((Number(p.plays2) * 1000) / Number(p.teamPlays2)) /
                1000,
            )
          : null,
        quarter3: p.plays3
          ? finite(
              Math.round((Number(p.plays3) * 1000) / Number(p.teamPlays3)) /
                1000,
            )
          : null,
        quarter4: p.plays4
          ? finite(
              Math.round((Number(p.plays4) * 1000) / Number(p.teamPlays4)) /
                1000,
            )
          : null,
        rushing: p.rushPlays
          ? finite(
              Math.round(
                (Number(p.rushPlays) * 1000) / Number(p.teamRushPlays),
              ) / 1000,
            )
          : 0,
        passing: p.passPlays
          ? finite(
              Math.round(
                (Number(p.passPlays) * 1000) / Number(p.teamPassPlays),
              ) / 1000,
            )
          : 0,
      })),
      ppa: playerResults.map((p) => ({
        player: p.name,
        team: p.school,
        position: p.position,
        average: {
          total: p.totalPpa
            ? finite(
                Math.round((Number(p.totalPpa) * 1000) / Number(p.plays)) /
                  1000,
              )
            : 0,
          quarter1: p.totalPpa1
            ? finite(
                Math.round((Number(p.totalPpa1) * 1000) / Number(p.plays1)) /
                  1000,
              )
            : null,
          quarter2: p.totalPpa2
            ? finite(
                Math.round((Number(p.totalPpa2) * 1000) / Number(p.plays2)) /
                  1000,
              )
            : null,
          quarter3: p.totalPpa3
            ? finite(
                Math.round((Number(p.totalPpa3) * 1000) / Number(p.plays3)) /
                  1000,
              )
            : null,
          quarter4: p.totalPpa4
            ? finite(
                Math.round((Number(p.totalPpa4) * 1000) / Number(p.plays4)) /
                  1000,
              )
            : null,
          rushing: p.rushPpa
            ? finite(
                Math.round((Number(p.rushPpa) * 1000) / Number(p.rushPlays)) /
                  1000,
              )
            : 0,
          passing: p.passPpa
            ? finite(
                Math.round((Number(p.passPpa) * 1000) / Number(p.passPlays)) /
                  1000,
              )
            : 0,
        },
        cumulative: {
          total: finite(Math.round(Number(p.totalPpa) * 10) / 10),
          quarter1: finite(Math.round(Number(p.totalPpa1) * 10) / 10),
          quarter2: finite(Math.round(Number(p.totalPpa2) * 10) / 10),
          quarter3: finite(Math.round(Number(p.totalPpa3) * 10) / 10),
          quarter4: finite(Math.round(Number(p.totalPpa4) * 10) / 10),
          rushing: finite(Math.round(Number(p.rushPpa) * 10) / 10),
          passing: finite(Math.round(Number(p.passPpa) * 10) / 10),
        },
      })),
    },
  };
};
