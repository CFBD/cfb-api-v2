import { Route, Middlewares, Tags, Controller, Get, Query } from 'tsoa';

import middlewares from '../../config/middleware';
import { Coach } from './types';
import { getCoaches } from './service';

@Route('coaches')
@Middlewares(middlewares.standard)
@Tags('coaches')
export class CoachesController extends Controller {
  /**
   * Retrieves historical head coach information and records
   * @param firstName Optional first name filter
   * @param lastName Optional last name filter
   * @param team Optional team filter
   * @param year Optional year filter
   * @param minYear Optional start year range filter
   * @param maxYear Optional end year range filter
   * @isInt year
   * @isInt minYear
   * @isInt maxYear
   */
  @Get()
  public async getCoaches(
    @Query() firstName?: string,
    @Query() lastName?: string,
    @Query() team?: string,
    @Query() year?: number,
    @Query() minYear?: number,
    @Query() maxYear?: number,
  ): Promise<Coach[]> {
    return await getCoaches(firstName, lastName, team, year, minYear, maxYear);
  }
}
