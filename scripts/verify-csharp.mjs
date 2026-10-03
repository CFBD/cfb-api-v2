import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCSharp } from './generate-csharp.mjs';

const [, , spec, sdk] = process.argv;
if (!spec || !sdk)
  throw new Error('Usage: verify-csharp.mjs <spec.json> <sdk>');
const source = resolve(sdk, 'src');
const project = join(source, 'CollegeFootballData.csproj');
const temp = mkdtempSync(join(tmpdir(), 'cfbd-csharp-validation-'));
function run(args) {
  const result = spawnSync('dotnet', args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`dotnet ${args[0]} failed`);
}
function snapshot(path) {
  return Object.fromEntries(
    readdirSync(path, { recursive: true })
      .filter((file) => file.endsWith('.cs') || file === 'kiota-lock.json')
      .filter((file) => !/^(bin|obj)[/\\]/.test(file))
      .sort()
      .map((file) => [file, readFileSync(join(path, file), 'utf8')]),
  );
}
try {
  assert(!existsSync(join(source, 'Models/PlayoffCompetition/Cfp.cs')));
  const before = snapshot(source);
  generateCSharp(spec, sdk);
  assert.deepEqual(
    snapshot(source),
    before,
    'Repeated generation must be stable',
  );
  run(['build', project, '--configuration', 'Release']);
  run([
    'pack',
    project,
    '--configuration',
    'Release',
    '--no-build',
    '--output',
    join(temp, 'packages'),
  ]);
  const smoke = join(temp, 'smoke');
  cpSync(join(dirname(fileURLToPath(import.meta.url)), 'csharp-smoke'), smoke, {
    recursive: true,
  });
  run([
    'run',
    '--project',
    join(smoke, 'Smoke.csproj'),
    '--configuration',
    'Release',
    `-p:SdkProject=${project}`,
  ]);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
