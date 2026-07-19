import { kdb } from '../../config/database';
import { GameStatus } from '../enums';
import {
  CfpPlayoff,
  PlayoffAdvancement,
  PlayoffBidType,
  PlayoffCompetition,
  PlayoffLinkedGame,
  PlayoffMatchup,
  PlayoffOutcome,
  PlayoffParticipant,
  PlayoffRound,
  PlayoffStatus,
  PlayoffTeam,
} from './types';

export interface PlayoffTournamentRecord {
  id: number;
  competition: string;
  season: number;
  format: string;
  teamCount: number;
}

export interface PlayoffParticipantRecord {
  id: number;
  teamId: number;
  school: string;
  conference: string | null;
  committeeRank: number | null;
  seed: number;
  bidType: string;
  qualificationReason: string | null;
  qualifyingConference: string | null;
  conferenceChampion: boolean;
  firstRoundBye: boolean;
}

export interface PlayoffRoundRecord {
  id: number;
  code: string;
  name: string;
  sequence: number;
}

export interface PlayoffMatchupRecord {
  id: number;
  roundId: number;
  bracketSlot: string;
  sequence: number;
  startDate: Date | null;
  bowlName: string | null;
  gameId: number | null;
  gameStartDate: Date | null;
  gameStatus: GameStatus | null;
  homeTeamId: number | null;
  homeTeam: string | null;
  homeConference: string | null;
  homePoints: number | null;
  homeWinner: boolean | null;
  awayTeamId: number | null;
  awayTeam: string | null;
  awayConference: string | null;
  awayPoints: number | null;
  awayWinner: boolean | null;
  venueId: number | null;
  venue: string | null;
}

export interface PlayoffSlotRecord {
  matchupId: number;
  position: number;
  seed: number | null;
  participantTeamId: number | null;
  participantTeam: string | null;
  participantConference: string | null;
  sourceMatchupId: number | null;
}

export interface CfpPlayoffRecords {
  tournament: PlayoffTournamentRecord;
  participants: PlayoffParticipantRecord[];
  rounds: PlayoffRoundRecord[];
  matchups: PlayoffMatchupRecord[];
  slots: PlayoffSlotRecord[];
}

const mapTeam = (
  id: number | null,
  school: string | null,
  conference: string | null,
): PlayoffTeam | null => {
  if (id === null || school === null) {
    return null;
  }

  return { id, school, conference };
};

const getWinningTeam = (matchup: PlayoffMatchupRecord): PlayoffTeam | null => {
  if (matchup.gameStatus !== GameStatus.Completed) {
    return null;
  }

  if (matchup.homeWinner === true) {
    return mapTeam(
      matchup.homeTeamId,
      matchup.homeTeam,
      matchup.homeConference,
    );
  }

  if (matchup.awayWinner === true) {
    return mapTeam(
      matchup.awayTeamId,
      matchup.awayTeam,
      matchup.awayConference,
    );
  }

  return null;
};

const mapLinkedGame = (
  matchup: PlayoffMatchupRecord,
): PlayoffLinkedGame | null => {
  const homeTeam = mapTeam(
    matchup.homeTeamId,
    matchup.homeTeam,
    matchup.homeConference,
  );
  const awayTeam = mapTeam(
    matchup.awayTeamId,
    matchup.awayTeam,
    matchup.awayConference,
  );

  if (
    matchup.gameId === null ||
    matchup.gameStartDate === null ||
    matchup.gameStatus === null ||
    homeTeam === null ||
    awayTeam === null
  ) {
    return null;
  }

  return {
    id: matchup.gameId,
    startDate: matchup.gameStartDate,
    completed: matchup.gameStatus === GameStatus.Completed,
    homeTeam,
    homePoints: matchup.homePoints,
    awayTeam,
    awayPoints: matchup.awayPoints,
    venueId: matchup.venueId,
    venue: matchup.venue,
  };
};

const getAdvancement = (
  matchupId: number,
  slots: PlayoffSlotRecord[],
  matchupsById: Map<number, PlayoffMatchupRecord>,
): PlayoffAdvancement | null => {
  const destinationSlot = slots.find(
    (slot) => slot.sourceMatchupId === matchupId,
  );
  const destination = destinationSlot
    ? matchupsById.get(destinationSlot.matchupId)
    : undefined;

  if (!destinationSlot || !destination) {
    return null;
  }

  return {
    matchupId: destination.id,
    bracketSlot: destination.bracketSlot,
    position: destinationSlot.position,
  };
};

