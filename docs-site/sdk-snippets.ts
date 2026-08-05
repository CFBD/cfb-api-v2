import openApiDocument from '../build/swagger.json';

type Primitive = string | number | boolean;

type OpenApiSchema = {
  $ref?: string;
  default?: unknown;
  enum?: unknown[];
  example?: unknown;
  type?: string;
};

type OpenApiParameter = {
  $ref?: string;
  example?: unknown;
  in?: string;
  name?: string;
  required?: boolean;
  schema?: OpenApiSchema;
};

type OpenApiOperation = {
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: unknown;
  tags?: string[];
};

type OpenApiDocument = {
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
  paths?: Record<string, Record<string, unknown>>;
  servers?: Array<{ url?: string }>;
};

type SnippetArgument = {
  name: string;
  pythonName: string;
  replace: boolean;
  value: Primitive;
};

type SnippetRecord = {
  arguments: SnippetArgument[];
  method: string;
  operationId: string;
  path: string;
  pythonApiClass: string;
  pythonApiVariable: string;
  pythonMethod: string;
  typescriptOperation: string;
};

type GenerateCodeSnippetOptions = {
  operation: {
    operationId?: string | null;
  };
  selectedLang: string;
  selectedServer: string;
};

const supportedMethods = new Set([
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
]);

const curatedExamples: Record<string, Record<string, Primitive>> = {
  GetGames: {
    year: 2023,
    team: 'Michigan',
  },
};

const standardParameterExamples: Record<string, Primitive> = {
  coachId: 195,
  distance: 10,
  down: 1,
  gameId: 401520434,
  id: 401520434,
  playerId: 4429096,
  searchTerm: 'Underwood',
  team1: 'Michigan',
  team2: 'Ohio State',
  year: 2023,
  week: 1,
  team: 'Michigan',
};

const document = openApiDocument as OpenApiDocument;

const splitWords = (value: string): string[] =>
  value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

const toCamelCase = (value: string): string =>
  splitWords(value)
    .map((word, index) => {
      const normalized = word.toLowerCase();
      return index === 0
        ? normalized
        : `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
    })
    .join('');

const toPascalCase = (value: string): string =>
  splitWords(value)
    .map((word) => {
      const normalized = word.toLowerCase();
      return `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
    })
    .join('');

const toSnakeCase = (value: string): string =>
  splitWords(value)
    .map((word) => word.toLowerCase())
    .join('_');

const quote = (value: string): string =>
  `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`;

const formatValue = (value: Primitive): string =>
  typeof value === 'string' ? quote(value) : String(value);

const formatPythonValue = (value: Primitive): string => {
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }

  return formatValue(value);
};

const operationContext = (
  method: string,
  path: string,
  operationId?: string,
): string =>
  `${method.toUpperCase()} ${path}${operationId ? ` (${operationId})` : ''}`;

const fail = (context: string, message: string): never => {
  throw new Error(`SDK snippet generation failed for ${context}: ${message}`);
};

const requireString = (
  value: string | undefined,
  context: string,
  message: string,
): string => {
  if (!value) {
    return fail(context, message);
  }

  return value;
};

const getReferencedSchema = (
  schema: OpenApiSchema,
  context: string,
): OpenApiSchema => {
  if (!schema.$ref) {
    return schema;
  }

  const prefix = '#/components/schemas/';
  if (!schema.$ref.startsWith(prefix)) {
    return fail(context, `unsupported schema reference ${schema.$ref}`);
  }

  const name = schema.$ref.slice(prefix.length);
  const referenced = document.components?.schemas?.[name];
  if (!referenced) {
    return fail(context, `schema reference ${schema.$ref} was not found`);
  }

  return referenced;
};

const asPrimitive = (
  value: unknown,
  context: string,
  source: string,
): Primitive | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  return fail(context, `${source} is not a supported primitive value`);
};

const placeholderFor = (
  parameter: OpenApiParameter,
  schema: OpenApiSchema,
  context: string,
): Primitive => {
  if (schema.type === 'string') {
    const label = toSnakeCase(parameter.name ?? '').toUpperCase();
    return `REPLACE_WITH_${label}`;
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    return 0;
  }

  if (schema.type === 'boolean') {
    return false;
  }

  return fail(
    context,
    `required query parameter ${parameter.name} has unsupported type ${
      schema.type ?? 'unknown'
    }`,
  );
};

