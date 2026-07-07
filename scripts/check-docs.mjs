import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const requiredFiles = [
  'AGENTS.md',
  'README.md',
  'ARCHITECTURE.md',
  'docs/index.md',
  'docs/QUALITY_SCORE.md',
  'docs/plans/index.md',
  'docs/references/index.md',
];
const ignoredDirs = new Set([
  '.git',
  'build',
  'coverage',
  'node_modules',
  '.pnpm-store',
]);
const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(path.join(repoRoot, file))) {
    failures.push(`Missing required documentation file: ${file}`);
  }
}

const agentsPath = path.join(repoRoot, 'AGENTS.md');
if (existsSync(agentsPath)) {
  const lineCount = readFileSync(agentsPath, 'utf8')
    .trimEnd()
    .split('\n').length;
  if (lineCount > 100) {
    failures.push(`AGENTS.md is ${lineCount} lines; keep it at or below 100.`);
  }
}

const markdownFiles = [];

const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(absolutePath);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      markdownFiles.push(absolutePath);
    }
  }
};

walk(repoRoot);

const isExternalHref = (href) =>
  href.startsWith('#') ||
  href.startsWith('//') ||
  /^[a-z][a-z0-9+.-]*:/i.test(href);

const parseHrefTarget = (rawHref) => {
  const href = rawHref.trim();

  if (!href) {
    return null;
  }

  if (href.startsWith('<')) {
    const endIndex = href.indexOf('>');
    return endIndex === -1 ? href.slice(1) : href.slice(1, endIndex);
  }

  return href.split(/\s+/)[0].replace(/^['"]|['"]$/g, '');
};

const stripFragmentAndQuery = (href) => href.split('#')[0].split('?')[0];

for (const file of markdownFiles) {
  const content = readFileSync(file, 'utf8');
  const linkPattern = /!?\[[^\]]*?\]\(([^)]+)\)/g;
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    const target = parseHrefTarget(match[1]);

    if (!target || isExternalHref(target)) {
      continue;
    }

    const localTarget = stripFragmentAndQuery(target);
    if (!localTarget) {
      continue;
    }

    const resolvedPath = path.resolve(path.dirname(file), localTarget);
    if (!existsSync(resolvedPath)) {
      failures.push(
        `${path.relative(repoRoot, file)} links to missing target: ${target}`,
      );
      continue;
    }

    try {
      statSync(resolvedPath);
    } catch {
      failures.push(
        `${path.relative(repoRoot, file)} links to unreadable target: ${target}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('Documentation check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Documentation check passed for ${markdownFiles.length} Markdown files.`,
);
