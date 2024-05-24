import { Route, Middlewares, Tags, Controller, Get, Query } from 'tsoa';

import middlewares from '../../config/middleware';
import { DraftPick, DraftPosition, DraftTeam } from './types';
import { getPicks, getPositions, getTeams } from './service';

@Route('draft')
@Middlewares(middlewares.standard)
@Tags('draft')
export class DraftController extends Controller {
  /**
   * Retrieves list of NFL teams
   */
  @Get('teams')
  public async getDraftTeams(): Promise<DraftTeam[]> {
    return await getTeams();
  }

  /**
   * Retrieves list of player position categories for the NFL Draft
   */
  @Get('positions')
  public async getDraftPositions(): Promise<DraftPosition[]> {
    return await getPositions();
  }

  /**
   * Retrieve historical NFL draft data
   * @param year Optional year filter
   * @param team Optional NFL team filter
   * @param school Optional college team filter
   * @param conference Optional college conference filter
   * @param position Optional position classification filter
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