const getArgument = (
  operationId: string,
  parameter: OpenApiParameter,
  context: string,
): SnippetArgument | undefined => {
  if (!parameter.name) {
    return fail(context, 'query parameter is missing a name');
  }

  if (parameter.$ref) {
    return fail(
      context,
      `parameter reference ${parameter.$ref} is not supported`,
    );
  }

  if (parameter.in !== 'query') {
    return fail(
      context,
      `parameter ${parameter.name} uses unsupported location ${
        parameter.in ?? 'unknown'
      }`,
    );
  }

  if (!parameter.schema) {
    return fail(context, `query parameter ${parameter.name} has no schema`);
  }

  const curated = curatedExamples[operationId]?.[parameter.name];
  if (curated === undefined && !parameter.required) {
    return undefined;
  }

  const schema = getReferencedSchema(parameter.schema, context);
  const standardExample = standardParameterExamples[parameter.name];
  const metadataValue =
    asPrimitive(schema.default, context, `${parameter.name} default`) ??
    asPrimitive(parameter.example, context, `${parameter.name} example`) ??
    asPrimitive(schema.example, context, `${parameter.name} schema example`) ??
    asPrimitive(schema.enum?.[0], context, `${parameter.name} enum`);
  const value = curated ?? standardExample ?? metadataValue;

  return {
    name: parameter.name,
    pythonName: toSnakeCase(parameter.name),
    replace: value === undefined,
    value: value ?? placeholderFor(parameter, schema, context),
  };
};

