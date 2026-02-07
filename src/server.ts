import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ErrorCode,
    McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { SpacetimeClient, SpacetimeClientConfig } from "./client.js";
import { ToolResult } from "./types.js";

export interface ServerConfig extends SpacetimeClientConfig {
    defaultDatabase: string;
}

export interface SpacetimeClientLike {
    testConnection(): Promise<ToolResult>;
    getSchema(database: string): Promise<ToolResult>;
    runSql(database: string, query: string): Promise<ToolResult>;
    callReducer(database: string, reducer: string, args: unknown[]): Promise<ToolResult>;
    getLogs(database: string, lineCount?: number): Promise<ToolResult>;
    describeDatabase(database: string): Promise<ToolResult>;
    getDatabaseIdentity(database: string): Promise<ToolResult>;
    deleteDatabase(database: string): Promise<ToolResult>;
    listDatabases(identity: string): Promise<ToolResult>;
    addDatabaseAlias(identity: string, name: string): Promise<ToolResult>;
    getDatabaseAliases(identity: string): Promise<ToolResult>;
}

export interface HandlerDependencies {
    dbClient: SpacetimeClientLike;
    defaultDatabase: string;
}

export function createHandlers({ dbClient, defaultDatabase }: HandlerDependencies) {
    function formatToolResult(result: ToolResult): { content: { type: "text"; text: string }[]; isError?: boolean } {
        if (result.success) {
            const text = typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);
            return { content: [{ type: "text", text }] };
        }
        return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true,
        };
    }

    function formatSqlMarkdown(data: unknown): string {
        if (!Array.isArray(data)) {
            return typeof data === "string" ? data : JSON.stringify(data, null, 2);
        }

        if (data.length === 0) {
            return "";
        }

        const firstRow = data[0];
        if (!firstRow || typeof firstRow !== "object" || Array.isArray(firstRow)) {
            return JSON.stringify(data, null, 2);
        }

        const headers = Object.keys(firstRow as Record<string, unknown>);
        if (headers.length === 0) {
            return JSON.stringify(data, null, 2);
        }

        const headerLine = `| ${headers.join(" | ")} |`;
        const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;
        const rows = data.map((row) => {
            const record = row as Record<string, unknown>;
            const cells = headers.map((header) => {
                const value = record[header];
                if (value === null || value === undefined) return "";
                if (typeof value === "object") return JSON.stringify(value);
                return String(value);
            });
            return `| ${cells.join(" | ")} |`;
        });

        return [headerLine, separatorLine, ...rows].join("\n");
    }

    const listResources = async () => {
        return { resources: [] };
    };

    const readResource = async (request: { params: { uri: string } }) => {
        const uri = new URL(request.params.uri);
        const database = uri.hostname || defaultDatabase;
        const resourceType = uri.pathname.split("/").filter(Boolean)[0];

        if (!database) {
            throw new McpError(ErrorCode.InvalidRequest, "No database specified in URI");
        }

        if (resourceType === "logs") {
            const result = await dbClient.getLogs(database, 100);
            const text = result.success
                ? (typeof result.data === "string" ? result.data : JSON.stringify(result.data))
                : `Error: ${result.error}`;
            return {
                contents: [{ uri: request.params.uri, mimeType: "text/plain", text }],
            };
        }

        if (resourceType === "schema") {
            const result = await dbClient.getSchema(database);
            const text = result.success
                ? (typeof result.data === "string" ? result.data : JSON.stringify(result.data))
                : `Error: ${result.error}`;
            return {
                contents: [{ uri: request.params.uri, mimeType: "text/plain", text }],
            };
        }

        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${request.params.uri}`);
    };

    const listTools = async () => {
        const dbDescription = defaultDatabase
            ? `Defaults to: ${defaultDatabase}`
            : "Required if no default is set.";

        return {
            tools: [
                {
                    name: "test_connection",
                    description: "Test the connection to the SpacetimeDB instance.",
                    inputSchema: {
                        type: "object",
                        properties: {},
                    },
                },
                {
                    name: "get_schema",
                    description: "Get the tables and reducers (functions) of a database.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            database: {
                                type: "string",
                                description: `The database name. ${dbDescription}`,
                            },
                        },
                        required: defaultDatabase ? [] : ["database"],
                    },
                },
            {
                name: "sql_query",
                description: "Run a SQL query against the database to inspect or modify data.",
                inputSchema: {
                    type: "object",
                    properties: {
                            database: {
                                type: "string",
                                description: `The database name. ${dbDescription}`,
                            },
                        query: {
                            type: "string",
                            description: "The SQL query (e.g., SELECT * FROM users LIMIT 10)",
                        },
                        format: {
                            type: "string",
                            description: "Optional output format: json (default) or markdown",
                        },
                    },
                    required: defaultDatabase ? ["query"] : ["database", "query"],
                },
            },
            {
                name: "describe_database",
                description: "Get metadata about a database.",
                inputSchema: {
                    type: "object",
                    properties: {
                        database: {
                            type: "string",
                            description: `The database name. ${dbDescription}`,
                        },
                    },
                    required: defaultDatabase ? [] : ["database"],
                },
            },
            {
                name: "get_database_identity",
                description: "Get the identity for a database name.",
                inputSchema: {
                    type: "object",
                    properties: {
                        database: {
                            type: "string",
                            description: `The database name. ${dbDescription}`,
                        },
                    },
                    required: defaultDatabase ? [] : ["database"],
                },
            },
            {
                name: "delete_database",
                description: "Delete a database.",
                inputSchema: {
                    type: "object",
                    properties: {
                        database: {
                            type: "string",
                            description: `The database name. ${dbDescription}`,
                        },
                    },
                    required: defaultDatabase ? [] : ["database"],
                },
            },
            {
                name: "list_databases",
                description: "List databases owned by an identity.",
                inputSchema: {
                    type: "object",
                    properties: {
                        identity: {
                            type: "string",
                            description: "The SpacetimeDB identity to list databases for",
                        },
                    },
                    required: ["identity"],
                },
            },
            {
                name: "add_database_alias",
                description: "Add a friendly alias to a database identity.",
                inputSchema: {
                    type: "object",
                    properties: {
                        identity: {
                            type: "string",
                            description: "The database identity",
                        },
                        name: {
                            type: "string",
                            description: "The alias to add",
                        },
                    },
                    required: ["identity", "name"],
                },
            },
            {
                name: "get_database_aliases",
                description: "List aliases for a database identity.",
                inputSchema: {
                    type: "object",
                    properties: {
                        identity: {
                            type: "string",
                            description: "The database identity",
                        },
                    },
                    required: ["identity"],
                },
            },
                {
                    name: "call_reducer",
                    description: "Call a reducer function on the database.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            database: {
                                type: "string",
                                description: `The database name. ${dbDescription}`,
                            },
                            reducer: {
                                type: "string",
                                description: "The reducer function name",
                            },
                            args: {
                                type: "array",
                                description: "Arguments for the reducer as a JSON array",
                                items: {},
                            },
                        },
                        required: defaultDatabase ? ["reducer", "args"] : ["database", "reducer", "args"],
                    },
                },
                {
                    name: "get_logs",
                    description: "Get recent logs from the database.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            database: {
                                type: "string",
                                description: `The database name. ${dbDescription}`,
                            },
                            count: {
                                type: "number",
                                description: "Number of log lines to fetch (default: 50)",
                            },
                        },
                        required: defaultDatabase ? [] : ["database"],
                    },
                },
            ],
        };
    };

    const callTool = async (request: { params: { name: string; arguments?: unknown } }) => {
        const { name, arguments: args } = request.params;
        const safeArgs = (args ?? {}) as Record<string, unknown>;
        const database = (safeArgs.database as string) || defaultDatabase;

        if (name === "test_connection") {
            const result = await dbClient.testConnection();
            return formatToolResult(result);
        }

        if (!database) {
            return {
                content: [{ type: "text", text: "Error: No database specified and no default configured." }],
                isError: true,
            };
        }

        switch (name) {
            case "get_schema": {
                const result = await dbClient.getSchema(database);
                return formatToolResult(result);
            }
            case "sql_query": {
                const query = safeArgs.query as string;
                const format = (safeArgs.format as string) || "json";
                if (!query) {
                    return { content: [{ type: "text", text: "Error: No query provided." }], isError: true };
                }
                const result = await dbClient.runSql(database, query);
                if (!result.success || format !== "markdown") {
                    return formatToolResult(result);
                }
                return { content: [{ type: "text", text: formatSqlMarkdown(result.data) }] };
            }
            case "describe_database": {
                const result = await dbClient.describeDatabase(database);
                return formatToolResult(result);
            }
            case "get_database_identity": {
                const result = await dbClient.getDatabaseIdentity(database);
                return formatToolResult(result);
            }
            case "delete_database": {
                const result = await dbClient.deleteDatabase(database);
                return formatToolResult(result);
            }
            case "list_databases": {
                const identity = safeArgs.identity as string;
                if (!identity) {
                    return { content: [{ type: "text", text: "Error: No identity provided." }], isError: true };
                }
                const result = await dbClient.listDatabases(identity);
                return formatToolResult(result);
            }
            case "add_database_alias": {
                const identity = safeArgs.identity as string;
                const name = safeArgs.name as string;
                if (!identity || !name) {
                    return { content: [{ type: "text", text: "Error: Identity and name are required." }], isError: true };
                }
                const result = await dbClient.addDatabaseAlias(identity, name);
                return formatToolResult(result);
            }
            case "get_database_aliases": {
                const identity = safeArgs.identity as string;
                if (!identity) {
                    return { content: [{ type: "text", text: "Error: No identity provided." }], isError: true };
                }
                const result = await dbClient.getDatabaseAliases(identity);
                return formatToolResult(result);
            }
            case "call_reducer": {
                const reducer = safeArgs.reducer as string;
                const reducerArgs = (safeArgs.args as unknown[]) ?? [];
                if (!reducer) {
                    return { content: [{ type: "text", text: "Error: No reducer name provided." }], isError: true };
                }
                const result = await dbClient.callReducer(database, reducer, reducerArgs);
                return formatToolResult(result);
            }
            case "get_logs": {
                const count = (safeArgs.count as number) || 50;
                const result = await dbClient.getLogs(database, count);
                return formatToolResult(result);
            }
            default:
                throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
        }
    };

    return { listResources, readResource, listTools, callTool };
}

export function createServer(config: ServerConfig) {
    const server = new Server(
        {
            name: "spacetimedb-mcp",
            version: "1.0.0",
        },
        {
            capabilities: {
                resources: {},
                tools: {},
            },
        }
    );

    const dbClient = new SpacetimeClient({ host: config.host, token: config.token });
    const handlers = createHandlers({ dbClient, defaultDatabase: config.defaultDatabase });

    server.setRequestHandler(ListResourcesRequestSchema, handlers.listResources);
    server.setRequestHandler(ReadResourceRequestSchema, handlers.readResource);
    server.setRequestHandler(ListToolsRequestSchema, handlers.listTools);
    server.setRequestHandler(CallToolRequestSchema, handlers.callTool);

    return server;
}
