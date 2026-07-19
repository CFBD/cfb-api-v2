import { GameStatus } from '../enums';
import {
  CfpPlayoffRecords,
  PlayoffMatchupRecord,
  getCfpPlayoff,
  mapCfpPlayoff,
} from './service';
import { PlayoffRound } from './types';

jest.mock('../../config/database', () => ({
  db: {},
  authDb: {},
  kdb: { selectFrom: jest.fn() },
}));

import { kdb } from '../../config/database';

const selectFrom = kdb.selectFrom as jest.Mock;

const teamNames: Record<number, string> = {
  1: 'One State',
  2: 'Two Tech',
  3: 'Three University',
  4: 'Four College',
  5: 'Five State',
  12: 'Twelve Tech',
};

const buildMatchup = (
  overrides: Partial<PlayoffMatchupRecord>,
): PlayoffMatchupRecord => ({
  id: 100,
  roundId: 10,
  bracketSlot: 'SF1',
  sequence: 1,
  startDate: new Date('2015-01-01T17:00:00.000Z'),
  bowlName: 'Rose Bowl',
  gameId: 1000,
  gameStartDate: new Date('2015-01-01T17:00:00.000Z'),
  gameStatus: GameStatus.Completed,
  homeTeamId: 1,
  homeTeam: teamNames[1],
  homeConference: 'Conference A',
  homePoints: 30,
  homeWinner: true,
  awayTeamId: 4,
  awayTeam: teamNames[4],
  awayConference: 'Conference B',
  awayPoints: 20,
  awayWinner: false,
  venueId: 50,
  venue: 'Rose Bowl',
  ...overrides,
});

const buildFourTeamRecords = (): CfpPlayoffRecords => ({
  tournament: {
    id: 1,
    competition: 'cfp',
    season: 2014,
    format: 'four_team',
    teamCount: 4,
  },
  participants: [1, 2, 3, 4].map((teamId) => ({
    id: teamId,
    teamId,
    school: teamNames[teamId],
    conference: `Conference ${teamId}`,
    committeeRank: teamId,
    seed: teamId,
    bidType: 'at_large',
    qualificationReason: null,
    qualifyingConference: null,
    conferenceChampion: false,
    firstRoundBye: false,
  })),
  rounds: [
    { id: 10, code: 'semifinal', name: 'Semifinal', sequence: 1 },
    { id: 20, code: 'championship', name: 'Championship', sequence: 2 },
  ],
  matchups: [
    buildMatchup({ id: 100, bracketSlot: 'SF1' }),
    buildMatchup({
      id: 101,
      bracketSlot: 'SF2',
      sequence: 2,
      homeTeamId: 2,
      homeTeam: teamNames[2],
      awayTeamId: 3,
      awayTeam: teamNames[3],
      homeWinner: false,
      awayWinner: true,
    }),
    buildMatchup({
      id: 200,
      roundId: 20,
      bracketSlot: 'F',
      startDate: new Date('2015-01-12T20:00:00.000Z'),
      gameId: 2000,
      gameStartDate: new Date('2015-01-12T20:00:00.000Z'),
      homeTeamId: 1,
      homeTeam: teamNames[1],
      awayTeamId: 3,
      awayTeam: teamNames[3],
      homeWinner: true,
      awayWinner: false,
      bowlName: null,
      venue: 'Championship Stadium',
    }),
  ],
  slots: [
    {
      matchupId: 100,
      position: 1,
      seed: 1,
      participantTeamId: 1,
      participantTeam: teamNames[1],
      participantConference: 'Conference 1',
      sourceMatchupId: null,
    },
    {
      matchupId: 100,
      position: 2,
      seed: 4,
      participantTeamId: 4,
      participantTeam: teamNames[4],
      participantConference: 'Conference 4',
      sourceMatchupId: null,
    },
    {
      matchupId: 101,
      position: 1,
      seed: 2,
      participantTeamId: 2,
      participantTeam: teamNames[2],
      participantConference: 'Conference 2',
      sourceMatchupId: null,
    },
    {
      matchupId: 101,
      position: 2,
      seed: 3,
      participantTeamId: 3,
      participantTeam: teamNames[3],
      participantConference: 'Conference 3',
      sourceMatchupId: null,
    },
    {
      matchupId: 200,
      position: 1,
      seed: 1,
      participantTeamId: 1,
      participantTeam: teamNames[1],
      participantConference: 'Conference 1',
      sourceMatchupId: 100,
    },
    {
      matchupId: 200,
      position: 2,
      seed: 3,
      participantTeamId: 3,
      participantTeam: teamNames[3],
      participantConference: 'Conference 3',
      sourceMatchupId: 101,
    },
  ],
});

