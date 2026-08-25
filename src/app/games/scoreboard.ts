import { randomUUID } from 'crypto';
import { Selectable } from 'kysely';
import { kdb } from '../../config/database';
import { getRedisClient } from '../../config/redis';
import { Scoreboard as ScoreboardRow } from '../../config/types/db';
import { DivisionClassification } from '../enums';
import { ScoreboardGame } from './types';

const SNAPSHOT_KEY = 'cfb-api:v1:scoreboard:snapshot';
const LOCK_KEY = 'cfb-api:v1:scoreboard:refresh-lock';
const SNAPSHOT_TTL_SECONDS = 60;
const LOCK_TTL_MS = 30_000;
const FOLLOWER_WAIT_MS = 5_000;
const FOLLOWER_POLL_MS = 50;

export interface ScoreboardSnapshotV1 {
  version: 1;
  generatedAt: string;
  games: Array<{
    homeConferenceAbbreviation: string | null;
    awayConferenceAbbreviation: string | null;
    response: ScoreboardGame;
  }>;
}

export interface ScoreboardRedis {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: { EX?: number; PX?: number; NX?: boolean },
  ): Promise<string | null>;
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
}

interface ScoreboardDependencies {
  redis?: ScoreboardRedis | null;
  queryAll?: () => Promise<Selectable<ScoreboardRow>[]>;
  queryFiltered?: (
    classification: DivisionClassification,
    conference?: string,
  ) => Promise<Selectable<ScoreboardRow>[]>;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}

const logCache = (
  outcome:
    | 'hit'
    | 'miss'
    | 'refresh_success'
    | 'refresh_failure'
    | 'lock_wait'
    | 'db_fallback',
  gameCount?: number,
): void => {
  console.info(
    JSON.stringify({
      event: 'scoreboard_cache',
      outcome,
      ...(gameCount === undefined ? {} : { gameCount }),
    }),
  );
};

export const mapScoreboardGame = (
  row: Selectable<ScoreboardRow>,
): ScoreboardGame => ({
  id: row.id,
  startDate: row.startDate,
  startTimeTBD: row.startTimeTbd ?? false,
  tv: row.tv,
  neutralSite: row.neutralSite,
  conferenceGame: row.conferenceGame ?? false,
  status: row.status as ScoreboardGame['status'],
  period: row.currentPeriod,
  clock: row.currentClock ? String(row.currentClock).substring(3) : null,
  situation: row.currentSituation,
  possession: row.currentPossession,
  lastPlay: row.lastPlay,
  venue: {
    name: row.venue,
    city: row.city,
    state: row.state,
  },
  homeTeam: {
    id: row.homeId,
    name: row.homeTeam,
    conference: row.homeConference,
    classification: row.homeClassification as DivisionClassification | null,
    points: row.homePoints,
    lineScores: row.homeLineScores,
    winProbability:
      row.homeWinProbability && row.status === 'in_progress'
        ? Math.round(Number(row.homeWinProbability) * 1000) / 1000
        : null,
  },
  awayTeam: {
    id: row.awayId,
    name: row.awayTeam,
    conference: row.awayConference,
    classification: row.awayClassification as DivisionClassification | null,
    points: row.awayPoints,
    lineScores: row.awayLineScores,
    winProbability:
      row.homeWinProbability && row.status === 'in_progress'
        ? Math.round((1 - Number(row.homeWinProbability)) * 1000) / 1000
        : null,
  },
  weather: {
    temperature: row.temperature ? parseFloat(row.temperature) : null,
    description: row.weatherDescription,
    windSpeed: row.windSpeed ? parseFloat(row.windSpeed) : null,
    windDirection: row.windDirection ? parseFloat(row.windDirection) : null,
  },
  betting: {
    spread: row.spread ? parseFloat(row.spread) : null,
    overUnder: row.overUnder ? parseFloat(row.overUnder) : null,
    homeMoneyline: row.moneylineHome,
    awayMoneyline: row.moneylineAway,
  },
});

const queryAllScoreboard = async (): Promise<Selectable<ScoreboardRow>[]> =>
  kdb.selectFrom('scoreboard').selectAll().execute();

const queryFilteredScoreboard = async (
  classification: DivisionClassification,
  conference?: string,
): Promise<Selectable<ScoreboardRow>[]> => {
  let query = kdb
    .selectFrom('scoreboard')
    .where((eb) =>
      eb.or([
        eb('homeClassification', '=', classification),
        eb('awayClassification', '=', classification),
      ]),
    )
    .selectAll();

  if (conference) {
    query = query.where((eb) =>
      eb.or([
        eb(
          eb.fn('lower', ['homeConferenceAbbreviation']),
          '=',
          conference.toLowerCase(),
        ),
        eb(
          eb.fn('lower', ['awayConferenceAbbreviation']),
          '=',
          conference.toLowerCase(),
        ),
      ]),
    );
  }

  return query.execute();
};

