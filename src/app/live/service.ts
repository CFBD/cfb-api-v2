import axios from 'axios';
import { kdb } from '../../config/database';
import {
  LiveGame,
  GamePackagePlay,
  PlayByPlayGameResponse,
  LiveGameDrive,
  LiveGamePlay,
  LiveGameTeam,
} from './types';
import { UserMessageError } from '../../globals';

const PLAYS_URL: string = process.env.PLAYS_URL || '';

const epaTypes = [
  3, 4, 6, 7, 24, 26, 36, 51, 67, 5, 9, 29, 39, 68, 18, 38, 40, 41, 59, 60,
];
const passTypes = [3, 4, 6, 7, 24, 26, 36, 37, 38, 39, 51, 67];
const rushTypes = [5, 9, 29, 39, 68];
const unsuccessfulTypes = [20, 26, 34, 36, 37, 38, 39, 63];
let ppas:
  | { yardLine: number; distance: number; down: number; ppa: number }[]
  | null = null;

const loadPpas = async () => {
  ppas = await kdb
    .selectFrom('ppa')
    .select(['yardLine', 'down', 'distance'])
    .select((eb) =>
      eb.fn<number>('round', ['predictedPoints', eb.lit(3)]).as('ppa'),
    )
    .execute();
};

const getPlaySuccess = (play: GamePackagePlay): boolean => {
  const typeId = parseInt(play.type.id);
  return (
    !unsuccessfulTypes.includes(typeId) &&
    (play.scoringPlay ||
      (play.start.down == 1 && play.statYardage >= play.start.distance / 2) ||
      (play.start.down == 2 && play.statYardage >= play.start.distance * 0.7) ||
      (play.start.down > 2 && play.statYardage >= play.start.distance))
  );
};

const getPlayType = (play: GamePackagePlay): 'pass' | 'rush' | 'other' => {
  const typeId = parseInt(play.type.id);
  if (passTypes.includes(typeId)) {
    return 'pass';
  }

  if (rushTypes.includes(typeId)) {
    return 'rush';
  }

  return 'other';
};

const getDownType = (play: GamePackagePlay): 'passing' | 'standard' => {
  return (play.start.down == 2 && play.start.distance >= 7) ||
    (play.start.down > 2 && play.start.distance >= 5)
    ? 'passing'
    : 'standard';
};

const getGarbageTime = (play: GamePackagePlay): boolean => {
  let score = Math.abs(play.homeScore - play.awayScore);

  if (play.scoringPlay && play.scoringType?.abbreviation == 'TD') {
    score -= 7;
  } else if (play.scoringPlay && play.scoringType?.abbreviation == 'FG') {
    score -= 3;
  }

  return (
    (play.period.number == 2 && score <= 38) ||
    (play.period.number == 3 && score <= 28) ||
    (play.period.number == 4 && score <= 22)
  );
};

