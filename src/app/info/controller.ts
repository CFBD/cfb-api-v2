import { ApiUser } from '../../globals';
import { Route, Controller, Get, Request, Tags } from 'tsoa';
import { UserInfo } from './types';

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

      return {
        patronLevel: user.patronLevel,
        remainingCalls: user.remainingCalls,
      };
    } else {
      return null;
    }
  }
}
