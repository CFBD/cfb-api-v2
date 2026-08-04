import { ApiUser } from '../../globals';
import { Route, Controller, Get, Request, Tags, Query } from 'tsoa';
import { UserInfo, UserUsage, UserUsageApi } from './types';
import { getUserInfo, getUserUsage } from './service';

@Route('info')
@Tags('info')
export class InfoController extends Controller {
  /**
   * Returns the authenticated user's Patreon level and remaining API calls.
   * Returns `null` when the request is not authenticated.
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
   * Returns recent usage for the authenticated user's shared CFB and CBB call
   * pool. Returns `null` when the request is not authenticated.
   * @param days Trailing days to include. Defaults to 7; maximum 31.
   * @param limit Maximum endpoint and request rows to return. Defaults to 10;
   * maximum 50.
   * @param api API to include: `all`, `cfb`, or `cbb`.
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
