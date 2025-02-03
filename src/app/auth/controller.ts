import { ApiUser, AuthorizationError } from '../../globals';
import { Route, Controller, Get, Hidden, Request, Post, Body } from 'tsoa';
import { generateApiKey } from './service';

@Route('auth')
export class AuthController extends Controller {
  @Get('graphql')
  @Hidden()
  public async getHasuraAuth(@Request() request: Express.Request) {
    if (request.user) {
      const user = request.user as ApiUser;
      if (user && (user.patronLevel >= 3 || user.isAdmin)) {
        this.setStatus(200);

        return {
          'X-Hasura-User-Id': `${user.id}`,
          'X-Hasura-Role': 'readonly',
          'X-Hasura-Is-Owner': 'false',
          'Cache-Control': 'max-age=86400',
        };
      }
    }

    this.setStatus(401);
    return Promise.reject(
      new AuthorizationError(
        'The GraphQL endpoint requires Patreon Tier 3 or above. Please visit https://www.patreon.com/collegefootballdata to subscribe.',
      ),
    );
  }

  @Post('key')
  @Hidden()
  public async requestApiKey(@Body() body: { email: string }) {
    await generateApiKey(body.email);
    this.setStatus(200);
  }
}
