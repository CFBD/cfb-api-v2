import type { ZudokuConfig } from 'zudoku';

import './styles.css';

const config: ZudokuConfig = {
  site: {
    title: 'College Football Data API',
    logo: {
      src: {
        light: '/brand/cfbd-watermark.png',
        dark: '/brand/cfbd-watermark-dark.png',
      },
      alt: 'College Football Data',
      width: 'auto',
      href: '/',
      reloadDocument: false,
    },
    footer: {
      position: 'center',
      columns: [
        {
          title: 'Helpful Links',
          position: 'start',
          links: [
            { label: 'CFBD', href: 'https://collegefootballdata.com' },
            {
              label: 'Patreon',
              href: 'https://www.patreon.com/collegefootballdata',
            },
            {
              label: 'Gumroad',
              href: 'https://collegefootballdata.gumroad.com',
            },
          ],
        },
        {
          title: 'Data + Code Packs',
          position: 'center',
          links: [
            {
              label: 'Starter Pack',
              href: 'https://collegefootballdata.gumroad.com/l/starter-pack',
            },
            {
              label: 'Model Training Pack',
              href: 'https://collegefootballdata.gumroad.com/l/model-training-pack',
            },
            {
              label: 'AI Launchpad',
              href: 'https://collegefootballdata.gumroad.com/l/ai-launchpad',
            },
            {
              label: 'AI Builder Pack',
              href: 'https://collegefootballdata.gumroad.com/l/ai-builder',
            },
          ],
        },
        {
          title: 'Other Resources',
          position: 'end',
          links: [
            {
              label: 'Rad Sports Analytics',
              href: 'https://radsportsanalytics.com',
            },
            { label: 'Blog', href: 'https://radsportsanalytics.com/blog' },
            { label: 'Basketball', href: 'https://collegebasketballdata.com' },
          ],
        },
      ],
      social: [
        {
          icon: 'x',
          href: 'https://x.com/CFB_Data',
        },
        {
          icon: 'discord',
          href: 'https://discord.gg/Eb3ex5a',
        },
        {
          icon: 'github',
          href: 'https://github.com/CFBD',
        },
      ],
      copyright: 'A Rad Sports Analytics platform.',
    },
  },
  metadata: {
    title: '%s | College Football Data API',
    defaultTitle: 'College Football Data API documentation',
    description:
      'Documentation and API reference for the College Football Data API.',
    favicon: '/favicon.ico',
    applicationName: 'College Football Data API documentation',
  },
  header: {
    navigation: [
      {
        label: 'CollegeFootballData.com',
        to: 'https://collegefootballdata.com/',
        target: '_blank',
      },
      {
        label: 'Get API Key',
        to: 'https://collegefootballdata.com/key',
        target: '_blank',
      },
      {
        label: 'Legacy Swagger UI',
        to: 'https://api.collegefootballdata.com/swagger',
        target: '_blank',
      },
    ],
    themeSwitcher: {
      enabled: true,
    },
  },
  navigation: [
    {
      type: 'category',
      label: 'Getting Started',
      collapsible: false,
      items: [
        {
          type: 'doc',
          file: 'getting-started',
          label: 'Overview and first request',
        },
        {
          type: 'doc',
          file: 'authentication',
          label: 'Authentication',
        },
        {
          type: 'doc',
          file: 'usage-and-access',
          label: 'Usage and access',
        },
      ],
    },
    {
      type: 'category',
      label: 'Official libraries',
      collapsible: false,
      items: [
        {
          type: 'doc',
          file: 'libraries/python',
          label: 'Python quickstart',
        },
        {
          type: 'doc',
          file: 'libraries/typescript',
          label: 'TypeScript quickstart',
        },
      ],
    },
    {
      type: 'link',
      label: 'API Reference',
      to: '/api',
    },
  ],
  redirects: [{ from: '/', to: '/getting-started' }],
  docs: {
    files: ['/pages/**/*.{md,mdx}'],
    publishMarkdown: true,
    defaultOptions: {
      copyPage: true,
      showLastModified: true,
      suggestEdit: {
        url: 'https://github.com/CFBD/cfb-api-v2/edit/main/docs-site/pages',
        text: 'Edit this page on GitHub',
      },
    },
    llms: {
      llmsTxt: true,
    },
  },
  apis: [
    {
      type: 'file',
      input: '../build/swagger.json',
      path: '/api',
      options: {
        disablePlayground: false,
        disableSecurity: false,
        examplesLanguage: 'shell',
        supportedLanguages: [
          { value: 'shell', label: 'cURL' },
          { value: 'js', label: 'JavaScript' },
          { value: 'python', label: 'Python' },
        ],
        schemaDownload: {
          enabled: true,
          fileName: 'cfbd-openapi',
        },
        showInfoPage: true,
        showVersionSelect: 'if-available',
      },
    },
  ],
  search: {
    type: 'pagefind',
    maxSubResults: 3,
  },
  syntaxHighlighting: {
    languages: ['bash', 'http', 'python', 'typescript'],
  },
  aiAssistants: ['claude', 'chatgpt'],
  theme: {
    fonts: {
      sans: 'Inter',
      mono: 'JetBrains Mono',
    },
    light: {
      background: '#F7F9FC',
      foreground: '#182430',
      card: '#FDFDFD',
      cardForeground: '#182430',
      popover: '#FDFDFD',
      popoverForeground: '#182430',
      primary: '#1E913E',
      primaryForeground: '#FFFFFF',
      secondary: '#ECEEF2',
      secondaryForeground: '#182430',
      muted: '#ECEEF2',
      mutedForeground: '#70747C',
      accent: '#ECEEF2',
      accentForeground: '#182430',
      destructive: '#C8312A',
      destructiveForeground: '#FFFFFF',
      border: '#D0D0D4',
      input: '#D0D0D4',
      ring: '#1E913E',
      radius: '0.5rem',
    },
    dark: {
      background: '#182430',
      foreground: '#FDFDFD',
      card: '#243140',
      cardForeground: '#FDFDFD',
      popover: '#243140',
      popoverForeground: '#FDFDFD',
      primary: '#4FB272',
      primaryForeground: '#041329',
      secondary: '#243140',
      secondaryForeground: '#FDFDFD',
      muted: '#243140',
      mutedForeground: '#A4ADBA',
      accent: '#243140',
      accentForeground: '#FDFDFD',
      destructive: '#C8312A',
      destructiveForeground: '#FFFFFF',
      border: '#3A4756',
      input: '#3A4756',
      ring: '#82C99B',
      radius: '0.5rem',
    },
  },
};

export default config;
