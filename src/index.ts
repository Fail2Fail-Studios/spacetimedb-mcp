#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ErrorCode,
    McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import dotenv from "dotenv";

dotenv.config();

// Configuration
const HOST = process.env.SPACETIMEDB_HOST || "http://localhost:3000";
const TOKEN = process.env.SPACETIMEDB_TOKEN || "";
const DEFAULT_DATABASE = process.env.SPACETIMEDB_DEFAULT_DATABASE || "";

// --- Type Definitions (Fixed) ---

type StdbPrimitiveType =
    | "I8" | "U8"
    | "I16" | "U16"
    | "I32" | "U32" | "F32"
    | "I64" | "U64" | "F64"
    | "I128" | "U128"
    | "U256"
    | "Bool"
    | "String";

type StdbComplexType = "Array" | "Ref" | "Product" | "Sum" | "Option";

type StdbType = StdbPrimitiveType | StdbComplexType;

interface RustOption<T> {
    some?: T;
    none?: Record<string, never>;
}

// Algebraic type is a discriminated union - only one key will be present
type AlgebraicType =
    | { [K in StdbPrimitiveType]?: Record<string, never> }
    | { Array: AlgebraicType }
    | { Ref: number }
    | { Product: { elements: AlgebraicTypeElement[] } }
    | { Sum: { variants: { name: RustOption<string>; algebraic_type: AlgebraicType }[] } }
    | { Option: AlgebraicType };

interface AlgebraicTypeElement {
    name: RustOption<string>;
    algebraic_type: AlgebraicType;
}

interface RawReducer {
    name: string;
    lifecycle: RustOption<{
        OnDisconnect?: Record<string, never>;
        Init?: Record<string, never>;
        OnConnect?: Record<string, never>;
    }>;
    params: {
        elements: AlgebraicTypeElement[];
    };
}

interface Typespace {
    types: {
        Product?: {
            elements: AlgebraicTypeElement[];
        };
        Sum?: {
            variants: { name: RustOption<string>; algebraic_type: AlgebraicType }[];
        };
    }[];
}

interface TypeDef {
    name: {
        scope: unknown[];
        name: string;
    };
    ty: number;
    custom_ordering: boolean;
}

interface RawSchema {
    tables: { name: string; product_type_ref: number }[];
    reducers: RawReducer[];
    typespace: Typespace;
    types: TypeDef[];
}

interface LogLine {
    level: string;
    ts: Date;
    target: string;
    filename: string;
    line_number: number;
    message: string;
}

interface ParsedParam {
    name: string;
    type: string;
    fullType: string;
}

interface ParsedTable {
    name: string;
    columns: ParsedParam[];
}

interface ParsedReducer {
    name: string;
    params: ParsedParam[];
    lifecycle: "Init" | "OnDisconnect" | "OnConnect" | null;
}

interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
}

// --- SpacetimeDB API Client ---

