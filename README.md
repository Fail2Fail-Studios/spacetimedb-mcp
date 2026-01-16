# spacetimedb-mcp

Model Context Protocol (MCP) server for SpacetimeDB. Query databases, call reducers, inspect schemas, and manage your SpacetimeDB instances directly from your MCP-enabled AI assistant.

## Features

- 🔍 **Query Schemas**: Get detailed information about database tables and reducers
- 🗄️ **Run SQL Queries**: Execute SQL queries to inspect and modify data
- ⚡ **Call Reducers**: Invoke reducer functions on your databases
- 📋 **View Logs**: Fetch and parse database logs
- ✅ **Test Connections**: Verify connectivity to your SpacetimeDB instance

## Installation

```bash
npm install spacetimedb-mcp
```

## Configuration

Add the server to your `mcp.json` configuration file (typically located in your home directory under `.config/mcp.json` or similar, depending on your MCP client).

### Basic Configuration

```json
{
  "mcpServers": {
    "spacetimedb": {
      "command": "node",
      "args": ["node_modules/spacetimedb-mcp/dist/index.js"],
      "env": {
        "SPACETIMEDB_HOST": "http://localhost:3000",
        "SPACETIMEDB_TOKEN": "your-token-here",
        "SPACETIMEDB_DEFAULT_DATABASE": "strc"
      }
    }
  }
}
```

### Using npx (Alternative)

If you prefer using `npx`:

```json
{
  "mcpServers": {
    "spacetimedb": {
      "command": "npx",
      "args": ["-y", "spacetimedb-mcp"],
      "env": {
        "SPACETIMEDB_HOST": "http://localhost:3000",
        "SPACETIMEDB_TOKEN": "your-token-here",
        "SPACETIMEDB_DEFAULT_DATABASE": "strc"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SPACETIMEDB_HOST` | No | `http://localhost:3000` | The base URL of your SpacetimeDB instance |
| `SPACETIMEDB_TOKEN` | Yes | - | Authentication token (Bearer token) |
| `SPACETIMEDB_DEFAULT_DATABASE` | No | - | Default database name to use when not specified in tool calls |

## Available Tools

### `test_connection`

Test the connection to the SpacetimeDB instance.

**Example:**
```json
{
  "tool": "test_connection"
}
```

**Response:**
```json
{
  "status": "connected",
  "host": "http://localhost:3000"
}
```

### `get_schema`

Get the schema of a database, including all tables and reducers.

**Parameters:**
- `database` (string, optional): Database name (uses default if not specified)

**Example:**
```json
{
  "tool": "get_schema",
  "arguments": {
    "database": "strc"
  }
}
```

**Response:** Formatted schema showing tables with columns and reducers with parameters.

### `sql_query`

Run a SQL query against the database.

**Parameters:**
- `database` (string, optional): Database name (uses default if not specified)
- `query` (string, required): SQL query to execute

**Example:**
```json
{
  "tool": "sql_query",
  "arguments": {
    "database": "strc",
    "query": "SELECT * FROM teleporter_instance LIMIT 10"
  }
}
```

**Response:** Query results with schema and rows.

### `call_reducer`

Call a reducer function on the database.

**Parameters:**
- `database` (string, optional): Database name (uses default if not specified)
- `reducer` (string, required): Name of the reducer function
- `args` (array, required): Arguments for the reducer as a JSON array

**Example:**
```json
{
  "tool": "call_reducer",
  "arguments": {
    "database": "strc",
    "reducer": "CreateTeleporterEntity",
    "args": [
      "Teleporter_E",
      true,
      false,
      0,
      0,
      1,
      {"x": 503, "y": 3, "z": 1003},
      "Teleporter_B",
      1,
      {"x": 1000, "y": 3, "z": 1000}
    ]
  }
}
```

**Response:** Result from the reducer call (may be empty for void returns).

### `get_logs`

Get recent logs from the database.

**Parameters:**
- `database` (string, optional): Database name (uses default if not specified)
- `count` (number, optional): Number of log lines to fetch (default: 50)

**Example:**
```json
{
  "tool": "get_logs",
  "arguments": {
    "database": "strc",
    "count": 20
  }
}
```

**Response:** Formatted log lines with timestamps, levels, and messages.

## Usage Examples

### Getting Started

1. Install the package:
   ```bash
   npm install spacetimedb-mcp
   ```

2. Configure your `mcp.json` with your SpacetimeDB credentials

3. Restart your MCP client (e.g., Cursor, Claude Desktop)

4. Start using the tools through your AI assistant!

### Common Workflows

**Inspect Database Schema:**
```
Use get_schema to see all tables and reducers in the database
```

**Query Data:**
```
Use sql_query to SELECT data from tables
```

**Create Entities:**
```
Use call_reducer to invoke reducer functions like CreateTeleporterEntity
```

**Monitor Activity:**
```
Use get_logs to see recent database activity
```

## Troubleshooting

### Connection Errors

If you see connection errors:
1. Verify `SPACETIMEDB_HOST` is correct
2. Check that your SpacetimeDB instance is running
3. Ensure `SPACETIMEDB_TOKEN` is valid

### Authentication Errors

If you get 401/403 errors:
- Verify your `SPACETIMEDB_TOKEN` is a valid Bearer token
- Check token permissions for the database operations

### Database Not Found

If you see 404 errors for database operations:
- Verify the database name is correct
- Check that the database exists on your SpacetimeDB instance
- Ensure your token has access to the database

### SQL Parser Errors

Some SQL queries may not be supported. The parser has limitations on:
- Complex `ORDER BY` clauses
- Certain `WHERE` clause formats
- Some advanced SQL features

Try simplifying your queries if you encounter parser errors.

## Development

### Building

```bash
npm run build
```

This compiles TypeScript source files to `dist/index.js`.

### Project Structure

```
spacetimedb-mcp/
├── src/
│   └── index.ts          # Main MCP server implementation
├── dist/
│   └── index.js          # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

## Requirements

- Node.js >= 18.0.0
- Access to a SpacetimeDB instance
- Valid SpacetimeDB authentication token

## License

MIT

## Links

- [SpacetimeDB Documentation](https://spacetimedb.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [npm Package](https://www.npmjs.com/package/spacetimedb-mcp)
