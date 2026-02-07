import axios, { AxiosInstance } from "axios";
import {
    AlgebraicType,
    AlgebraicTypeElement,
    LogLine,
    ParsedParam,
    ParsedReducer,
    ParsedTable,
    RawSchema,
    ToolResult,
} from "./types.js";

export interface SpacetimeClientConfig {
    host: string;
    token: string;
}

export class SpacetimeClient {
    private client: AxiosInstance;
    private host: string;

    constructor(config: SpacetimeClientConfig) {
        this.host = config.host;
        this.client = axios.create({
            baseURL: config.host,
            headers: {
                Authorization: `Bearer ${config.token}`,
                "Content-Type": "application/json",
            },
            validateStatus: () => true,
        });
    }

    async testConnection(): Promise<ToolResult> {
        try {
            const response = await this.client.get("/v1/ping");
            if (response.status === 200) {
                return { success: true, data: { status: "connected", host: this.host } };
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

    async describeDatabase(database: string): Promise<ToolResult> {
        try {
            const response = await this.client.get(`/v1/database/${database}`);

            if (response.status !== 200) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
                };
            }

            return { success: true, data: response.data };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: `Failed to describe database: ${message}` };
        }
    }

    async getDatabaseIdentity(database: string): Promise<ToolResult> {
        try {
            const response = await this.client.get(`/v1/database/${database}/identity`);

            if (response.status !== 200) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
                };
            }

            return { success: true, data: response.data };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: `Failed to get database identity: ${message}` };
        }
    }

    async deleteDatabase(database: string): Promise<ToolResult> {
        try {
            const response = await this.client.delete(`/v1/database/${database}`);

            if (response.status !== 200) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
                };
            }

            return { success: true, data: response.data };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: `Failed to delete database: ${message}` };
        }
    }

    async listDatabases(identity: string): Promise<ToolResult> {
        try {
            const response = await this.client.get(`/v1/identity/${identity}/databases`);

            if (response.status !== 200) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
                };
            }

            return { success: true, data: response.data };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: `Failed to list databases: ${message}` };
        }
    }

    async addDatabaseAlias(identity: string, name: string): Promise<ToolResult> {
        try {
            const response = await this.client.post(
                `/v1/database/${identity}/names`,
                name,
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
            return { success: false, error: `Failed to add database alias: ${message}` };
        }
    }

    async getDatabaseAliases(identity: string): Promise<ToolResult> {
        try {
            const response = await this.client.get(`/v1/database/${identity}/names`);

            if (response.status !== 200) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
                };
            }

            return { success: true, data: response.data };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: `Failed to get database aliases: ${message}` };
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
            type: fullType.split("<")[0],
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
