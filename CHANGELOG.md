# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-02-07

### Added
- GitHub Actions workflow to run tests on pushes and PRs

### Changed
- Ignore packed npm tarballs (`*.tgz`)

## [1.3.0] - 2026-02-07

### Added
- `publish_database` tool to run `spacetime publish` non-interactively

### Added
- Database management tools for describing, deleting, and resolving identities
- Identity-based database listing tool
- Database alias management tools for adding and listing names
- Optional markdown formatting for SQL query results

### Added
- Testing infrastructure using Vitest and Nock
- Unit tests for SpacetimeDB client and MCP server handlers
- `npm test` script for running the test suite
- Type definitions extracted to `src/types.ts`

### Changed
- Refactored monolithic `src/index.ts` into modular components (`client.ts`, `server.ts`)
- Updated project to use ECMAScript Modules (`"type": "module"`)
- Improved code organization for better maintainability and testability

## [1.2.0] - 2026-02-07

### Added
- Initial release of spacetimedb-mcp
- `test_connection` tool to verify SpacetimeDB connectivity
- `get_schema` tool to retrieve database schemas with tables and reducers
- `sql_query` tool to execute SQL queries
- `call_reducer` tool to invoke reducer functions
- `get_logs` tool to fetch and parse database logs
- Support for Bearer token authentication
- Support for version 9 schema format
- Comprehensive schema parsing for complex types (Arrays, Products, Refs, Options)
- Environment variable configuration (SPACETIMEDB_HOST, SPACETIMEDB_TOKEN, SPACETIMEDB_DEFAULT_DATABASE)
- CLI executable via npm bin
- Full TypeScript implementation

### Features
- Compatible with Model Context Protocol (MCP)
- Works with Cursor, Claude Desktop, and other MCP clients
- Supports local and remote SpacetimeDB instances
- Handles complex algebraic types in schema parsing
- Proper error handling and formatted output
