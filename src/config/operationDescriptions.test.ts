import spec from '../../build/swagger.json';

interface Operation {
  operationId?: string;
  description?: string;
}

const operations = Object.entries(spec.paths).flatMap(
  ([operationPath, pathItem]) =>
    Object.entries(pathItem as Record<string, Operation>).map(
      ([method, operation]) => ({
        name: `${method.toUpperCase()} ${operationPath}`,
        description: operation.description ?? '',
      }),
    ),
);

// Clients such as the website exporter use the description as the endpoint
// label. Keep it to a short "Returns ..." sentence plus at most one request
// rule (access tier, parameter rule, or status behavior). Document data
// semantics on the response types instead.
describe('generated operation descriptions', () => {
  it.each(operations)('$name has a concise description', ({ description }) => {
    const lines = description.split('\n');

    expect(description).toMatch(/^Returns /);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(75);
      expect(line).toMatch(/^\S.*\.$/);
    }
  });
});
