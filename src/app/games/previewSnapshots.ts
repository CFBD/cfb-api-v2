import {
  TeamSeasonSnapshotPayload,
  TeamSeasonPlayerPpa,
  TeamSeasonPlayerUsage,
} from '../teams/seasonOverviewTypes';
import { isTeamSeasonSnapshotPayload } from '../teams/seasonOverviewPayload';
import { formatSeasonAdvancedStats } from '../teams/seasonOverviewFormatting';
import {
  GamePreviewMetadata,
  PlayerSourceAvailability,
  PreviewKeyPlayer,
  PreviewKeyPlayers,
  PreviewSection,
  PreviewTeamStatistics,
} from './previewTypes';
import { optionalRead, previewRead, section } from './previewRead';
import { compare } from './previewEnrichment';

export interface PreviewSnapshotTeam {
  teamId: number;
  season: number;
  statistics: PreviewSection<PreviewTeamStatistics>;
  keyPlayers: PreviewKeyPlayers;
}
const availability = (
  status: PlayerSourceAvailability['status'],
  reason: PlayerSourceAvailability['reason'],
  sourceUpdatedAt: string | null,
): PlayerSourceAvailability => ({
  status,
  reason,
  sourceUpdatedAt,
  assembledAt: new Date().toISOString(),
});
const unique = <
  T extends { id: string; position: string | null; name: string | null },
