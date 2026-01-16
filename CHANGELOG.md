# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-XX

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
