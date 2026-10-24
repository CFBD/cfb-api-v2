import { unavailableCpoe } from '../boxScores/cpoe';
import {
  aggregateTeamSeasonCpoe,
  CurrentTeamSeasonPrediction,
  TeamSeasonParticipant,
  teamSeasonKey,
} from './teamSeasonCpoe';

const participant = (
  patch: Partial<TeamSeasonParticipant> = {},
): TeamSeasonParticipant => ({
  gameId: 10,
  season: 2026,
  id: 1,
  school: 'Home',
  conference: 'B1G',
  ...patch,
});
const prediction = (
  patch: Partial<CurrentTeamSeasonPrediction> = {},
): CurrentTeamSeasonPrediction => ({
  gameId: 10,
  playId: '90071992547409935',
  offenseId: 1,
  defenseId: 2,
  outcome: 'completion',
  completionProbability: 0.8,
  modelVersion: 'v2',
  ...patch,
});

test('weights games by scored attempts, preserves defensive sign and rounds only at the end', () => {
  const participants = [
    participant(),
    participant({ id: 2, school: 'Away' }),
    participant({ gameId: 11 }),
    participant({ gameId: 11, id: 2, school: 'Away' }),
  ];
  const rows = aggregateTeamSeasonCpoe(participants, [
    prediction(),
    prediction({ gameId: 11, completionProbability: 0.466666 }),
    prediction({
      gameId: 11,
      outcome: 'incompletion',
      completionProbability: 0.466667,
    }),
    prediction({
      gameId: 11,
      outcome: 'interception',
      completionProbability: 0.466667,
    }),
  ]);
  const home = rows.get(teamSeasonKey(2026, 'Home', 'B1G'));
  const away = rows.get(teamSeasonKey(2026, 'Away', 'B1G'));
  expect(home?.offense).toEqual({
    cpoeAttemptsAvailable: 4,
    cpoeCompletions: 2,
    expectedCompletions: 2.2,
    expectedCompletionRate: 0.55,
    cpoe: -5,
  });
  expect(away?.defense).toEqual(home?.offense);
  expect(home?.defense).toEqual(unavailableCpoe());
});

test('matches game and participant, preserves scope multiplicity, and separates seasons and conferences', () => {
  const rows = aggregateTeamSeasonCpoe(
    [
      participant(),
      participant(),
      participant({ gameId: 11, season: 2025 }),
      participant({ gameId: 12, conference: null }),
      participant({ id: 3, school: 'Uninvolved' }),
    ],
    [
      prediction(),
      prediction({ gameId: 11 }),
      prediction({ gameId: 12 }),
      prediction({ gameId: 13 }),
      prediction({ gameId: null }),
      prediction({ playId: null }),
    ],
  );
  expect(
    rows.get(teamSeasonKey(2026, 'Home', 'B1G'))?.offense.cpoeAttemptsAvailable,
  ).toBe(2);
  expect(
    rows.get(teamSeasonKey(2025, 'Home', 'B1G'))?.offense.cpoeAttemptsAvailable,
  ).toBe(1);
  expect(
    rows.get(teamSeasonKey(2026, 'Home', null))?.offense.cpoeAttemptsAvailable,
  ).toBe(1);
  expect(rows.get(teamSeasonKey(2026, 'Uninvolved', 'B1G'))?.offense).toEqual(
    unavailableCpoe(),
  );
});

test('unscored games cannot add attempts and probabilities of zero remain available', () => {
  expect(aggregateTeamSeasonCpoe([participant()], []).size).toBe(0);
  const row = aggregateTeamSeasonCpoe(
    [participant()],
    [prediction({ completionProbability: 0 })],
  ).get(teamSeasonKey(2026, 'Home', 'B1G'));
  expect(row?.offense).toEqual({
    cpoeAttemptsAvailable: 1,
    cpoeCompletions: 1,
    expectedCompletions: 0,
    expectedCompletionRate: 0,
    cpoe: 100,
  });
});

test('mixed models suppress the affected side without suppressing the other side', () => {
  const diagnostic = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const row = aggregateTeamSeasonCpoe(
      [participant()],
      [
        prediction(),
        prediction({ modelVersion: 'v3' }),
        prediction({ offenseId: 2, defenseId: 1, completionProbability: 0.25 }),
      ],
    ).get(teamSeasonKey(2026, 'Home', 'B1G'));
    expect(row?.offense).toEqual(unavailableCpoe());
    expect(row?.defense.cpoe).toBe(75);
    expect(diagnostic).toHaveBeenCalledTimes(1);
  } finally {
    diagnostic.mockRestore();
  }
});