export const getLivePlays = async (gameId: number): Promise<LiveGame> => {
  if (!ppas) {
    await loadPpas();
  }

  const response = await axios.get<PlayByPlayGameResponse>(PLAYS_URL, {
    params: {
      gameId,
      xhr: 1,
      render: false,
    },
  });

  const comp = response.data.gamepackageJSON.header.competitions[0];
  const teams = comp.competitors;

  if (!response.data.gamepackageJSON?.drives?.previous?.length) {
    throw new UserMessageError('No plays found for game.');
  }

  const driveData = response.data.gamepackageJSON.drives.previous.filter(
    (p) => p.team,
  );

  const drives: LiveGameDrive[] = [];
  const plays: LiveGamePlay[] = [];

  if (
    response.data.gamepackageJSON.drives.current &&
    !driveData.find(
      (d) => d.id === response.data.gamepackageJSON.drives.current.id,
    )
  ) {
    driveData.push(response.data.gamepackageJSON.drives.current);
  }

  for (const drive of driveData) {
    const offense = teams.find(
      (t) => t.team.displayName === drive.team.displayName,
    );
    const defense = teams.find(
      (t) => t.team.displayName !== offense?.team.displayName,
    );

    let d: LiveGameDrive = {
      id: drive.id,
      offenseId: Number(offense?.team.id),
      offense: offense?.team.location ?? '',
      defenseId: Number(defense?.team.id),
      defense: defense?.team.location ?? '',
      playCount: drive.offensivePlays,
      yards: drive.yards,
      startPeriod: drive.start.period.number,
      startClock: drive.start.clock?.displayValue ?? null,
      startYardsToGoal:
        offense?.homeAway === 'home'
          ? 100 - drive.start.yardLine
          : drive.start.yardLine,
      endPeriod: drive.end?.period.number ?? null,
      endClock: drive.end?.clock?.displayValue ?? null,
      endYardsToGoal: drive.end
        ? offense?.homeAway === 'home'
          ? 100 - drive.end.yardLine
          : drive.end.yardLine
        : null,
      duration: drive.timeElapsed?.displayValue ?? null,
      scoringOpportunity: false,
      plays: [],
      result: drive.displayResult,
      pointsGained: 0,
    };

    for (const play of drive.plays) {
      const playTeam =
        play.start.team.id === offense?.team.id ? offense.team : defense?.team;
      let epa = null;
      if (epaTypes.includes(Number(play.type.id))) {
        const startingEP = ppas?.find(
          (ppa) =>
            ppa.down == play.start.down &&
            ppa.distance == play.start.distance &&
            ppa.yardLine == play.start.yardsToEndzone,
        );
        let endingEP = null;

        if (play.scoringPlay) {
          if (play.scoringType?.abbreviation == 'TD') {
            endingEP =
              play.end.team.id === offense?.team.id ? { ppa: 6 } : { ppa: -6 };
          } else if (play.scoringType?.abbreviation == 'FG') {
            endingEP = { ppa: 3 };
          }
        } else {
          endingEP = ppas?.find(
            (ppa) =>
              ppa.down == play.end.down &&
              ppa.distance == play.end.distance &&
              ppa.yardLine == play.end.yardsToEndzone,
          );
        }

        if (startingEP && endingEP) {
          epa = Math.round((endingEP.ppa - startingEP.ppa) * 1000) / 1000;
        }
      }

      if (play.end.yardsToEndzone <= 40) {
        d.scoringOpportunity = true;
      }

      let p: LiveGamePlay = {
        id: play.id,
        homeScore: play.homeScore,
        awayScore: play.awayScore,
        period: play.period.number,
        clock: play.clock?.displayValue ?? null,
        wallClock: play.wallclock,
        teamId: Number(playTeam?.id),
        team: playTeam?.location ?? '',
        down: play.start.down,
        distance: play.start.distance,
        yardsToGoal: play.start.yardsToEndzone,
        yardsGained: play.statYardage,
        playTypeId: Number(play.type.id),
        playType: play.type.text,
        epa,
        garbageTime: getGarbageTime(play),
        success: getPlaySuccess(play),
        rushPash: getPlayType(play),
        downType: getDownType(play),
        playText: play.text,
      };

      d.plays.push(p);
      plays.push(p);
    }

    const first = d.plays[0];
    const last = d.plays[d.plays.length - 1];
    let scoreDiff =
      last.homeScore - last.awayScore - (first.homeScore - first.awayScore);

    if (offense?.homeAway === 'away') {
      scoreDiff *= -1;
    }

    d.pointsGained = scoreDiff;
    drives.push(d);
  }

  const teamStats = teams.map((t): LiveGameTeam => {
    const teamDrives = drives.filter((d) => d.offenseId === Number(t.team.id));
    const scoringOpps = teamDrives.filter((d) => d.scoringOpportunity);
    const teamPlays = plays.filter((p) => p.teamId === Number(t.team.id));
    const epaPlays = plays.filter((p) => p.epa !== null);
    const rushingPlays = teamPlays.filter((p) => p.rushPash === 'rush');
    const passingPlays = teamPlays.filter((p) => p.rushPash === 'pass');
    const standardDowns = teamPlays.filter((p) => p.downType === 'standard');
    const passingDowns = teamPlays.filter((p) => p.downType === 'passing');
    const successfulPlays = teamPlays.filter((p) => p.success);

    const lineYards = rushingPlays
      .map((r) => {
        if (r.yardsGained < 0) {
          return -1.2 * r.yardsGained;
        } else if (r.yardsGained <= 4) {
          return r.yardsGained;
        } else if (r.yardsGained <= 10) {
          return 4 + (r.yardsGained - 4) * 0.5;
        } else {
          return 7;
        }
      })
      .reduce((p, v) => p + v, 0);

    const secondLevelYards = rushingPlays
      .map((r) => {
        if (r.yardsGained <= 5) {
          return 0;
        } else if (r.yardsGained < 10) {
          return r.yardsGained - 5;
        } else {
          return 5;
        }
      })
      .reduce((p, v) => p + v, 0);

    const openFieldYards = rushingPlays
      .map((r) => {
        if (r.yardsGained <= 10) {
          return 0;
        } else {
          return r.yardsGained - 10;
        }
      })
      .reduce((p, v) => p + v, 0);

    return {
      teamId: Number(t.team.id),
      team: t.team.location,
      homeAway: t.homeAway,
      lineScores: t.linescores.map((l) => Number(l.displayValue)),
      points: Number(t.score),
      drives: teamDrives.length,
      scoringOpportunities: scoringOpps.length,
      pointsPerOpportunity: scoringOpps.length
        ? Math.round(
            (scoringOpps.map((o) => o.pointsGained).reduce((p, v) => p + v, 0) /
              scoringOpps.length) *
              10,
          ) / 10
        : 0,
      plays: teamPlays.length,
      lineYards,
      lineYardsPerRush:
        rushingPlays.length > 0
          ? Math.round((lineYards * 10) / rushingPlays.length) / 10
          : 0,
      secondLevelYards,
      secondLevelYardsPerRush:
        rushingPlays.length > 0
          ? Math.round((secondLevelYards * 10) / rushingPlays.length) / 10
          : 0,
      openFieldYards,
      openFieldYardsPerRush:
        rushingPlays.length > 0
          ? Math.round((openFieldYards * 10) / rushingPlays.length) / 10
          : 0,
      epaPerPlay: epaPlays.length
        ? Math.round(
            (epaPlays.map((t) => t.epa ?? 0).reduce((p, v) => p + v, 0) /
              epaPlays.length) *
              1000,
          ) / 1000
        : 0,
      totalEpa:
        Math.round(
          epaPlays.map((t) => t.epa ?? 0).reduce((p, v) => p + v, 0) * 10,
        ) / 10,
      passingEpa:
        Math.round(
          passingPlays.map((t) => t.epa ?? 0).reduce((p, v) => p + v, 0) * 10,
        ) / 10,
      epaPerPass: passingPlays.length
        ? Math.round(
            (passingPlays.map((t) => t.epa ?? 0).reduce((p, v) => p + v, 0) /
              passingPlays.length) *
              1000,
          ) / 1000
        : 0,
      rushingEpa:
        Math.round(
          rushingPlays.map((t) => t.epa ?? 0).reduce((p, v) => p + v, 0) * 10,
        ) / 10,
      epaPerRush: rushingPlays.length
        ? Math.round(
            (rushingPlays.map((t) => t.epa ?? 0).reduce((p, v) => p + v, 0) /
              rushingPlays.length) *
              1000,
          ) / 1000
        : 0,
      successRate: teamPlays.length
        ? Math.round(
            (teamPlays
              .map((t): number => (t.success ? 1 : 0))
              .reduce((p, v) => p + v, 0) /
              teamPlays.length) *
              1000,
          ) / 1000
        : 0,
      standardDownSuccessRate: standardDowns.length
        ? Math.round(
            (standardDowns
              .map((t): number => (t.success ? 1 : 0))
              .reduce((p, v) => p + v, 0) /
              standardDowns.length) *
              1000,
          ) / 1000
        : 0,
      passingDownSuccessRate: passingDowns.length
        ? Math.round(
            (passingDowns
              .map((t): number => (t.success ? 1 : 0))
              .reduce((p, v) => p + v, 0) /
              passingDowns.length) *
              1000,
          ) / 1000
        : 0,
      explosiveness: successfulPlays.length
        ? Math.round(
            (successfulPlays.map((t) => t.epa ?? 0).reduce((p, v) => p + v, 0) /
              successfulPlays.length) *
              1000,
          ) / 1000
        : 0,
    };
  });

  const currentDrive = response.data.gamepackageJSON.drives.current;
  const currentPlay = currentDrive?.plays?.length
    ? currentDrive.plays[currentDrive.plays.length - 1]
    : null;

  return {
    id: response.data.gameId,
    status: comp.status.type.description,
    period: comp.status.period ?? null,
    clock: comp.status.displayClock ?? '',
    possession: currentDrive
      ? teams.find((t) => t.team.displayName === currentDrive.team.displayName)
          ?.team.location ?? ''
      : '',
    down: currentPlay?.end?.down ?? null,
    distance: currentPlay?.end?.distance ?? null,
    yardsToGoal: currentPlay?.end?.yardsToEndzone ?? null,
    teams: teamStats,
    drives,
  };
};
