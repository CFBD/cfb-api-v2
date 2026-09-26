import { generateCodeSnippet } from '../../docs-site/sdk-snippets';

it('places preview IDs in the TypeScript path object and Python keyword arguments', () => {
  for (const operationId of ['GetGamePreview', 'GetAdjustedGamePreview']) {
    const options = {
      operation: { operationId },
      selectedServer: 'https://api.collegefootballdata.com',
    };
    const typescript = generateCodeSnippet({
      ...options,
      selectedLang: 'typescript',
    });
    expect(typescript).toContain('path: {');
    expect(typescript).toContain('gameId: 401520434');
    expect(typescript).not.toContain('query: {');
    expect(
      generateCodeSnippet({ ...options, selectedLang: 'python' }),
    ).toContain('game_id=401520434');
  }
});
it('preserves existing query examples and a no-argument default schedule', () => {
  const options = {
    selectedServer: 'https://api.collegefootballdata.com',
    selectedLang: 'typescript',
  };
  expect(
    generateCodeSnippet({ ...options, operation: { operationId: 'GetGames' } }),
  ).toContain('query: {');
  expect(
    generateCodeSnippet({
      ...options,
      operation: { operationId: 'GetGameSchedule' },
    }),
  ).toContain('await getGameSchedule();');
});
