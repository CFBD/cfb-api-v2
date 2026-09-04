import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const swaggerPath = path.join(repoRoot, 'build/swagger.json');
const siteRoot = path.join(repoRoot, 'docs-site/dist');
const siteOrigin = 'https://api.collegefootballdata.com';
const operationMethods = new Set([
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
]);

const fail = (message) => {
  throw new Error(`Documentation build verification failed: ${message}`);
};

const requireFile = (filePath, description) => {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    fail(`missing ${description} at ${path.relative(repoRoot, filePath)}`);
  }

  if (statSync(filePath).size === 0) {
    fail(`${description} is empty at ${path.relative(repoRoot, filePath)}`);
  }
};

requireFile(swaggerPath, 'generated OpenAPI document');

let openapi;
try {
  openapi = JSON.parse(readFileSync(swaggerPath, 'utf8'));
} catch (error) {
  fail(`cannot parse build/swagger.json: ${error.message}`);
}

if (typeof openapi.openapi !== 'string' || !openapi.openapi.startsWith('3.')) {
  fail('build/swagger.json must use OpenAPI 3.x');
}

const hasProductionServer = openapi.servers?.some(
  (server) => server.url === 'https://api.collegefootballdata.com/',
);
if (!hasProductionServer) {
  fail('OpenAPI servers must include https://api.collegefootballdata.com/');
}

const apiKeyScheme = openapi.components?.securitySchemes?.apiKey;
if (
  apiKeyScheme?.type !== 'http' ||
  apiKeyScheme.scheme?.toLowerCase() !== 'bearer'
) {
  fail('components.securitySchemes.apiKey must be an HTTP bearer scheme');
}

const operations = [];
for (const [routePath, pathItem] of Object.entries(openapi.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (operationMethods.has(method.toLowerCase())) {
      operations.push({ method, operation, routePath });
    }
  }
}

if (operations.length === 0) {
  fail('build/swagger.json contains no operations');
}

const operationIds = new Set();
for (const { method, operation, routePath } of operations) {
  if (
    typeof operation.operationId !== 'string' ||
    operation.operationId.trim() === ''
  ) {
    fail(`${method.toUpperCase()} ${routePath} has no operationId`);
  }

  if (operationIds.has(operation.operationId)) {
    fail(`duplicate operationId: ${operation.operationId}`);
  }
  operationIds.add(operation.operationId);

  const security = operation.security ?? openapi.security;
  const intentionallyPublic = Array.isArray(operation.security)
    ? operation.security.length === 0
    : false;
  const usesApiKey = security?.some((requirement) =>
    Object.hasOwn(requirement, 'apiKey'),
  );
  if (!intentionallyPublic && !usesApiKey) {
    fail(
      `${method.toUpperCase()} ${routePath} has no apiKey security requirement`,
    );
  }
}

const pathCount = Object.keys(openapi.paths ?? {}).length;
const schemaCount = Object.keys(openapi.components?.schemas ?? {}).length;
if (schemaCount === 0) {
  fail('build/swagger.json contains no component schemas');
}

requireFile(path.join(siteRoot, 'index.html'), 'Zudoku index');

const authoredRoutes = [
  'getting-started.html',
  'authentication.html',
  'usage-and-access.html',
  'data-availability.html',
  'methodology-overview.html',
  'metrics-and-definitions.html',
  'ppa.html',
  'win-probability.html',
  'wepa.html',
  'elo-ratings.html',
  'srs-ratings.html',
  'core-ratings.html',
  'libraries/python.html',
  'libraries/typescript.html',
];
for (const route of authoredRoutes) {
  const routePath = path.join(siteRoot, route);
  requireFile(routePath, `authored route ${route}`);

  const html = readFileSync(routePath, 'utf8');
  const cleanRoute = route.replace(/\.html$/, '');
  const canonicalUrl = `${siteOrigin}/${cleanRoute}`;
  const h1Count = html.match(/<h1\b/g)?.length ?? 0;

  if (!html.match(/<title>[^<]+<\/title>/)) {
    fail(`${route} has no document title`);
  }
  if (!html.match(/<meta name="description" content="[^"]+">/)) {
    fail(`${route} has no meta description`);
  }
  if (!html.includes(`<link rel="canonical" href="${canonicalUrl}">`)) {
    fail(`${route} has no canonical URL for ${canonicalUrl}`);
  }
  if (!html.includes('property="og:title"')) {
    fail(`${route} has no Open Graph title`);
  }
  if (!html.includes('name="twitter:card"')) {
    fail(`${route} has no Twitter card metadata`);
  }
  if (h1Count !== 1) {
    fail(`${route} must contain one h1; found ${h1Count}`);
  }
}

