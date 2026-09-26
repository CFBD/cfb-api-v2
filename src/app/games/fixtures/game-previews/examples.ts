import { GamePreview, GameSchedule } from '../../previewTypes';
import { GameStatus, SeasonType } from '../../../enums';

export const emptyScheduleExample: GameSchedule = {
  assembledAt: '2026-09-25T12:00:00.000Z',
  selection: 'none',
  filters: { classification: 'fbs', conference: null },
  window: null,
  followingWindow: null,
  games: [],
};
export const completedPreviewExample: GamePreview & { analysis: null } = {
  assembledAt: '2026-09-25T12:00:00.000Z',
  game: {
    id: 123,
    season: 2026,
    week: 4,
    seasonType: SeasonType.Regular,
    startDate: '2026-09-24T23:00:00.000Z',
    startTimeTBD: false,
    status: GameStatus.Completed,
    statusCheckedAt: '2026-09-25T12:00:00.000Z',
    neutralSite: false,
    conferenceGame: null,
    venue: null,
    playoff: null,
    homeTeam: {
      id: 130,
      name: 'Michigan',
      conference: null,
      conferenceAbbreviation: null,
      classification: null,
      points: 21,
    },
    awayTeam: {
      id: 194,
      name: 'Ohio State',
      conference: null,
      conferenceAbbreviation: null,
      classification: null,
      points: null,
    },
  },
  availability: 'metadata_only',
  reason: 'game_completed',
  analysis: null,
};
