import { Route, Middlewares, Tags, Controller, Get, Query } from 'tsoa';

import middlewares from '../../config/middleware';
import { DraftPick, DraftPosition, DraftTeam } from './types';
import { getPicks, getPositions, getTeams } from './service';

@Route('draft')
@Middlewares(middlewares.standard)
@Tags('draft')
export class DraftController extends Controller {
  /**
   * Returns the NFL teams represented in draft data.
   */
  @Get('teams')
  public async getDraftTeams(): Promise<DraftTeam[]> {
    return await getTeams();
  }

  /**
   * Returns the player position categories used in NFL Draft data.
   */
  @Get('positions')
  public async getDraftPositions(): Promise<DraftPosition[]> {
    return await getPositions();
  }

  /**
   * Returns historical NFL Draft picks.
   * @param year Draft year.
   * @param team NFL team name.
   * @param school College team name.
   * @param conference College conference name or abbreviation.
   * @param position Position category.
   * @isInt year
   */
  @Get('picks')
  public async getDraftPicks(
    @Query() year?: number,
    @Query() team?: string,
    @Query() school?: string,
    @Query() conference?: string,
    @Query() position?: string,
  ): Promise<DraftPick[]> {
    return await getPicks(year, team, school, conference, position);
  }
}
