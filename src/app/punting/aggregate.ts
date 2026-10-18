import { SeasonType } from '../enums';
import {
  PlayerPuntReturnProduction,
  PlayerPuntingGame,
  PlayerPuntingProduction,
  PlayerPuntingSeason,
  PuntingPlay,
  TeamPuntingGame,
  TeamPuntingProduction,
  TeamPuntingSeason,
} from './types';

/** Stored punt facts used by reductions; actor names are only read for players. */
export type PuntFacts = Pick<
  PuntingPlay,
  | 'gameId'
  | 'puntingTeamId'
  | 'receivingTeamId'
  | 'punterId'
  | 'punter'
  | 'receiverId'
  | 'receiver'
  | 'returnerId'
  | 'returner'
  | 'blockerId'
  | 'blocker'
  | 'countsAsPunt'
  | 'countsAsReturn'
  | 'puntYards'
  | 'returnYards'
  | 'returnerYards'
  | 'netPuntYards'
  | 'endYardline'
  | 'isTouchback'
  | 'isFairCatch'
  | 'isOutOfBounds'
  | 'isDowned'
  | 'isBlocked'
  | 'isMuffed'
  | 'isReturnTouchdown'
  | 'isReceivingTeamTurnover'
>;

/** Stored punt facts plus the internal accounting needed for reductions. */
export interface PuntEvent {
  play: PuntFacts;
  countsAsPlayerPunt: boolean | null;
  countsAsPlayerReturn: boolean | null;
  endingPossessionTeamId: number | null;
}