const formatTypescript = (
  record: SnippetRecord,
  selectedServer: string,
): string => {
  const baseUrl = selectedServer.replace(/\/+$/, '');
  const query = record.arguments.length
    ? [
        '  query: {',
        ...record.arguments.map(
          (argument) =>
            `    ${argument.name}: ${formatValue(argument.value)},${
              argument.replace
                ? ` // Replace with a valid ${argument.name}`
                : ''
            }`,
        ),
        '  },',
      ]
    : [];
  const call = query.length
    ? [
        `const response = await ${record.typescriptOperation}({`,
        ...query,
        '});',
      ]
    : [`const response = await ${record.typescriptOperation}();`];

  return [
    `import { client, ${record.typescriptOperation} } from 'cfbd';`,
    '',
    'const apiKey = process.env.CFBD_API_KEY;',
    '',
    'if (!apiKey) {',
    "  throw new Error('CFBD_API_KEY is required');",
    '}',
    '',
    'client.setConfig({',
    `  baseUrl: ${quote(baseUrl)},`,
    '  headers: {',
    '    Authorization: `Bearer ${apiKey}`,',
    '  },',
    '});',
    '',
    ...call,
    '',
    'if (response.error) {',
    '  throw response.error;',
    '}',
    '',
    'console.log(response.data);',
  ].join('\n');
};

const formatPython = (
  record: SnippetRecord,
  selectedServer: string,
): string => {
  const host = selectedServer.replace(/\/+$/, '');
  const call = record.arguments.length
    ? [
        `    response = ${record.pythonApiVariable}.${record.pythonMethod}(`,
        ...record.arguments.map(
          (argument) =>
            `        ${argument.pythonName}=${formatPythonValue(
              argument.value,
            )},${
              argument.replace
                ? `  # Replace with a valid ${argument.pythonName}`
                : ''
            }`,
        ),
        '    )',
      ]
    : [`    response = ${record.pythonApiVariable}.${record.pythonMethod}()`];

  return [
    'import os',
    '',
    'import cfbd',
    '',
    'configuration = cfbd.Configuration(',
    `    host=${quote(host)},`,
    "    access_token=os.environ['CFBD_API_KEY'],",
    ')',
    '',
    'with cfbd.ApiClient(configuration) as api_client:',
    `    ${record.pythonApiVariable} = cfbd.${record.pythonApiClass}(api_client)`,
    ...call,
    '    print(response)',
  ].join('\n');
};

const buildSnippetInventory = (): Map<string, SnippetRecord> => {
  const records = new Map<string, SnippetRecord>();
  const paths = document.paths;

  if (!paths || Object.keys(paths).length === 0) {
    throw new Error('SDK snippet generation requires OpenAPI paths');
  }

  for (const [path, pathItem] of Object.entries(paths)) {
    if (Array.isArray(pathItem.parameters) && pathItem.parameters.length > 0) {
      fail(`${path}`, 'path-level parameters are not supported');
    }

    for (const [method, value] of Object.entries(pathItem)) {
      if (!supportedMethods.has(method)) {
        continue;
      }

      const operation = value as OpenApiOperation;
      const context = operationContext(method, path, operation.operationId);

      if (method !== 'get') {
        fail(context, `HTTP method ${method.toUpperCase()} is not supported`);
      }

      if (operation.requestBody !== undefined) {
        fail(context, 'request bodies are not supported');
      }

      const operationId = requireString(
        operation.operationId,
        context,
        'operationId is required',
      );
      const primaryTag = requireString(
        operation.tags?.[0],
        context,
        'a primary tag is required',
      );

      if (records.has(operationId)) {
        fail(context, `duplicate operationId ${operationId}`);
      }

      const curated = curatedExamples[operationId] ?? {};
      const parameters = operation.parameters ?? [];
      const parameterNames = new Set(parameters.map(({ name }) => name));
      for (const curatedName of Object.keys(curated)) {
        if (!parameterNames.has(curatedName)) {
          fail(context, `curated parameter ${curatedName} was not found`);
        }
      }

      const args = parameters
        .map((parameter) => getArgument(operationId, parameter, context))
        .filter(
          (argument): argument is SnippetArgument => argument !== undefined,
        );
      const pythonNames = new Set<string>();
      for (const argument of args) {
        if (!argument.pythonName || pythonNames.has(argument.pythonName)) {
          fail(
            context,
            `query parameter ${argument.name} has an invalid Python name`,
          );
        }
        pythonNames.add(argument.pythonName);
      }

      records.set(operationId, {
        arguments: args,
        method,
        operationId,
        path,
        pythonApiClass: `${toPascalCase(primaryTag)}Api`,
        pythonApiVariable: `${toSnakeCase(primaryTag)}_api`,
        pythonMethod: toSnakeCase(operationId),
        typescriptOperation: toCamelCase(operationId),
      });
    }
  }

  const selectedServer = document.servers?.[0]?.url;
  if (!selectedServer) {
    throw new Error('SDK snippet generation requires an OpenAPI server URL');
  }

  for (const record of records.values()) {
    const context = operationContext(
      record.method,
      record.path,
      record.operationId,
    );
    if (!formatTypescript(record, selectedServer).trim()) {
      fail(context, 'TypeScript formatter returned empty source');
    }
    if (!formatPython(record, selectedServer).trim()) {
      fail(context, 'Python formatter returned empty source');
    }
  }

  if (records.size === 0) {
    throw new Error('SDK snippet generation found no OpenAPI operations');
  }

  return records;
};

const snippets = buildSnippetInventory();

export const generateCodeSnippet = ({
  operation,
  selectedLang,
  selectedServer,
}: GenerateCodeSnippetOptions): string | false => {
  if (selectedLang === 'shell') {
    return false;
  }

  const operationId = operation.operationId;
  if (!operationId) {
    throw new Error('SDK snippet generation requires an operationId');
  }

  const record = snippets.get(operationId);
  if (!record) {
    throw new Error(
      `SDK snippet generation found no record for ${operationId}`,
    );
  }

  if (!selectedServer) {
    return fail(
      operationContext(record.method, record.path, operationId),
      'selected server is required',
    );
  }

  if (selectedLang === 'typescript') {
    return formatTypescript(record, selectedServer);
  }

  if (selectedLang === 'python') {
    return formatPython(record, selectedServer);
  }

  return fail(
    operationContext(record.method, record.path, operationId),
    `unsupported language ${selectedLang}`,
  );
};
