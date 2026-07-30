import {
  Controller,
  Get,
  Middlewares,
  Query,
  Res,
  Response,
  Route,
  Tags,
  TsoaResponse,
} from 'tsoa';

import middlewares from '../../config/middleware';
import {
  getCoaches,
  getCoachProfile,
  getCoachSeasons,
  getCoachTenures,
} from './service';
import {
  Coach,
  CoachNotFound,
  CoachProfile,
  CoachTenure,
  DetailedCoachSeason,
} from './types';

type NotFoundResponse = TsoaResponse<404, CoachNotFound>;

const coachNotFound: CoachNotFound = {
  message: 'Coach not found',
};

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

  /**
   * Retrieves canonical coach identity and complete career totals
   * @param coachId Required coach ID
   * @isInt coachId
   */
  @Get('profile')
  @Response<{ message: string }>(400, 'Validation error')
  public async getCoachProfile(
    @Query() coachId: number,
    @Res() notFoundResponse: NotFoundResponse,
  ): Promise<CoachProfile> {
    const profile = await getCoachProfile(coachId);
    return profile ?? (notFoundResponse(404, coachNotFound) as never);
  }

  /**
   * Retrieves detailed coach-season records with attributed results and
   * whole-team season context
   * @param coachId Optional coach ID
   * @param team Optional team filter
   * @param year Optional exact season year
   * @param minYear Optional start year range filter
   * @param maxYear Optional end year range filter
   * @isInt coachId
   * @isInt year
   * @isInt minYear
   * @isInt maxYear
   */
  @Get('seasons')
  @Response<{ message: string }>(400, 'Validation error')
  public async getCoachSeasons(
    @Query() coachId?: number,
    @Query() team?: string,
    @Query() year?: number,
    @Query() minYear?: number,
    @Query() maxYear?: number,
  ): Promise<DetailedCoachSeason[]> {
    return await getCoachSeasons(coachId, team, year, minYear, maxYear);
  }

  /**
   * Retrieves continuous head-coaching stints and attributed records
   * @param coachId Optional coach ID
   * @param team Optional team filter
   * @param year Optional season year contained by the tenure
   * @param active Optional active-tenure filter
   * @isInt coachId
   * @isInt year
   */
  @Get('tenures')
  @Response<{ message: string }>(400, 'Validation error')
  public async getCoachTenures(
    @Query() coachId?: number,
    @Query() team?: string,
    @Query() year?: number,
    @Query() active?: boolean,
  ): Promise<CoachTenure[]> {
    return await getCoachTenures(coachId, team, year, active);
  }
}
