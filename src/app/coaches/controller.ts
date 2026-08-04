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
   * Returns historical head coach records.
   * @param firstName Coach first name.
   * @param lastName Coach last name.
   * @param team Team name.
   * @param year Season year.
   * @param minYear Earliest season year to include.
   * @param maxYear Latest season year to include.
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
   * Returns a coach profile with canonical identity and career totals.
   * @param coachId Coach ID.
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
   * Returns coach-season records with attributed results and team context.
   * @param coachId Coach ID.
   * @param team Team name.
   * @param year Exact season year.
   * @param minYear Earliest season year to include.
   * @param maxYear Latest season year to include.
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
   * Returns continuous head-coaching tenures and their attributed records.
   * @param coachId Coach ID.
   * @param team Team name.
   * @param year Season year contained within the tenure.
   * @param active Filters by active status when specified.
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