describe('mapCfpPlayoff', () => {
  test('maps a completed four-team bracket and derives advancement', () => {
    const playoff = mapCfpPlayoff(buildFourTeamRecords());

    expect(playoff.status).toBe('completed');
    expect(playoff.rounds).toHaveLength(2);
    expect(playoff.rounds.flatMap((round) => round.matchups)).toHaveLength(3);
    expect(playoff.champion?.school).toBe(teamNames[1]);
    expect(playoff.rounds[0].matchups[0].advancesTo).toEqual({
      matchupId: 200,
      bracketSlot: 'F',
      position: 1,
    });
    expect(playoff.participants.find((p) => p.seed === 4)).toMatchObject({
      outcome: 'eliminated',
      eliminatedRound: PlayoffRound.Semifinal,
    });
  });

  test('keeps committee rank and seed distinct with bowl identity', () => {
    const records = buildFourTeamRecords();
    records.tournament.season = 2024;
    records.tournament.format = 'twelve_team_2024';
    records.tournament.teamCount = 12;
    records.participants[0].committeeRank = 3;
    records.participants[0].seed = 1;

    const playoff = mapCfpPlayoff(records);

    expect(playoff.participants[0]).toMatchObject({
      committeeRank: 3,
      seed: 1,
    });
    expect(playoff.rounds[0].matchups[0].bowlName).toBe('Rose Bowl');
  });

  test('preserves unresolved 2026 seeds and source relationships', () => {
    const records: CfpPlayoffRecords = {
      tournament: {
        id: 3,
        competition: 'cfp',
        season: 2026,
        format: 'twelve_team_2026',
        teamCount: 12,
      },
      participants: [],
      rounds: [
        { id: 30, code: 'first_round', name: 'First Round', sequence: 1 },
        {
          id: 40,
          code: 'quarterfinal',
          name: 'Quarterfinal',
          sequence: 2,
        },
      ],
      matchups: [
        buildMatchup({
          id: 300,
          roundId: 30,
          bracketSlot: 'FR1',
          gameId: null,
          gameStartDate: null,
          gameStatus: null,
          homeTeamId: null,
          homeTeam: null,
          homeConference: null,
          homePoints: null,
          homeWinner: null,
          awayTeamId: null,
          awayTeam: null,
          awayConference: null,
          awayPoints: null,
          awayWinner: null,
          venueId: null,
          venue: null,
        }),
        buildMatchup({
          id: 400,
          roundId: 40,
          bracketSlot: 'QF1',
          gameId: null,
          gameStartDate: null,
          gameStatus: null,
          homeTeamId: null,
          homeTeam: null,
          homeConference: null,
          homePoints: null,
          homeWinner: null,
          awayTeamId: null,
          awayTeam: null,
          awayConference: null,
          awayPoints: null,
          awayWinner: null,
          venueId: null,
          venue: null,
        }),
      ],
      slots: [
        {
          matchupId: 300,
          position: 1,
          seed: 5,
          participantTeamId: null,
          participantTeam: null,
          participantConference: null,
          sourceMatchupId: null,
        },
        {
          matchupId: 300,
          position: 2,
          seed: 12,
          participantTeamId: null,
          participantTeam: null,
          participantConference: null,
          sourceMatchupId: null,
        },
        {
          matchupId: 400,
          position: 1,
          seed: 1,
          participantTeamId: null,
          participantTeam: null,
          participantConference: null,
          sourceMatchupId: null,
        },
        {
          matchupId: 400,
          position: 2,
          seed: null,
          participantTeamId: null,
          participantTeam: null,
          participantConference: null,
          sourceMatchupId: 300,
        },
      ],
    };

    const playoff = mapCfpPlayoff(records);
    const firstRound = playoff.rounds[0].matchups[0];
    const quarterfinal = playoff.rounds[1].matchups[0];

    expect(playoff.status).toBe('scheduled');
    expect(playoff.participants).toEqual([]);
    expect(firstRound.slots.map((slot) => slot.seed)).toEqual([5, 12]);
    expect(firstRound.game).toBeNull();
    expect(firstRound.advancesTo).toEqual({
      matchupId: 400,
      bracketSlot: 'QF1',
      position: 2,
    });
    expect(quarterfinal.slots[1].source).toEqual({
      matchupId: 300,
      bracketSlot: 'FR1',
      outcome: 'winner',
    });
  });

  test.each([
    [GameStatus.Scheduled, 'selected'],
    [GameStatus.InProgress, 'in_progress'],
  ] as const)('derives %s game state as %s', (gameStatus, status) => {
    const records = buildFourTeamRecords();
    for (const matchup of records.matchups) {
      matchup.gameStatus = GameStatus.Scheduled;
      matchup.homeWinner = null;
      matchup.awayWinner = null;
    }
    records.matchups[0].gameStatus = gameStatus;

    expect(mapCfpPlayoff(records).status).toBe(status);
  });
});

describe('getCfpPlayoff', () => {
  test('returns null when the season has no tournament row', async () => {
    const builder: Record<string, jest.Mock> = {};
    builder.where = jest.fn().mockReturnValue(builder);
    builder.select = jest.fn().mockReturnValue(builder);
    builder.executeTakeFirst = jest.fn().mockResolvedValue(undefined);
    selectFrom.mockReturnValue(builder);

    await expect(getCfpPlayoff(2013)).resolves.toBeNull();
  });
});