const getParticipantResult = (
  teamId: number,
  champion: PlayoffTeam | null,
  matchups: PlayoffMatchupRecord[],
  roundsById: Map<number, PlayoffRoundRecord>,
): { outcome: PlayoffOutcome; eliminatedRound: PlayoffRound | null } => {
  if (champion?.id === teamId) {
    return { outcome: 'champion', eliminatedRound: null };
  }

  const loss = matchups.find(
    (matchup) =>
      matchup.gameStatus === GameStatus.Completed &&
      ((matchup.homeTeamId === teamId && matchup.homeWinner === false) ||
        (matchup.awayTeamId === teamId && matchup.awayWinner === false)),
  );

  if (!loss) {
    return { outcome: 'active', eliminatedRound: null };
  }

  return {
    outcome: 'eliminated',
    eliminatedRound:
      (roundsById.get(loss.roundId)?.code as PlayoffRound | undefined) ?? null,
  };
};

const getStatus = (
  participants: PlayoffParticipantRecord[],
  matchups: PlayoffMatchupRecord[],
  championshipRoundId: number | undefined,
): PlayoffStatus => {
  if (participants.length === 0) {
    return 'scheduled';
  }

  const championship = matchups.find(
    (matchup) => matchup.roundId === championshipRoundId,
  );
  if (championship?.gameStatus === GameStatus.Completed) {
    return 'completed';
  }

  if (
    matchups.some(
      (matchup) =>
        matchup.gameStatus !== null &&
        matchup.gameStatus !== GameStatus.Scheduled,
    )
  ) {
    return 'in_progress';
  }

  return 'selected';
};

export const mapCfpPlayoff = ({
  tournament,
  participants,
  rounds,
  matchups,
  slots,
}: CfpPlayoffRecords): CfpPlayoff => {
  const roundsById = new Map(rounds.map((round) => [round.id, round]));
  const matchupsById = new Map(
    matchups.map((matchup) => [matchup.id, matchup]),
  );
  const championshipRound = rounds.find(
    (round) => round.code === PlayoffRound.Championship,
  );
  const championship = matchups.find(
    (matchup) => matchup.roundId === championshipRound?.id,
  );
  const champion = championship ? getWinningTeam(championship) : null;

  const mappedParticipants: PlayoffParticipant[] = participants
    .map((participant) => {
      const result = getParticipantResult(
        participant.teamId,
        champion,
        matchups,
        roundsById,
      );

      return {
        team: {
          id: participant.teamId,
          school: participant.school,
          conference: participant.conference,
        },
        committeeRank: participant.committeeRank,
        seed: participant.seed,
        bidType: participant.bidType as PlayoffBidType,
        qualificationReason: participant.qualificationReason,
        conferenceChampion: participant.conferenceChampion,
        qualifyingConference: participant.qualifyingConference,
        firstRoundBye: participant.firstRoundBye,
        outcome: result.outcome,
        eliminatedRound: result.eliminatedRound,
      };
    })
    .sort((a, b) => a.seed - b.seed);

  const mappedMatchups = new Map<number, PlayoffMatchup>();
  for (const matchup of matchups) {
    const round = roundsById.get(matchup.roundId);
    if (!round) {
      continue;
    }

    const mappedSlots = slots
      .filter((slot) => slot.matchupId === matchup.id)
      .sort((a, b) => a.position - b.position)
      .map((slot) => {
        const source =
          slot.sourceMatchupId === null
            ? null
            : matchupsById.get(slot.sourceMatchupId);

        return {
          position: slot.position,
          seed: slot.seed,
          participant: mapTeam(
            slot.participantTeamId,
            slot.participantTeam,
            slot.participantConference,
          ),
          source: source
            ? {
                matchupId: source.id,
                bracketSlot: source.bracketSlot,
                outcome: 'winner' as const,
              }
            : null,
        };
      });

    const game = mapLinkedGame(matchup);
    mappedMatchups.set(matchup.id, {
      id: matchup.id,
      bracketSlot: matchup.bracketSlot,
      round: round.code as PlayoffRound,
      roundName: round.name,
      roundOrder: round.sequence,
      matchupOrder: matchup.sequence,
      startDate: game?.startDate ?? matchup.startDate,
      bowlName: matchup.bowlName,
      slots: mappedSlots,
      game,
      advancesTo: getAdvancement(matchup.id, slots, matchupsById),
    });
  }

  return {
    season: tournament.season,
    competition: tournament.competition as PlayoffCompetition.Cfp,
    format: tournament.format,
    teamCount: tournament.teamCount,
    status: getStatus(participants, matchups, championshipRound?.id),
    participants: mappedParticipants,
    rounds: [...rounds]
      .sort((a, b) => a.sequence - b.sequence)
      .map((round) => ({
        code: round.code as PlayoffRound,
        name: round.name,
        order: round.sequence,
        matchups: matchups
          .filter((matchup) => matchup.roundId === round.id)
          .sort((a, b) => a.sequence - b.sequence)
          .flatMap((matchup) => {
            const mapped = mappedMatchups.get(matchup.id);
            return mapped ? [mapped] : [];
          }),
      })),
    champion,
  };
};

