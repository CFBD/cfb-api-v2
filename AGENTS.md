# AGENTS.md - CFB API v2

## Build/Test Commands
- `pnpm build` - Build the project (runs tsoa spec generation + TypeScript compilation)
- `pnpm test` - Run all Jest tests
- `pnpm test <filename>` - Run specific test file (e.g., `pnpm test controller.test.ts`)
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Fix ESLint errors automatically
- `pnpm prettify` - Format code with Prettier
- `pnpm dev` - Start development server with hot reload

## Code Style Guidelines
- **TypeScript**: Strict mode enabled, use explicit types, no implicit any
- **Formatting**: Prettier with 80 char line limit, single quotes, trailing commas
- **Imports**: Group external imports first, then relative imports with line breaks
- **Controllers**: Use TSOA decorators (@Route, @Get, @Query, etc.), extend Controller class
- **Services**: Export named functions, use async/await, validate inputs with ValidateError
- **Error Handling**: Use custom error classes (AuthorizationError), set HTTP status codes
- **Testing**: Jest with describe/test blocks, use @jest-mock/express for mocking
- **Naming**: camelCase for variables/functions, PascalCase for classes/types
- **Database**: Use kysely query builder (kdb), import from config/database
- **File Structure**: controller.ts, service.ts, types.ts pattern in each feature folder