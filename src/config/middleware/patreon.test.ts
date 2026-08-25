import { getMockReq, getMockRes } from '@jest-mock/express';
import { fetchMiddlewares } from '@tsoa/runtime';
import { AuthorizationError } from '../../globals';
import { LiveController } from '../../app/live/controller';
import {
  GamesController,
  ScoreboardController,
} from '../../app/games/controller';
import { WepaController } from '../../app/wepa/controller';
import { requirePatreonTier } from './patreon';

describe('Patreon operation middleware', () => {
  test('is attached to each paid controller operation', () => {
    const paidHandlers = [
      LiveController.prototype.getLivePlays,
      GamesController.prototype.getWeather,
      ScoreboardController.prototype.getScoreboard,
      WepaController.prototype.getAdjustedTeamSeasonStats,
      WepaController.prototype.getAdjustedPlayerPassingStats,
      WepaController.prototype.getAdjustedPlayerRushingStats,
      WepaController.prototype.getKickerPaar,
    ];

    expect(
      paidHandlers.map((handler) => fetchMiddlewares(handler).length),
    ).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  test.each([
    [{ patronLevel: 0, isAdmin: false }, 1, false],
    [{ patronLevel: 1, isAdmin: false }, 1, true],
    [{ patronLevel: 2, isAdmin: false }, 2, true],
    [{ patronLevel: 0, isAdmin: true }, 2, true],
  ] as const)('enforces the configured tier', (user, tier, allowed) => {
    const req = getMockReq({ user });
    const { res, next } = getMockRes();

    requirePatreonTier(tier)(req, res, next);

    if (allowed) {
      expect(next).toHaveBeenCalledWith();
    } else {
      expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
    }
  });
});
