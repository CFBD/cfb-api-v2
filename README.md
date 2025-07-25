# CFBD API v2

This is the repository for the CFBD API v2, currently hosted at [api.CollegeFootballData.com](https://api.collegefootballdata.com). The API is built on NodeJS using TypeScript and Express over a PostgreSQL database.

## Getting Started

This repo uses `pnpm` for dependency management. Run the following commands to install dependencies and start a dev server with hot reloading:

```bash
pnpm install
pnpm dev
```
### Code Formatting

This repo uses `prettier` and `eslint` for code formatting. Run the following command to format your code before committing:

```bash
pnpm prettify
```

### Semantic Versioning

Semantic versioning is used for this project. Version numbers are automatically updated via [semantic-release](https://github.com/semantic-release/semantic-release) based on commit messages. [commitlint](https://commitlint.js.org/) is used to enforce commit message formatting.

## Project Architecture

### tsoa and Express

This project uses [tsoa](https://tsoa-community.github.io/docs/) to generate OpenAPI documentation and Express routes from TypeScript controllers.

### Data Access

Data access is implemented using [kysely](https://kysely.dev/), a lightweight SQL query builder for TypeScript.

### Folder Structure
```
src/
├── app/ - application logic
│   └── category/ - application category
│       ├── controller.ts - tsoa controller
│       ├── service.ts - business logic
│       └── types.ts - typescript types
├── config/
│   ├── middleware/ - tsoa and express middlewares
│   ├── types/ - typescript types
│   ├── auth.ts - authorization logic
│   ├── database.ts - database configuration
│   ├── errors.ts - error handling
│   └── express.ts - express configuration
├── globals/ - global types and constants
└── app.ts - application entrypoint