const robotsPath = path.join(siteRoot, 'robots.txt');
requireFile(robotsPath, 'robots.txt');
const robots = readFileSync(robotsPath, 'utf8');
if (!robots.includes(`Sitemap: ${siteOrigin}/sitemap.xml`)) {
  fail('robots.txt does not advertise the canonical sitemap');
}

const sitemapPath = path.join(siteRoot, 'sitemap.xml');
requireFile(sitemapPath, 'sitemap');
const sitemap = readFileSync(sitemapPath, 'utf8');
for (const route of authoredRoutes) {
  const cleanRoute = route.replace(/\.html$/, '');
  if (!sitemap.includes(`<loc>${siteOrigin}/${cleanRoute}</loc>`)) {
    fail(`sitemap does not include /${cleanRoute}`);
  }
}

const llmsPath = path.join(siteRoot, 'llms.txt');
requireFile(llmsPath, 'LLM documentation index');
const llmsIndex = readFileSync(llmsPath, 'utf8');
for (const route of authoredRoutes) {
  const markdownRoute = `/${route.replace(/\.html$/, '.md')}`;
  if (!llmsIndex.includes(markdownRoute)) {
    fail(`llms.txt does not link to ${markdownRoute}`);
  }
}

requireFile(path.join(siteRoot, 'api.html'), 'API reference route');
const gamesApiPath = path.join(siteRoot, 'api/games.html');
requireFile(gamesApiPath, 'games API reference route');
const gamesApi = readFileSync(gamesApiPath, 'utf8');
if (
  !gamesApi.includes('<title>Games - College Football Data API | CFBD</title>')
) {
  fail('games API reference title is not normalized');
}

const pagefindRoot = path.join(siteRoot, 'pagefind');
requireFile(path.join(pagefindRoot, 'pagefind.js'), 'Pagefind runtime');
requireFile(
  path.join(pagefindRoot, 'pagefind-entry.json'),
  'Pagefind entry index',
);

const pagefindIndexes = path.join(pagefindRoot, 'index');
if (
  !existsSync(pagefindIndexes) ||
  !readdirSync(pagefindIndexes).some((file) => file.endsWith('.pf_index'))
) {
  fail('Pagefind emitted no search index');
}

const publicAssets = [
  'favicon.ico',
  'brand/cfbd-watermark.png',
  'brand/cfbd-watermark-dark.png',
];
for (const asset of publicAssets) {
  requireFile(path.join(siteRoot, asset), `public asset ${asset}`);
}

const localSourceMarkers = ['/home/', '/Users/', 'C:\\Users\\'];
for (const route of authoredRoutes) {
  const markdownPath = path.join(siteRoot, route.replace(/\.html$/, '.md'));
  requireFile(markdownPath, `authored Markdown output for ${route}`);
  const markdown = readFileSync(markdownPath, 'utf8');

  if (localSourceMarkers.some((marker) => markdown.includes(marker))) {
    fail(
      `${path.relative(repoRoot, markdownPath)} contains a local source path`,
    );
  }

  const assignments = markdown.matchAll(/CFBD_API_KEY\s*=\s*['"]([^'"]+)['"]/g);

  for (const assignment of assignments) {
    if (assignment[1] !== 'your-api-key') {
      fail(
        `${path.relative(repoRoot, markdownPath)} contains a literal API key value`,
      );
    }
  }
}

console.log(
  `OpenAPI inventory: ${pathCount} paths, ${operations.length} operations, ${schemaCount} schemas.`,
);
console.log('Documentation build verification passed.');
