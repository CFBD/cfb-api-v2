import { ApiUser } from '../../globals';
import { Route, Controller, Get, Request, Tags, Query } from 'tsoa';
import { UserInfo, UserUsage, UserUsageApi } from './types';
import { getUserInfo, getUserUsage } from './service';

@Route('info')
@Tags('info')
export class InfoController extends Controller {
  /**
   * Retrieves information about the user, including their Patreon level and remaining API calls.
   * @returns UserInfo object containing patron level and remaining calls, or null if not authenticated.
   */
  @Get()
  public async getUserInfo(
    @Request() request: Express.Request,
  ): Promise<UserInfo | null> {
    if (request.user) {
      const user = request.user as ApiUser;

      return getUserInfo(user);
    } else {
      return null;
    }
  }

  /**
   * Retrieves bounded API usage for the authenticated user's shared CFB/CBB call pool.
   * @param days Number of trailing days to include, defaults to 7 and is capped at 31
   * @param limit Number of endpoint and recent request rows to return, defaults to 10 and is capped at 50
   * @param api Optional API filter: all, cfb, or cbb
   * @isInt days
   * @isInt limit
   */
  @Get('usage')
  public async getUsage(
    @Request() request: Express.Request,
    @Query() days?: number,
    @Query() limit?: number,
    @Query() api?: UserUsageApi,
  ): Promise<UserUsage | null> {
    if (request.user) {
      const user = request.user as ApiUser;

      return await getUserUsage(user, days, limit, api);
    } else {
      return null;
    }
  }
}