const createSnapshot = (
  rows: Selectable<ScoreboardRow>[],
  now: Date,
): ScoreboardSnapshotV1 => ({
  version: 1,
  generatedAt: now.toISOString(),
  games: rows.map((row) => ({
    homeConferenceAbbreviation: row.homeConferenceAbbreviation,
    awayConferenceAbbreviation: row.awayConferenceAbbreviation,
    response: mapScoreboardGame(row),
  })),
});

const parseSnapshot = (
  value: string | null,
  now: Date,
): ScoreboardSnapshotV1 | null => {
  if (!value) {
    return null;
  }

  try {
    const snapshot = JSON.parse(value) as Partial<ScoreboardSnapshotV1>;
    const generatedAt = Date.parse(snapshot.generatedAt ?? '');
    if (
      snapshot.version !== 1 ||
      !Array.isArray(snapshot.games) ||
      !Number.isFinite(generatedAt) ||
      generatedAt > now.getTime() ||
      now.getTime() - generatedAt > SNAPSHOT_TTL_SECONDS * 1000 ||
      snapshot.games.some(
        (game) =>
          !game ||
          typeof game !== 'object' ||
          !game.response ||
          typeof game.response !== 'object',
      )
    ) {
      return null;
    }
    for (const game of snapshot.games) {
      const startDate = new Date(game.response.startDate);
      if (Number.isNaN(startDate.getTime())) {
        return null;
      }
      game.response.startDate = startDate;
    }
    return snapshot as ScoreboardSnapshotV1;
  } catch {
    return null;
  }
};

export const filterScoreboardSnapshot = (
  snapshot: ScoreboardSnapshotV1,
  classification: DivisionClassification,
  conference?: string,
): ScoreboardGame[] => {
  const normalizedConference = conference?.toLowerCase();
  return snapshot.games
    .filter(({ response }) =>
      [
        response.homeTeam.classification,
        response.awayTeam.classification,
      ].includes(classification),
    )
    .filter(
      ({ homeConferenceAbbreviation, awayConferenceAbbreviation }) =>
        !normalizedConference ||
        homeConferenceAbbreviation?.toLowerCase() === normalizedConference ||
        awayConferenceAbbreviation?.toLowerCase() === normalizedConference,
    )
    .map(({ response }) => response);
};

const releaseLock = async (
  redis: ScoreboardRedis,
  owner: string,
): Promise<void> => {
  await redis.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    { keys: [LOCK_KEY], arguments: [owner] },
  );
};

const databaseFallback = async (
  classification: DivisionClassification,
  conference: string | undefined,
  queryFiltered: NonNullable<ScoreboardDependencies['queryFiltered']>,
): Promise<ScoreboardGame[]> => {
  logCache('db_fallback');
  return (await queryFiltered(classification, conference)).map(
    mapScoreboardGame,
  );
};

export const getScoreboard = async (
  classification: DivisionClassification = DivisionClassification.FBS,
  conference?: string,
  dependencies: ScoreboardDependencies = {},
): Promise<ScoreboardGame[]> => {
  const now = dependencies.now ?? (() => new Date());
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const queryAll = dependencies.queryAll ?? queryAllScoreboard;
  const queryFiltered = dependencies.queryFiltered ?? queryFilteredScoreboard;
  const redis =
    dependencies.redis === undefined
      ? ((await getRedisClient()) as ScoreboardRedis | null)
      : dependencies.redis;

  if (!redis) {
    return databaseFallback(classification, conference, queryFiltered);
  }

  try {
    const cached = parseSnapshot(await redis.get(SNAPSHOT_KEY), now());
    if (cached) {
      logCache('hit', cached.games.length);
      return filterScoreboardSnapshot(cached, classification, conference);
    }
    logCache('miss');

    const owner = randomUUID();
    const acquired = await redis.set(LOCK_KEY, owner, {
      NX: true,
      PX: LOCK_TTL_MS,
    });
    if (acquired) {
      try {
        const snapshot = createSnapshot(await queryAll(), now());
        try {
          await redis.set(SNAPSHOT_KEY, JSON.stringify(snapshot), {
            EX: SNAPSHOT_TTL_SECONDS,
          });
          logCache('refresh_success', snapshot.games.length);
        } catch {
          logCache('refresh_failure');
        }
        return filterScoreboardSnapshot(snapshot, classification, conference);
      } finally {
        try {
          await releaseLock(redis, owner);
        } catch {
          logCache('refresh_failure');
        }
      }
    }

    logCache('lock_wait');
    const deadline = now().getTime() + FOLLOWER_WAIT_MS;
    while (now().getTime() < deadline) {
      await sleep(FOLLOWER_POLL_MS);
      const published = parseSnapshot(await redis.get(SNAPSHOT_KEY), now());
      if (published) {
        logCache('hit', published.games.length);
        return filterScoreboardSnapshot(published, classification, conference);
      }
    }
  } catch {
    logCache('refresh_failure');
  }

  return databaseFallback(classification, conference, queryFiltered);
};