/** A completed game for a team selected by the aggregate filters. */
export interface PuntTeamGame {
  gameId: number;
  season: number;
  week: number;
  seasonType: SeasonType;
  startDate: string;
  teamId: number;
  team: string;
  conference: string | null;
  opponent: string;
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;

function yards(threshold: number) {
  let sum = 0,
    count = 0,
    over = 0,
    longest: number | null = null;
  return {
    add(value: number | null) {
      if (value === null) return;
      sum += value;
      count++;
      over += Number(value >= threshold);
      longest = longest === null ? value : Math.max(longest, value);
    },
    get available() {
      return count;
    },
    get total() {
      return count ? sum : null;
    },
    get average() {
      return count ? round(sum / count) : null;
    },
    get longest() {
      return longest;
    },
    get over() {
      return over;
    },
  };
}

const count = (events: PuntEvent[], test: (event: PuntEvent) => boolean) =>
  events.filter(test).length;

// Final receiving possession strictly inside its own 20, excluding touchbacks.
const inside20 = ({ play, endingPossessionTeamId }: PuntEvent) =>
  play.isTouchback === false &&
  endingPossessionTeamId === play.receivingTeamId &&
  play.endYardline !== null &&
  play.endYardline > 80;

function puntingProduction(events: PuntEvent[]): PlayerPuntingProduction {
  const gross = yards(50),
    net = yards(Infinity);
  for (const { play } of events) {
    gross.add(play.puntYards);
    net.add(play.netPuntYards);
  }
  return {
    punts: events.length,
    puntYardsAvailable: gross.available,
    puntYards: gross.total,
    yardsPerPunt: gross.average,
    longestPunt: gross.longest,
    punts50Plus: gross.over,
    netPuntYardsAvailable: net.available,
    netPuntYards: net.total,
    netYardsPerPunt: net.average,
    touchbacks: 0,
    fairCatches: 0,
    outOfBounds: 0,
    downed: 0,
    inside20: 0,
    blocked: 0,
  };
}

function outcomes(events: PuntEvent[]) {
  return {
    touchbacks: count(events, (e) => e.play.isTouchback === true),
    fairCatches: count(events, (e) => e.play.isFairCatch === true),
    outOfBounds: count(events, (e) => e.play.isOutOfBounds === true),
    downed: count(events, (e) => e.play.isDowned === true),
    inside20: count(events, inside20),
    blocked: count(events, (e) => e.play.isBlocked === true),
  };
}

function teamProduction(events: PuntEvent[]): TeamPuntingProduction {
  const returns = events.filter((e) => e.play.countsAsReturn === true);
  const returnYards = yards(20);
  for (const { play } of returns) returnYards.add(play.returnYards);
  return {
    ...puntingProduction(events),
    ...outcomes(events),
    returns: returns.length,
    returnYardsAvailable: returnYards.available,
    returnYards: returnYards.total,
    yardsPerReturn: returnYards.average,
    longestReturn: returnYards.longest,
    returns20Plus: returnYards.over,
    returnTouchdowns: count(events, (e) => e.play.isReturnTouchdown === true),
    muffs: count(events, (e) => e.play.isMuffed === true),
    receivingTeamTurnovers: count(
      events,
      (e) => e.play.isReceivingTeamTurnover === true,
    ),
  };
}

// A blocked kicker can have outcomes without individual punt credit.
function punterProduction(events: PuntEvent[]): PlayerPuntingProduction {
  return {
    ...puntingProduction(
      events.filter((event) => event.countsAsPlayerPunt === true),
    ),
    ...outcomes(events),
  };
}

function returnerProduction(
  events: PuntEvent[],
  playerId: string,
): PlayerPuntReturnProduction {
  const returns = events.filter(
    (e) => e.play.returnerId === playerId && e.countsAsPlayerReturn === true,
  );
  const fielded = events.filter((e) => e.play.receiverId === playerId);
  const returnYards = yards(20);
  for (const { play } of returns) returnYards.add(play.returnerYards);
  return {
    returns: returns.length,
    returnYardsAvailable: returnYards.available,
    returnYards: returnYards.total,
    yardsPerReturn: returnYards.average,
    longestReturn: returnYards.longest,
    returns20Plus: returnYards.over,
    returnTouchdowns: count(returns, (e) => e.play.isReturnTouchdown === true),
    fairCatches: count(fielded, (e) => e.play.isFairCatch === true),
    muffs: count(fielded, (e) => e.play.isMuffed === true),
    blocks: count(
      events,
      (e) => e.play.blockerId === playerId && e.play.isBlocked === true,
    ),
  };
}

const key = (gameId: number, teamId: number) => `${gameId}:${teamId}`;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function bySide(events: PuntEvent[], games: PuntTeamGame[]) {
  const selected = new Map(
    games.map((game) => [key(game.gameId, game.teamId), game]),
  );
  const sides = new Map<
    string,
    { punting: PuntEvent[]; returning: PuntEvent[] }
  >();
  for (const game of games)
    sides.set(key(game.gameId, game.teamId), { punting: [], returning: [] });
  for (const event of events) {
    if (event.play.countsAsPunt !== true) continue;
    const { gameId, puntingTeamId, receivingTeamId } = event.play;
    sides.get(key(gameId, puntingTeamId))?.punting.push(event);
    sides.get(key(gameId, receivingTeamId))?.returning.push(event);
  }
  return { selected, sides };
}

function teamGroups(
  events: PuntEvent[],
  games: PuntTeamGame[],
  byGame: boolean,
) {
  const { sides } = bySide(events, games);
  const groups = new Map<
    string,
    { game: PuntTeamGame; punting: PuntEvent[]; returning: PuntEvent[] }
  >();
  for (const game of games) {
    const id = byGame ? key(game.gameId, game.teamId) : String(game.teamId);
    const group = groups.get(id) ?? { game, punting: [], returning: [] };
    const side = sides.get(key(game.gameId, game.teamId))!;
    group.punting.push(...side.punting);
    group.returning.push(...side.returning);
    groups.set(id, group);
  }
  return [...groups.values()].map((group) => ({
    game: group.game,
    punting: teamProduction(group.punting),
    returning: teamProduction(group.returning),
  }));
}

export function aggregateTeamSeasons(
  events: PuntEvent[],
  games: PuntTeamGame[],
): TeamPuntingSeason[] {
  return teamGroups(events, games, false)
    .map(({ game, punting, returning }) => ({
      season: game.season,
      team: game.team,
      conference: game.conference,
      punting,
      returning,
    }))
    .sort((a, b) => compare(a.team, b.team));
}

export function aggregateTeamGames(
  events: PuntEvent[],
  games: PuntTeamGame[],
): TeamPuntingGame[] {
  return teamGroups(events, games, true)
    .sort(
      (a, b) =>
        compare(a.game.startDate, b.game.startDate) ||
        a.game.gameId - b.game.gameId ||
        compare(a.game.team, b.game.team),
    )
    .map(({ game, punting, returning }) => ({
      gameId: game.gameId,
      season: game.season,
      week: game.week,
      seasonType: game.seasonType,
      team: game.team,
      conference: game.conference,
      opponent: game.opponent,
      punting,
      returning,
    }));
}

function playerGroups(
  events: PuntEvent[],
  games: PuntTeamGame[],
  byGame: boolean,
  playerId?: string,
) {
  const { selected } = bySide(events, games);
  const groups = new Map<
    string,
    {
      game: PuntTeamGame;
      playerId: string;
      player: string;
      punting: PuntEvent[];
      returning: PuntEvent[];
    }
  >();
  const add = (
    event: PuntEvent,
    teamId: number,
    side: 'punting' | 'returning',
    roles: [string | null, string | null][],
  ) => {
    const game = selected.get(key(event.play.gameId, teamId));
    if (!game) return;
    for (const [id, name] of roles) {
      if (!id || !name || (playerId && playerId !== id)) continue;
      const groupKey = `${byGame ? event.play.gameId : ''}:${teamId}:${id}`;
      const group = groups.get(groupKey) ?? {
        game,
        playerId: id,
        player: name,
        punting: [],
        returning: [],
      };
      if (!group[side].includes(event)) group[side].push(event);
      groups.set(groupKey, group);
    }
  };
  for (const event of events) {
    const { play } = event;
    if (play.countsAsPunt !== true) continue;
    add(event, play.puntingTeamId, 'punting', [[play.punterId, play.punter]]);
    add(event, play.receivingTeamId, 'returning', [
      [play.receiverId, play.receiver],
      [play.returnerId, play.returner],
      [play.blockerId, play.blocker],
    ]);
  }
  return [...groups.values()].map((group) => ({
    game: group.game,
    playerId: group.playerId,
    player: group.player,
    punting: group.punting.length ? punterProduction(group.punting) : null,
    returning: group.returning.length
      ? returnerProduction(group.returning, group.playerId)
      : null,
  }));
}

export function aggregatePlayerSeasons(
  events: PuntEvent[],
  games: PuntTeamGame[],
  playerId?: string,
): PlayerPuntingSeason[] {
  return playerGroups(events, games, false, playerId)
    .map(({ game, playerId, player, punting, returning }) => ({
      season: game.season,
      playerId,
      player,
      team: game.team,
      conference: game.conference,
      punting,
      returning,
    }))
    .sort(
      (a, b) =>
        compare(a.team, b.team) ||
        compare(a.player, b.player) ||
        compare(a.playerId, b.playerId),
    );
}

export function aggregatePlayerGames(
  events: PuntEvent[],
  games: PuntTeamGame[],
  playerId?: string,
): PlayerPuntingGame[] {
  return playerGroups(events, games, true, playerId)
    .sort(
      (a, b) =>
        compare(a.game.startDate, b.game.startDate) ||
        a.game.gameId - b.game.gameId ||
        compare(a.game.team, b.game.team) ||
        compare(a.player, b.player) ||
        compare(a.playerId, b.playerId),
    )
    .map(({ game, playerId, player, punting, returning }) => ({
      gameId: game.gameId,
      season: game.season,
      week: game.week,
      seasonType: game.seasonType,
      playerId,
      player,
      team: game.team,
      conference: game.conference,
      opponent: game.opponent,
      punting,
      returning,
    }));
}