const loadCfpPlayoffRecords = async (
  year: number,
): Promise<CfpPlayoffRecords | null> => {
  const tournament = await kdb
    .selectFrom('playoffTournament')
    .where('competition', '=', PlayoffCompetition.Cfp)
    .where('season', '=', year)
    .select(['id', 'competition', 'season', 'format', 'teamCount'])
    .executeTakeFirst();

  if (!tournament) {
    return null;
  }

  const [participants, rounds, matchupRows, slots] = await Promise.all([
    kdb
      .selectFrom('playoffParticipant as participant')
      .innerJoin('team', 'participant.teamId', 'team.id')
      .leftJoin(
        'conference as qualifyingConference',
        'participant.qualifyingConferenceId',
        'qualifyingConference.id',
      )
      .leftJoin('conferenceTeam as teamConference', (join) =>
        join
          .onRef('team.id', '=', 'teamConference.teamId')
          .on('teamConference.startYear', '<=', year)
          .on((eb) =>
            eb.or([
              eb('teamConference.endYear', '>=', year),
              eb('teamConference.endYear', 'is', null),
            ]),
          ),
      )
      .leftJoin(
        'conference as participantConference',
        'teamConference.conferenceId',
        'participantConference.id',
      )
      .where('participant.playoffId', '=', tournament.id)
      .select([
        'participant.id',
        'participant.teamId',
        'team.school',
        'participantConference.name as conference',
        'participant.committeeRank',
        'participant.seed',
        'participant.bidType',
        'participant.qualificationReason',
        'qualifyingConference.name as qualifyingConference',
        'participant.conferenceChampion',
        'participant.firstRoundBye',
      ])
      .orderBy('participant.seed')
      .execute(),
    kdb
      .selectFrom('playoffRound')
      .where('playoffId', '=', tournament.id)
      .select(['id', 'code', 'name', 'sequence'])
      .orderBy('sequence')
      .execute(),
    kdb
      .selectFrom('playoffMatchup as matchup')
      .leftJoin('game', 'matchup.gameId', 'game.id')
      .leftJoin('gameTeam as homeGameTeam', (join) =>
        join
          .onRef('game.id', '=', 'homeGameTeam.gameId')
          .on('homeGameTeam.homeAway', '=', 'home'),
      )
      .leftJoin('team as homeTeam', 'homeGameTeam.teamId', 'homeTeam.id')
      .leftJoin('conferenceTeam as homeConferenceTeam', (join) =>
        join
          .onRef('homeTeam.id', '=', 'homeConferenceTeam.teamId')
          .onRef('homeConferenceTeam.startYear', '<=', 'game.season')
          .on((eb) =>
            eb.or([
              eb('homeConferenceTeam.endYear', '>=', eb.ref('game.season')),
              eb('homeConferenceTeam.endYear', 'is', null),
            ]),
          ),
      )
      .leftJoin(
        'conference as homeConference',
        'homeConferenceTeam.conferenceId',
        'homeConference.id',
      )
      .leftJoin('gameTeam as awayGameTeam', (join) =>
        join
          .onRef('game.id', '=', 'awayGameTeam.gameId')
          .on('awayGameTeam.homeAway', '=', 'away'),
      )
      .leftJoin('team as awayTeam', 'awayGameTeam.teamId', 'awayTeam.id')
      .leftJoin('conferenceTeam as awayConferenceTeam', (join) =>
        join
          .onRef('awayTeam.id', '=', 'awayConferenceTeam.teamId')
          .onRef('awayConferenceTeam.startYear', '<=', 'game.season')
          .on((eb) =>
            eb.or([
              eb('awayConferenceTeam.endYear', '>=', eb.ref('game.season')),
              eb('awayConferenceTeam.endYear', 'is', null),
            ]),
          ),
      )
      .leftJoin(
        'conference as awayConference',
        'awayConferenceTeam.conferenceId',
        'awayConference.id',
      )
      .leftJoin('venue', 'game.venueId', 'venue.id')
      .where('matchup.playoffId', '=', tournament.id)
      .select([
        'matchup.id',
        'matchup.roundId',
        'matchup.bracketSlot',
        'matchup.sequence',
        'matchup.startDate',
        'matchup.bowlName',
        'matchup.gameId',
        'game.startDate as gameStartDate',
        'game.status as gameStatus',
        'homeTeam.id as homeTeamId',
        'homeTeam.school as homeTeam',
        'homeConference.name as homeConference',
        'homeGameTeam.points as homePoints',
        'homeGameTeam.winner as homeWinner',
        'awayTeam.id as awayTeamId',
        'awayTeam.school as awayTeam',
        'awayConference.name as awayConference',
        'awayGameTeam.points as awayPoints',
        'awayGameTeam.winner as awayWinner',
        'venue.id as venueId',
        'venue.name as venue',
      ])
      .orderBy('matchup.roundId')
      .orderBy('matchup.sequence')
      .execute(),
    kdb
      .selectFrom('playoffMatchupSlot as slot')
      .innerJoin('playoffMatchup as matchup', 'slot.matchupId', 'matchup.id')
      .leftJoin(
        'playoffParticipant as participant',
        'slot.participantId',
        'participant.id',
      )
      .leftJoin('team', 'participant.teamId', 'team.id')
      .leftJoin('conferenceTeam as teamConference', (join) =>
        join
          .onRef('team.id', '=', 'teamConference.teamId')
          .on('teamConference.startYear', '<=', year)
          .on((eb) =>
            eb.or([
              eb('teamConference.endYear', '>=', year),
              eb('teamConference.endYear', 'is', null),
            ]),
          ),
      )
      .leftJoin(
        'conference as participantConference',
        'teamConference.conferenceId',
        'participantConference.id',
      )
      .where('matchup.playoffId', '=', tournament.id)
      .select([
        'slot.matchupId',
        'slot.position',
        'slot.seed',
        'participant.teamId as participantTeamId',
        'team.school as participantTeam',
        'participantConference.name as participantConference',
        'slot.sourceMatchupId',
      ])
      .orderBy('slot.matchupId')
      .orderBy('slot.position')
      .execute(),
  ]);

  const matchups: PlayoffMatchupRecord[] = matchupRows.map((matchup) => ({
    ...matchup,
    gameStatus: matchup.gameStatus as GameStatus | null,
  }));

  return { tournament, participants, rounds, matchups, slots };
};

export const getCfpPlayoff = async (
  year: number,
): Promise<CfpPlayoff | null> => {
  const records = await loadCfpPlayoffRecords(year);
  return records ? mapCfpPlayoff(records) : null;
};

export const getCfpParticipants = async (
  year: number,
): Promise<PlayoffParticipant[] | null> => {
  const playoff = await getCfpPlayoff(year);
  return playoff?.participants ?? null;
};

export const getCfpGames = async (
  year: number,
  round?: PlayoffRound,
): Promise<PlayoffMatchup[] | null> => {
  const playoff = await getCfpPlayoff(year);
  if (!playoff) {
    return null;
  }

  return playoff.rounds
    .filter((record) => !round || record.code === round)
    .flatMap((record) => record.matchups);
};