>(
  rows: T[],
): Map<string, T> | null => {
  const result = new Map<string, T>();
  for (const row of rows) {
    const normalized = {
      ...row,
      position: row.position?.trim().toUpperCase() ?? null,
    };
    const existing = result.get(row.id);
    if (existing) {
      const { name: oldName, position: oldPosition, ...oldValues } = existing;
      const { name: newName, position: newPosition, ...newValues } = normalized;
      if (
        (oldPosition && newPosition && oldPosition !== newPosition) ||
        JSON.stringify(oldValues) !== JSON.stringify(newValues)
      )
        return null;
      result.set(row.id, {
        ...normalized,
        name: oldName ?? newName,
        position: oldPosition ?? newPosition,
      });
      continue;
    }
    result.set(row.id, normalized);
  }
  return result;
};
const descending = (a: number | null, b: number | null) =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : b - a;
export const projectPreviewPlayers = (
  season: number,
  payload: TeamSeasonSnapshotPayload | null,
  reason: 'no_data' | 'source_error' | 'invalid_data' | null,
  sourceUpdatedAt: string | null,
): PreviewKeyPlayers => {
  const ppa = payload ? unique<TeamSeasonPlayerPpa>(payload.players.ppa) : null;
  const usage = payload
    ? unique<TeamSeasonPlayerUsage>(payload.players.usage)
    : null;
  const source = (
    rows: Map<string, unknown> | null,
  ): PlayerSourceAvailability =>
    !payload
      ? availability(
          reason === 'no_data' ? 'no_data' : 'unavailable',
          reason,
          sourceUpdatedAt,
        )
      : rows === null
        ? availability('unavailable', 'invalid_data', sourceUpdatedAt)
        : availability(
            rows.size ? 'available' : 'no_data',
            rows.size ? null : 'no_data',
            sourceUpdatedAt,
          );
  const ppaStatus = source(ppa),
    usageStatus = source(usage);
  const group = (
    field: 'pass' | 'rush',
    positions: string[],
    limit: number,
  ): PreviewSection<PreviewKeyPlayer[]> => {
    const players: PreviewKeyPlayer[] = [];
    let conflict = false;
    for (const id of new Set([
      ...(ppa?.keys() ?? []),
      ...(usage?.keys() ?? []),
    ])) {
      const p = ppa?.get(id),
        u = usage?.get(id);
      if (p?.position && u?.position && p.position !== u.position) {
        conflict = true;
        continue;
      }
      const position = p?.position ?? u?.position ?? null;
      if (!position || !positions.includes(position)) continue;
      const relevantUsage = u?.usage[field] ?? null,
        average = p?.averagePPA[field] ?? null,
        total = p?.totalPPA[field] ?? null;
      if (
        !(
          (relevantUsage ?? 0) > 0 ||
          average !== null ||
          (total !== null && total !== 0)
        )
      )
        continue;
      players.push({
        athleteId: id,
        name: p?.name ?? u?.name ?? null,
        position,
        usage: relevantUsage,
        averagePPA: average,
        totalPPA: total,
      });
    }
    players.sort(
      (a, b) =>
        descending(a.usage, b.usage) ||
        descending(a.totalPPA, b.totalPPA) ||
        compare(a.athleteId, b.athleteId),
    );
    if (players.length)
      return section(players.slice(0, limit), null, sourceUpdatedAt);
    if (
      conflict ||
      ppaStatus.status === 'unavailable' ||
      usageStatus.status === 'unavailable'
    )
      return section(
        null,
        reason === 'source_error' ? 'source_error' : 'invalid_data',
        sourceUpdatedAt,
      );
    return section([], 'no_data', sourceUpdatedAt);
  };
  return {
    season,
    ppa: ppaStatus,
    usage: usageStatus,
    passing: group('pass', ['QB'], 2),
    rushing: group('rush', ['QB', 'RB', 'FB', 'WR', 'TE'], 3),
    receiving: group('pass', ['RB', 'FB', 'WR', 'TE'], 5),
  };
};
export const readPreviewSnapshots = async (
  game: GamePreviewMetadata,
  deadline: number,
): Promise<PreviewSnapshotTeam[]> => {
  const teams = [game.homeTeam, game.awayTeam];
  const read = (ids: number[], season: number) =>
    optionalRead(() =>
      previewRead(deadline, (db) =>
        db
          .selectFrom('teamSeasonSnapshot')
          .where('teamId', 'in', ids)
          .where('season', '=', season)
          .selectAll()
          .execute(),
      ),
    );
  const current = await read(
    teams.map((t) => t.id),
    game.season,
  );
  const missing = current.data
    ? teams
        .filter((t) => !current.data!.some((r) => r.teamId === t.id))
        .map((t) => t.id)
    : [];
  const previous = missing.length ? await read(missing, game.season - 1) : null;
  return teams.map((team) => {
    const currentRow = current.data?.find((r) => r.teamId === team.id);
    const selected =
      currentRow ?? previous?.data?.find((r) => r.teamId === team.id);
    let reason: 'no_data' | 'source_error' | 'invalid_data' | null = null;
    let payload: TeamSeasonSnapshotPayload | null = null;
    let sourceUpdatedAt: string | null = null;
    const source = currentRow ? current : (previous ?? current);
    if (!source.data)
      reason =
        source.reason === 'invalid_data' ? 'invalid_data' : 'source_error';
    else if (!selected) reason = 'no_data';
    else if (
      selected.formatVersion !== 1 ||
      !isTeamSeasonSnapshotPayload(
        selected.payload,
        selected.season,
        team.name,
      ) ||
      !Number.isFinite(new Date(selected.generatedAt).getTime())
    )
      reason = 'invalid_data';
    else {
      payload = selected.payload;
      sourceUpdatedAt = new Date(selected.generatedAt).toISOString();
    }
    const statistics = section(
      payload && selected
        ? {
            season: selected.season,
            isPreviousSeason: selected.season !== game.season,
            advanced: formatSeasonAdvancedStats(payload.advanced),
            passing: payload.passing,
            rushing: payload.rushing,
          }
        : null,
      reason,
      sourceUpdatedAt,
    );
    // A missing current row permits team fallback, never previous-season players.
    const playerReason = currentRow
      ? reason
      : current.data
        ? 'no_data'
        : 'source_error';
    return {
      teamId: team.id,
      season: game.season,
      statistics,
      keyPlayers: projectPreviewPlayers(
        game.season,
        currentRow ? payload : null,
        playerReason,
        currentRow ? sourceUpdatedAt : null,
      ),
    };
  });
};
