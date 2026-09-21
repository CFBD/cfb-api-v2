import { Kysely } from 'kysely';
import { DB } from '../../config/types/db';

type PgNumber = number | string;
type NullablePgNumber = PgNumber | null;

export const teamQuery = (db: Kysely<DB>, id: number) =>
  db
    .with('havoc', (db) =>
      db
        .selectFrom('gameHavocStats')
        .where('gameId', '=', id)
        .select([
          'team as school',
          'havocEvents as totalHavoc',
          'frontSevenHavocEvents as frontSevenHavoc',
          'dbHavocEvents as dbHavoc',
        ]),
    )
    .with('plays', (db) =>
      db
        .selectFrom('game as g')
        .innerJoin('drive as d', 'g.id', 'd.gameId')
        .innerJoin('play as p', (j) =>
          j.onRef('d.id', '=', 'p.driveId').on('p.ppa', 'is not', null),
        )
        .innerJoin('team as t', 'p.offenseId', 't.id')
        .innerJoin('gameTeam as gt', (j) =>
          j.onRef('g.id', '=', 'gt.gameId').onRef('gt.teamId', '=', 't.id'),
        )
        .leftJoin('havoc as h', (j) => j.onRef('t.school', '<>', 'h.school'))
        .where('g.id', '=', id)
        .select([
          't.school as team',
          'gt.homeAway',
          'gt.points',
          'gt.winner',
          'g.excitement',
          'gt.winProb',
          'p.period',
          'p.down',
          'p.distance',
          'p.yardsGained',
          'p.ppa',
        ])
        .select((eb) => [
          eb
            .case()
            .when(
              eb.or([
                eb.and([eb('p.down', '=', 2), eb('p.distance', '>=', 8)]),
                eb.and([eb('p.down', 'in', [3, 4]), eb('p.distance', '>=', 5)]),
              ]),
            )
            .then('passing')
            .else('standard')
            .end()
            .as('downType'),
          eb
            .case()
            .when('p.playTypeId', 'in', [20, 26, 34, 36, 37, 38, 39, 63])
            .then(false)
            .when('p.scoring', '=', true)
            .then(true)
            .when(
              eb.and([
                eb('p.down', '=', 1),
                eb(
                  eb(
                    eb.cast<PgNumber>('p.yardsGained', 'numeric'),
                    '/',
                    eb.ref('p.distance'),
                  ),
                  '>=',
                  0.5,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('p.down', '=', 2),
                eb(
                  eb(
                    eb.cast<PgNumber>('p.yardsGained', 'numeric'),
                    '/',
                    eb.ref('p.distance'),
                  ),
                  '>=',
                  0.7,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('p.down', 'in', [3, 4]),
                eb('p.yardsGained', '>=', eb.ref('p.distance')),
              ]),
            )
            .then(true)
            .else(false)
            .end()
            .as('success'),
          eb
            .case()
            .when('p.playTypeId', 'in', [3, 4, 6, 7, 24, 26, 36, 51, 67])
            .then('Pass')
            .when('p.playTypeId', 'in', [5, 9, 29, 39, 68])
            .then('Rush')
            .else('Other')
            .end()
            .as('playType'),
          eb
            .case()
            .when(
              eb.and([
                eb('p.period', '=', 2),
                eb('p.scoring', '=', false),
                eb(
                  eb.fn('abs', [
                    eb(eb.ref('p.homeScore'), '-', eb.ref('p.awayScore')),
                  ]),
                  '>',
                  38,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('p.period', '=', 3),
                eb('p.scoring', '=', false),
                eb(
                  eb.fn('abs', [
                    eb(eb.ref('p.homeScore'), '-', eb.ref('p.awayScore')),
                  ]),
                  '>',
                  28,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('p.period', '=', 4),
                eb('p.scoring', '=', false),
                eb(
                  eb.fn('abs', [
                    eb(eb.ref('p.homeScore'), '-', eb.ref('p.awayScore')),
                  ]),
                  '>',
                  22,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('p.period', '=', 2),
                eb('p.scoring', '=', true),
                eb(
                  eb.fn('abs', [
                    eb(eb.ref('p.homeScore'), '-', eb.ref('p.awayScore')),
                  ]),
                  '>',
                  45,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('p.period', '=', 3),
                eb('p.scoring', '=', true),
                eb(
                  eb.fn('abs', [
                    eb(eb.ref('p.homeScore'), '-', eb.ref('p.awayScore')),
                  ]),
                  '>',
                  35,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('p.period', '=', 4),
                eb('p.scoring', '=', true),
                eb(
                  eb.fn('abs', [
                    eb(eb.ref('p.homeScore'), '-', eb.ref('p.awayScore')),
                  ]),
                  '>',
                  29,
                ),
              ]),
            )
            .then(true)
            .else(false)
            .end()
            .as('garbageTime'),
          eb.fn.coalesce('h.totalHavoc', eb.lit<number>(0)).as('totalHavoc'),
          eb.fn
            .coalesce('h.frontSevenHavoc', eb.lit<number>(0))
            .as('frontSevenHavoc'),
          eb.fn.coalesce('h.dbHavoc', eb.lit<number>(0)).as('dbHavoc'),
        ]),
    )
    .selectFrom('plays')
    .where('garbageTime', '=', false)
    .groupBy([
      'team',
      'homeAway',
      'points',
      'winner',
      'excitement',
      'winProb',
      'totalHavoc',
      'frontSevenHavoc',
      'dbHavoc',
    ])
    .orderBy('team')
    .select(['team', 'homeAway', 'points', 'winner', 'excitement', 'winProb'])
    .select((eb) => {
      const rushes = eb.fn
        .countAll<PgNumber>()
        .filterWhere('playType', '=', 'Rush');
      const rushDenominator = eb.fn.coalesce(
        eb.fn<PgNumber>('nullif', [rushes, eb.lit<number>(0)]),
        eb.lit<number>(1),
      );
      const lineYards = eb.fn
        .sum<PgNumber>(
          eb
            .case()
            .when('yardsGained', '<=', 0)
            .then(eb(eb.ref('yardsGained'), '*', eb.lit<number>(1.2)))
            .when('yardsGained', '<', 5)
            .then(eb.ref('yardsGained'))
            .when('yardsGained', '<', 11)
            .then(
              eb(
                eb.lit<number>(4),
                '+',
                eb(
                  eb.parens(eb(eb.ref('yardsGained'), '-', eb.lit<number>(4))),
                  '*',
                  eb.lit<number>(0.5),
                ),
              ),
            )
            .else(7)
            .end(),
        )
        .filterWhere('playType', '=', 'Rush');
      const secondLevel = eb.fn
        .sum<PgNumber>(
          eb
            .case()
            .when('yardsGained', '>=', 10)
            .then(5)
            .else(eb(eb.ref('yardsGained'), '-', eb.lit<number>(5)))
            .end(),
        )
        .filterWhere('yardsGained', '>=', 5)
        .filterWhere('playType', '=', 'Rush');
      const openField = eb.fn
        .sum<PgNumber>(eb(eb.ref('yardsGained'), '-', eb.lit<number>(10)))
        .filterWhere('playType', '=', 'Rush')
        .filterWhere('yardsGained', '>=', 10);
      return [
        eb.fn.countAll<PgNumber>().as('plays'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(eb.fn.avg<PgNumber>('ppa'), 'numeric'),
            eb.lit<number>(4),
          ])
          .as('ppa'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.avg<PgNumber>('ppa').filterWhere('period', '=', 1),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('ppa1'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.avg<PgNumber>('ppa').filterWhere('period', '=', 2),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('ppa2'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.avg<PgNumber>('ppa').filterWhere('period', '=', 3),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('ppa3'),
        eb.fn
          .coalesce(
            eb.fn<NullablePgNumber>('round', [
              eb.cast<PgNumber>(
                eb.fn.avg<PgNumber>('ppa').filterWhere('period', '=', 4),
                'numeric',
              ),
              eb.lit<number>(3),
            ]),
            eb.lit<number>(0),
          )
          .as('ppa4'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.avg<PgNumber>('ppa').filterWhere('playType', '=', 'Pass'),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('passingPpa'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Pass')
                .filterWhere('period', '=', 1),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('passingPpa1'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Pass')
                .filterWhere('period', '=', 2),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('passingPpa2'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Pass')
                .filterWhere('period', '=', 3),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('passingPpa3'),
        eb.fn
          .coalesce(
            eb.fn<NullablePgNumber>('round', [
              eb.cast<PgNumber>(
                eb.fn
                  .avg<PgNumber>('ppa')
                  .filterWhere('playType', '=', 'Pass')
                  .filterWhere('period', '=', 4),
                'numeric',
              ),
              eb.lit<number>(3),
            ]),
            eb.lit<number>(0),
          )
          .as('passingPpa4'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.avg<PgNumber>('ppa').filterWhere('playType', '=', 'Rush'),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('rushingPpa'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Rush')
                .filterWhere('period', '=', 1),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('rushingPpa1'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Rush')
                .filterWhere('period', '=', 2),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('rushingPpa2'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Rush')
                .filterWhere('period', '=', 3),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('rushingPpa3'),
        eb.fn
          .coalesce(
            eb.fn<NullablePgNumber>('round', [
              eb.cast<PgNumber>(
                eb.fn
                  .avg<PgNumber>('ppa')
                  .filterWhere('playType', '=', 'Rush')
                  .filterWhere('period', '=', 4),
                'numeric',
              ),
              eb.lit<number>(3),
            ]),
            eb.lit<number>(0),
          )
          .as('rushingPpa4'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(eb.fn.sum<PgNumber>('ppa'), 'numeric'),
            eb.lit<number>(1),
          ])
          .as('cumPpa'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.sum<PgNumber>('ppa').filterWhere('period', '=', 1),
              'numeric',
            ),
            eb.lit<number>(1),
          ])
          .as('cumPpa1'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.sum<PgNumber>('ppa').filterWhere('period', '=', 2),
              'numeric',
            ),
            eb.lit<number>(1),
          ])
          .as('cumPpa2'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.sum<PgNumber>('ppa').filterWhere('period', '=', 3),
              'numeric',
            ),
            eb.lit<number>(1),
          ])
          .as('cumPpa3'),
        eb.fn
          .coalesce(
            eb.fn<NullablePgNumber>('round', [
              eb.cast<PgNumber>(
                eb.fn.sum<PgNumber>('ppa').filterWhere('period', '=', 4),
                'numeric',
              ),
              eb.lit<number>(1),
            ]),
            eb.lit<number>(0),
          )
          .as('cumPpa4'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.sum<PgNumber>('ppa').filterWhere('playType', '=', 'Pass'),
              'numeric',
            ),
            eb.lit<number>(1),
          ])
          .as('cumPassingPpa'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .sum<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Pass')
                .filterWhere('period', '=', 1),
              'numeric',
            ),
            eb.lit<number>(1),
          ])
          .as('cumPassingPpa1'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .sum<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Pass')
                .filterWhere('period', '=', 2),
              'numeric',
            ),
            eb.lit<number>(1),
          ])
          .as('cumPassingPpa2'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .sum<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Pass')
                .filterWhere('period', '=', 3),
              'numeric',
            ),
            eb.lit<number>(1),
          ])
          .as('cumPassingPpa3'),
        eb.fn
          .coalesce(
            eb.fn<NullablePgNumber>('round', [
              eb.cast<PgNumber>(
                eb.fn
                  .sum<PgNumber>('ppa')
                  .filterWhere('playType', '=', 'Pass')
                  .filterWhere('period', '=', 4),
                'numeric',
              ),
              eb.lit<number>(1),
            ]),
            eb.lit<number>(0),
          )
          .as('cumPassingPpa4'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.sum<PgNumber>('ppa').filterWhere('playType', '=', 'Rush'),
              'numeric',
            ),
            eb.lit<number>(1),
          ])
          .as('cumRushingPpa'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .sum<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Rush')
                .filterWhere('period', '=', 1),
              'numeric',
            ),
            eb.lit<number>(1),
          ])
          .as('cumRushingPpa1'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .sum<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Rush')
                .filterWhere('period', '=', 2),
              'numeric',
            ),
            eb.lit<number>(1),
          ])
          .as('cumRushingPpa2'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .sum<PgNumber>('ppa')
                .filterWhere('playType', '=', 'Rush')
                .filterWhere('period', '=', 3),
              'numeric',
            ),
            eb.lit<number>(1),
          ])
          .as('cumRushingPpa3'),
        eb.fn
          .coalesce(
            eb.fn<NullablePgNumber>('round', [
              eb.cast<PgNumber>(
                eb.fn
                  .sum<PgNumber>('ppa')
                  .filterWhere('playType', '=', 'Rush')
                  .filterWhere('period', '=', 4),
                'numeric',
              ),
              eb.lit<number>(1),
            ]),
            eb.lit<number>(0),
          )
          .as('cumRushingPpa4'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.avg<PgNumber>(
                eb.case().when('success', '=', true).then(1).else(0).end(),
              ),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('successRate'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('period', '=', 1),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('successRate1'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('period', '=', 2),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('successRate2'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('period', '=', 3),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('successRate3'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('period', '=', 4),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('successRate4'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('downType', '=', 'standard'),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('standardSuccessRate'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('downType', '=', 'standard')
                .filterWhere('period', '=', 1),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('standardSuccessRate1'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('downType', '=', 'standard')
                .filterWhere('period', '=', 2),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('standardSuccessRate2'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('downType', '=', 'standard')
                .filterWhere('period', '=', 3),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('standardSuccessRate3'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('downType', '=', 'standard')
                .filterWhere('period', '=', 4),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('standardSuccessRate4'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('downType', '=', 'passing'),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('passingSuccessRate'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('downType', '=', 'passing')
                .filterWhere('period', '=', 1),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('passingSuccessRate1'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('downType', '=', 'passing')
                .filterWhere('period', '=', 2),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('passingSuccessRate2'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('downType', '=', 'passing')
                .filterWhere('period', '=', 3),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('passingSuccessRate3'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>(
                  eb.case().when('success', '=', true).then(1).else(0).end(),
                )
                .filterWhere('downType', '=', 'passing')
                .filterWhere('period', '=', 4),
              'numeric',
            ),
            eb.lit<number>(3),
          ])
          .as('passingSuccessRate4'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn.avg<PgNumber>('ppa').filterWhere('success', '=', true),
              'numeric',
            ),
            eb.lit<number>(2),
          ])
          .as('explosiveness'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>('ppa')
                .filterWhere('success', '=', true)
                .filterWhere('period', '=', 1),
              'numeric',
            ),
            eb.lit<number>(2),
          ])
          .as('explosiveness1'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>('ppa')
                .filterWhere('success', '=', true)
                .filterWhere('period', '=', 2),
              'numeric',
            ),
            eb.lit<number>(2),
          ])
          .as('explosiveness2'),
        eb
          .fn<NullablePgNumber>('round', [
            eb.cast<PgNumber>(
              eb.fn
                .avg<PgNumber>('ppa')
                .filterWhere('success', '=', true)
                .filterWhere('period', '=', 3),
              'numeric',
            ),
            eb.lit<number>(2),
          ])
          .as('explosiveness3'),
        eb.fn
          .coalesce(
            eb.fn<NullablePgNumber>('round', [
              eb.cast<PgNumber>(
                eb.fn
                  .avg<PgNumber>('ppa')
                  .filterWhere('success', '=', true)
                  .filterWhere('period', '=', 4),
                'numeric',
              ),
              eb.lit<number>(2),
            ]),
            eb.lit<number>(0),
          )
          .as('explosiveness4'),
        eb
          .fn<PgNumber>('round', [
            eb(
              eb.cast<PgNumber>(
                eb.fn
                  .countAll<PgNumber>()
                  .filterWhere('distance', '<=', 2)
                  .filterWhere('playType', '=', 'Rush')
                  .filterWhere('success', '=', true),
                'numeric',
              ),
              '/',
              eb.fn.coalesce(
                eb.fn<PgNumber>('nullif', [
                  rushes.filterWhere('distance', '<=', 2),
                  eb.lit<number>(0),
                ]),
                eb.lit<number>(1),
              ),
            ),
            eb.lit<number>(3),
          ])
          .as('powerSuccess'),
        eb
          .fn<PgNumber>('round', [
            eb(
              eb.cast<PgNumber>(
                rushes.filterWhere('yardsGained', '<=', 0),
                'numeric',
              ),
              '/',
              rushDenominator,
            ),
            eb.lit<number>(3),
          ])
          .as('stuffRate'),
        eb
          .fn<PgNumber>('round', [
            eb.fn.coalesce(
              eb.cast<PgNumber>(lineYards, 'numeric'),
              eb.lit<number>(0),
            ),
            eb.lit<number>(0),
          ])
          .as('lineYards'),
        eb.fn
          .coalesce(
            eb.cast<PgNumber>(secondLevel, 'numeric'),
            eb.lit<number>(0),
          )
          .as('secondLevelYards'),
        eb.fn
          .coalesce(eb.cast<PgNumber>(openField, 'numeric'), eb.lit<number>(0))
          .as('openFieldYards'),
        eb.fn
          .coalesce(
            eb.fn<PgNumber>('round', [
              eb(eb.cast<PgNumber>(lineYards, 'numeric'), '/', rushDenominator),
              eb.lit<number>(1),
            ]),
            eb.lit<number>(0),
          )
          .as('lineYardsAvg'),
        eb.fn
          .coalesce(
            eb.fn<PgNumber>('round', [
              eb(
                eb.cast<PgNumber>(secondLevel, 'numeric'),
                '/',
                rushDenominator,
              ),
              eb.lit<number>(1),
            ]),
            eb.lit<number>(0),
          )
          .as('secondLevelYardsAvg'),
        eb.fn
          .coalesce(
            eb.fn<PgNumber>('round', [
              eb(eb.cast<PgNumber>(openField, 'numeric'), '/', rushDenominator),
              eb.lit<number>(1),
            ]),
            eb.lit<number>(0),
          )
          .as('openFieldYardsAvg'),
        eb
          .fn<PgNumber>('round', [
            eb(
              eb.cast<PgNumber>('totalHavoc', 'numeric'),
              '/',
              eb.fn.countAll<PgNumber>(),
            ),
            eb.lit<number>(3),
          ])
          .as('totalHavoc'),
        eb
          .fn<PgNumber>('round', [
            eb(
              eb.cast<PgNumber>('dbHavoc', 'numeric'),
              '/',
              eb.fn.countAll<PgNumber>(),
            ),
            eb.lit<number>(3),
          ])
          .as('dbHavoc'),
        eb
          .fn<PgNumber>('round', [
            eb(
              eb.cast<PgNumber>('frontSevenHavoc', 'numeric'),
              '/',
              eb.fn.countAll<PgNumber>(),
            ),
            eb.lit<number>(3),
          ])
          .as('frontSevenHavoc'),
      ];
    });

export const scoringQuery = (db: Kysely<DB>, id: number) =>
  db
    .with('drives', (db) =>
      db
        .selectFrom('game as g')
        .innerJoin('gameTeam as gt', (j) =>
          j.onRef('g.id', '=', 'gt.gameId').on('gt.homeAway', '=', 'home'),
        )
        .innerJoin('gameTeam as gt2', (j) =>
          j.onRef('g.id', '=', 'gt2.gameId').onRef('gt2.id', '<>', 'gt.id'),
        )
        .innerJoin('team as t', (j) =>
          j.on((eb) =>
            eb.or([
              eb('t.id', '=', eb.ref('gt.teamId')),
              eb('t.id', '=', eb.ref('gt2.teamId')),
            ]),
          ),
        )
        .innerJoin('drive as d', 'g.id', 'd.gameId')
        .innerJoin('play as p', 'd.id', 'p.driveId')
        .where('g.id', '=', id)
        .where('d.startPeriod', '<', 5)
        .select(['g.season', 'p.driveId'])
        .select((eb) =>
          eb.fn
            .min<number>(
              eb
                .case()
                .when('gt.teamId', '=', eb.ref('p.offenseId'))
                .then(eb(eb.lit<number>(100), '-', eb.ref('p.yardLine')))
                .else(eb.ref('p.yardLine'))
                .end(),
            )
            .as('minYards'),
        )
        .groupBy(['g.season', 'p.driveId']),
    )
    .with('drivePoints', (db) =>
      db
        .selectFrom('team as t')
        .innerJoin('drive as d', (j) =>
          j.on((eb) =>
            eb.or([
              eb('t.id', '=', eb.ref('d.offenseId')),
              eb('t.id', '=', eb.ref('d.defenseId')),
            ]),
          ),
        )
        .innerJoin('drives as dr', 'd.id', 'dr.driveId')
        .where('dr.minYards', '<=', 40)
        .select(['t.school as team', 'dr.season'])
        .select((eb) => [
          eb
            .case()
            .when('d.offenseId', '=', eb.ref('t.id'))
            .then('offense')
            .else('defense')
            .end()
            .as('unit'),
          eb
            .case()
            .when(
              eb.and([
                eb('d.scoring', '=', true),
                eb('d.resultId', 'in', [12, 20, 24, 26]),
              ]),
            )
            .then(7)
            .when(
              eb.and([eb('d.scoring', '=', true), eb('d.resultId', '=', 30)]),
            )
            .then(3)
            .when('d.resultId', 'in', [4, 10, 15, 42, 46])
            .then(-7)
            .when('d.resultId', '=', 6)
            .then(-2)
            .else(0)
            .end()
            .as('points'),
        ]),
    )
    .selectFrom('drivePoints')
    .select(['team', 'unit'])
    .groupBy(['season', 'team', 'unit'])
    .select((eb) => [
      eb.fn.countAll<PgNumber>().as('opportunities'),
      eb
        .fn<PgNumber>('round', [
          eb.fn.avg<PgNumber>('points'),
          eb.lit<number>(2),
        ])
        .as('avgPoints'),
      eb.fn.sum<PgNumber>('points').as('points'),
    ]);

const fieldDrives = (db: Kysely<DB>, id: number, offense: boolean) =>
  db
    .selectFrom('game as g')
    .leftJoin('drive as d', (j) =>
      j
        .onRef('g.id', '=', 'd.gameId')
        .on('d.startPeriod', '<', 5)
        .on('d.resultId', 'not in', [28, 41, 43, 44, 57]),
    )
    .leftJoin('gameTeam as gt', (j) =>
      j
        .onRef('g.id', '=', 'gt.gameId')
        .onRef('gt.teamId', '=', offense ? 'd.offenseId' : 'd.defenseId'),
    )
    .leftJoin('team as t', offense ? 'd.offenseId' : 'd.defenseId', 't.id')
    .leftJoin('conferenceTeam as ct', (j) =>
      j
        .onRef('t.id', '=', 'ct.teamId')
        .on('ct.endYear', 'is', null)
        .on('ct.startYear', 'is not', null),
    )
    .leftJoin('ppa', (j) =>
      j
        .on('ppa.down', '=', 1)
        .on('ppa.distance', '=', 10)
        .on((eb) =>
          eb.or([
            eb.and([
              eb('gt.homeAway', '=', offense ? 'home' : 'away'),
              eb(
                eb(eb.lit<number>(100), '-', eb.ref('d.startYardline')),
                '=',
                eb.ref('ppa.yardLine'),
              ),
            ]),
            eb.and([
              eb('gt.homeAway', '=', offense ? 'away' : 'home'),
              eb('d.startYardline', '=', eb.ref('ppa.yardLine')),
            ]),
          ]),
        ),
    )
    .where('g.id', '=', id)
    .groupBy('t.id')
    .select('t.id as teamId')
    .select((eb) => [
      eb.fn
        .avg<PgNumber>(
          eb
            .case()
            .when('gt.homeAway', '=', offense ? 'home' : 'away')
            .then(eb(eb.lit<number>(100), '-', eb.ref('d.startYardline')))
            .else(eb.ref('d.startYardline'))
            .end(),
        )
        .as('driveStart'),
      eb.fn.avg<PgNumber>('ppa.predictedPoints').as('ppa'),
    ]);

export const fieldPositionQuery = (db: Kysely<DB>, id: number) =>
  db
    .selectFrom('team as t')
    .innerJoin(fieldDrives(db, id, true).as('o'), 'o.teamId', 't.id')
    .innerJoin(fieldDrives(db, id, false).as('d'), 'd.teamId', 't.id')
    .select('t.school')
    .select((eb) => [
      eb
        .fn<PgNumber>('round', [eb.ref('o.driveStart'), eb.lit<number>(1)])
        .as('avgStartOff'),
      eb
        .fn<PgNumber>('round', [eb.ref('o.ppa'), eb.lit<number>(2)])
        .as('avgPredictedPointsOff'),
    ]);

export const playerQuery = (db: Kysely<DB>, id: number) =>
  db
    .selectFrom('playerUsageStatsFiltered')
    .where('gameId', '=', id)
    .selectAll()
    .orderBy('school')
    .orderBy('name');
