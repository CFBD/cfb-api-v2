export interface DeniedCbbServiceIds {
  websitePage?: number;
  websiteExporter?: number;
}

const parseId = (
  name: string,
  value: string | undefined,
): number | undefined => {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
};

export const parseDeniedCbbServiceIds = (
  env: NodeJS.ProcessEnv,
): DeniedCbbServiceIds => {
  const websitePage = parseId(
    'CBBD_PUBLIC_PAGE_SERVICE_USER_ID',
    env.CBBD_PUBLIC_PAGE_SERVICE_USER_ID,
  );
  const websiteExporter = parseId(
    'CBBD_EXPORTER_SERVICE_USER_ID',
    env.CBBD_EXPORTER_SERVICE_USER_ID,
  );

  if ((websitePage === undefined) !== (websiteExporter === undefined)) {
    throw new Error('Both CBB website service user IDs must be configured.');
  }
  if (websitePage !== undefined && websitePage === websiteExporter) {
    throw new Error('CBB website service user IDs must be distinct.');
  }
  if (
    env.NODE_ENV === 'production' &&
    (websitePage === undefined || websiteExporter === undefined)
  ) {
    throw new Error('CBB website service user IDs are required in production.');
  }

  return { websitePage, websiteExporter };
};

let configuredIds: DeniedCbbServiceIds | undefined;

const getConfiguredIds = (): DeniedCbbServiceIds => {
  configuredIds ??= parseDeniedCbbServiceIds(process.env);
  return configuredIds;
};

export const validateCbbServicePrincipalConfiguration = (): void => {
  getConfiguredIds();
};

export const isDeniedCbbWebsitePrincipal = (
  userId: number,
  ids: DeniedCbbServiceIds = getConfiguredIds(),
): boolean => userId === ids.websitePage || userId === ids.websiteExporter;