class SpacetimeClient {
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: HOST,
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            validateStatus: () => true,
        });
    }

    async testConnection(): Promise<ToolResult> {
        try {
            const response = await this.client.get("/v1/ping");
            if (response.status === 200) {
                return { success: true, data: { status: "connected", host: HOST } };
            }
            return { success: false, error: `Server returned status ${response.status}` };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: `Connection failed: ${message}` };
        }
    }

    async getSchema(database: string): Promise<ToolResult> {
        try {
            const response = await this.client.get(`/v1/database/${database}/schema`, {
                params: { version: 9 },
            });

            if (response.status !== 200) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
                };
            }

            return {
                success: true,
                data: this.formatSchema(response.data as RawSchema),
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: `Failed to get schema: ${message}` };
        }
    }

    async runSql(database: string, query: string): Promise<ToolResult> {
        try {
            const response = await this.client.post(
                `/v1/database/${database}/sql`,
                query,
                { headers: { "Content-Type": "text/plain" } }
            );

            if (response.status !== 200) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
                };
            }

            return { success: true, data: response.data };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: `SQL query failed: ${message}` };
        }
    }

    async callReducer(database: string, reducer: string, args: unknown[]): Promise<ToolResult> {
        try {
            const response = await this.client.post(
                `/v1/database/${database}/call/${reducer}`,
                args
            );

            if (response.status !== 200) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
                };
            }

            return { success: true, data: response.data };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: `Reducer call failed: ${message}` };
        }
    }

    async getLogs(database: string, lineCount: number = 50): Promise<ToolResult> {
        try {
            const response = await this.client.get(`/v1/database/${database}/logs`, {
                params: { num_lines: lineCount },
            });

            if (response.status === 404) {
                return { success: false, error: `Database "${database}" not found` };
            }

            if (response.status !== 200) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
                };
            }

            const logLines = this.parseLogData(response.data);

            if (logLines.length === 0) {
                return { success: true, data: "No logs available" };
            }

            const formatted = logLines
                .map(
                    (line) =>
                        `[${line.ts.toISOString()}] ${line.level.toUpperCase().padEnd(5)} ${line.target} - ${line.message}`
                )
                .join("\n");

            return { success: true, data: formatted };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: `Failed to fetch logs: ${message}` };
        }
    }

    private parseLogData(data: unknown): LogLine[] {
        const logLines: LogLine[] = [];

        let logText: string;
        if (typeof data === "string") {
            logText = data;
        } else if (Array.isArray(data)) {
            logText = data.map((line) => JSON.stringify(line)).join("\n");
        } else if (data && typeof data === "object") {
            logText = JSON.stringify(data);
        } else {
            return [];
        }

        for (const line of logText.split("\n")) {
            if (!line.trim()) continue;

            try {
                const parsed = JSON.parse(line);
                logLines.push({
                    level: String(parsed.level || "").toLowerCase(),
                    ts: new Date(Number(parsed.ts) / 1000),
                    target: String(parsed.target || ""),
                    filename: String(parsed.filename || ""),
                    line_number: Number(parsed.line_number) || 0,
                    message: String(parsed.message || ""),
                });
            } catch {
                // Skip invalid JSON lines
            }
        }

        return logLines;
    }

    private formatSchema(schema: RawSchema): string {
        if (!schema?.tables || !schema?.reducers || !schema?.typespace) {
            return "Invalid or empty schema";
        }

        try {
            const tables = this.parseTables(schema);
            const reducers = this.parseReducers(schema);

            let output = `Database Schema\n${"=".repeat(50)}\n\n`;

            // Tables section
            output += `TABLES (${tables.length}):\n`;
            if (tables.length === 0) {
                output += "  (none)\n";
            } else {
                for (const table of tables) {
                    output += `\n• ${table.name}\n`;
                    for (const col of table.columns) {
                        output += `    ${col.name}: ${col.fullType}\n`;
                    }
                }
            }

            output += `\n`;

            // Reducers section
            output += `REDUCERS (${reducers.length}):\n`;
            if (reducers.length === 0) {
                output += "  (none)\n";
            } else {
                for (const reducer of reducers) {
                    const lifecycleTag = reducer.lifecycle ? ` [${reducer.lifecycle}]` : "";
                    output += `\n• ${reducer.name}${lifecycleTag}\n`;
                    if (reducer.params.length > 0) {
                        for (const param of reducer.params) {
                            output += `    ${param.name}: ${param.fullType}\n`;
                        }
                    } else {
                        output += `    (no parameters)\n`;
                    }
                }
            }

            return output;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return `Error formatting schema: ${message}\n\nRaw: ${JSON.stringify(schema, null, 2)}`;
        }
    }

    private parseTables(schema: RawSchema): ParsedTable[] {
        const tables: ParsedTable[] = [];

        for (const table of schema.tables) {
            const typeDef = schema.types[table.product_type_ref];
            if (!typeDef) continue;

            const typeData = schema.typespace.types[typeDef.ty];
            if (!typeData?.Product) continue;

            const columns: ParsedParam[] = typeData.Product.elements.map((elem) =>
                this.parseAlgebraicType(schema, elem)
            );

            tables.push({ name: table.name, columns });
        }

        return tables;
    }

    private parseReducers(schema: RawSchema): ParsedReducer[] {
        return schema.reducers.map((reducer) => {
            let lifecycle: ParsedReducer["lifecycle"] = null;
            if (reducer.lifecycle.some) {
                const keys = Object.keys(reducer.lifecycle.some);
                if (keys.length > 0) {
                    lifecycle = keys[0] as ParsedReducer["lifecycle"];
                }
            }

            const params = reducer.params.elements.map((elem) =>
                this.parseAlgebraicType(schema, elem)
            );

            return { name: reducer.name, params, lifecycle };
        });
    }

    private parseAlgebraicType(schema: RawSchema, element: AlgebraicTypeElement): ParsedParam {
        const name = element.name.some ?? "(unnamed)";
        const fullType = this.resolveType(schema, element.algebraic_type);

        return {
            name,
            type: fullType.split("<")[0], // Base type without generics
            fullType,
        };
    }

    private resolveType(schema: RawSchema, algebraicType: AlgebraicType): string {
        const entries = Object.entries(algebraicType);
        if (entries.length === 0) return "Unknown";

        const [typeKey, typeValue] = entries[0];

        // Primitive types
        const primitives: string[] = [
            "I8", "U8", "I16", "U16", "I32", "U32", "F32",
            "I64", "U64", "F64", "I128", "U128", "U256", "Bool", "String",
        ];
        if (primitives.includes(typeKey)) {
            return typeKey;
        }

        // Array type
        if (typeKey === "Array") {
            const innerType = this.resolveType(schema, typeValue as AlgebraicType);
            return `Array<${innerType}>`;
        }

        // Ref type
        if (typeKey === "Ref") {
            const refIndex = typeValue as number;
            const refTypeDef = schema.types[refIndex];
            return refTypeDef?.name?.name ?? `Ref(${refIndex})`;
        }

        // Product type (struct)
        if (typeKey === "Product") {
            const product = typeValue as { elements: AlgebraicTypeElement[] };
            // Check for Identity pattern
            if (
                product.elements.length === 1 &&
                product.elements[0].name.some === "__identity__"
            ) {
                return "Identity";
            }
            return "Product";
        }

        // Sum type (enum)
        if (typeKey === "Sum") {
            return "Enum";
        }

        // Option type
        if (typeKey === "Option") {
            const innerType = this.resolveType(schema, typeValue as AlgebraicType);
            return `Option<${innerType}>`;
        }

        return typeKey;
    }
}

const dbClient = new SpacetimeClient();

// --- MCP Server Setup ---

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

// --- Helper to format tool results ---

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

// --- Resources ---

server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: [] };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = new URL(request.params.uri);
    const database = uri.hostname || DEFAULT_DATABASE;
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
});

// --- Tools ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
    const dbDescription = DEFAULT_DATABASE
        ? `Defaults to: ${DEFAULT_DATABASE}`
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
                    required: DEFAULT_DATABASE ? [] : ["database"],
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
                    required: DEFAULT_DATABASE ? ["query"] : ["database", "query"],
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
                    required: DEFAULT_DATABASE ? ["reducer", "args"] : ["database", "reducer", "args"],
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
                    required: DEFAULT_DATABASE ? [] : ["database"],
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;
    const database = (safeArgs.database as string) || DEFAULT_DATABASE;

    // test_connection doesn't need a database
    if (name === "test_connection") {
        const result = await dbClient.testConnection();
        return formatToolResult(result);
    }

    // All other tools require a database
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
});

async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("SpacetimeDB MCP Server running on stdio");
}

run().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});