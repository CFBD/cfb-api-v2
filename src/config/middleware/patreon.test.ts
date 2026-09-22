import type { RequestHandler } from 'express';
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

describe('website adjusted history authorization', () => {
  test.each([
    ['websitePage', 'GET', '/wepa/team/season', true, true],
    ['websitePage', 'GET', '/wepa/team/season', false, false],
    ['websiteExporter', 'GET', '/wepa/team/season', true, false],
    ['individual', 'GET', '/wepa/team/season', true, false],
    ['websitePage', 'POST', '/wepa/team/season', true, false],
    ['websitePage', 'GET', '/wepa/players/rushing', true, false],
    ['websitePage', 'GET', '/scoreboard', true, false],
  ])(
    'bounds the exception: %s %s %s opt-in %s',
    (principalClass, method, path, allowWebsitePage, allowed) => {
      const req = getMockReq({
        method,
        route: { path },
        user: { principalClass, patronLevel: 0, isAdmin: false },
      });
      const { res, next } = getMockRes();
      requirePatreonTier(1, { allowWebsitePage: Boolean(allowWebsitePage) })(
        req,
        res,
        next,
      );
      expect(next).toHaveBeenCalledWith(
        ...(allowed ? [] : [expect.any(AuthorizationError)]),
      );
    },
  );
  test('uses the matched operation, ignoring raw URL and untrusted claims', () => {
    const { res, next } = getMockRes();
    const middleware = fetchMiddlewares(
      WepaController.prototype.getAdjustedTeamSeasonStats,
    )[0] as RequestHandler;
    middleware(
      getMockReq({
        method: 'GET',
        url: '/WEPA/TEAM/SEASON/',
        route: { path: '/wepa/team/season' },
        user: { principalClass: 'websitePage', patronLevel: 0, isAdmin: false },
      }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledWith();
    jest.clearAllMocks();
    middleware(
      getMockReq({
        method: 'GET',
        route: { path: '/wepa/team/season' },
        query: { principalClass: 'websitePage' },
        headers: { 'x-principal-class': 'websitePage' },
      }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
  });
  test('other paid handlers do not inherit the exception', () => {
    for (const handler of [
      WepaController.prototype.getAdjustedPlayerPassingStats,
      WepaController.prototype.getAdjustedPlayerRushingStats,
      WepaController.prototype.getKickerPaar,
      LiveController.prototype.getLivePlays,
      GamesController.prototype.getWeather,
      ScoreboardController.prototype.getScoreboard,
    ]) {
      const { res, next } = getMockRes();
      (fetchMiddlewares(handler)[0] as RequestHandler)(
        getMockReq({
          method: 'GET',
          route: { path: '/wepa/team/season' },
          user: {
            principalClass: 'websitePage',
            patronLevel: 0,
            isAdmin: false,
          },
        }),
        res,
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
    }
  });
});
