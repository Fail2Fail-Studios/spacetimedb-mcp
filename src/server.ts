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
                        },
                        required: defaultDatabase ? ["query"] : ["database", "query"],
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
                if (!query) {
                    return { content: [{ type: "text", text: "Error: No query provided." }], isError: true };
                }
                const result = await dbClient.runSql(database, query);
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
