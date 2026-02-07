import { describe, expect, it } from "vitest";
import { createHandlers, SpacetimeClientLike } from "../src/server.js";

const createStubClient = (overrides?: Partial<SpacetimeClientLike>): SpacetimeClientLike => ({
    testConnection: async () => ({ success: true, data: "ok" }),
    getSchema: async () => ({ success: true, data: "schema" }),
    runSql: async () => ({ success: true, data: [{ value: 1 }] }),
    callReducer: async () => ({ success: true, data: { ok: true } }),
    getLogs: async () => ({ success: true, data: "logs" }),
    describeDatabase: async () => ({ success: true, data: { name: "db" } }),
    getDatabaseIdentity: async () => ({ success: true, data: { identity: "0xabc" } }),
    deleteDatabase: async () => ({ success: true, data: { ok: true } }),
    listDatabases: async () => ({ success: true, data: { addresses: ["db"] } }),
    addDatabaseAlias: async () => ({ success: true, data: { Success: { domain: "alias" } } }),
    getDatabaseAliases: async () => ({ success: true, data: { names: ["alias"] } }),
    ...overrides,
});

describe("createHandlers", () => {
    it("requires database when no default is configured", async () => {
        const handlers = createHandlers({ dbClient: createStubClient(), defaultDatabase: "", host: "" });
        const response = await handlers.callTool({ params: { name: "get_schema", arguments: {} } });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("No database specified");
    });

    it("exposes tool schemas based on default database", async () => {
        const handlers = createHandlers({ dbClient: createStubClient(), defaultDatabase: "", host: "" });
        const result = await handlers.listTools();
        const schemaTool = result.tools.find((tool) => tool.name === "get_schema");

        expect(schemaTool).toBeTruthy();
        expect(schemaTool?.inputSchema.required).toEqual(["database"]);
    });

    it("serves logs and test_connection through handlers", async () => {
        const handlers = createHandlers({
            dbClient: createStubClient({
                getLogs: async () => ({ success: true, data: "log-output" }),
                testConnection: async () => ({ success: true, data: { status: "connected" } }),
            }),
            defaultDatabase: "db",
            host: "http://localhost:3000",
        });

        const logsResponse = await handlers.readResource({ params: { uri: "spacetimedb://db/logs" } });
        const testResponse = await handlers.callTool({ params: { name: "test_connection" } });

        expect(logsResponse.contents[0].text).toBe("log-output");
        expect(testResponse.content[0].text).toContain("connected");
    });

    it("formats SQL results as markdown when requested", async () => {
        const handlers = createHandlers({
            dbClient: createStubClient({
                runSql: async () => ({ success: true, data: [{ id: 1, name: "alpha" }] }),
            }),
            defaultDatabase: "db",
            host: "http://localhost:3000",
        });

        const response = await handlers.callTool({
            params: { name: "sql_query", arguments: { query: "SELECT *", format: "markdown" } },
        });

        expect(response.content[0].text).toContain("| id | name |");
        expect(response.content[0].text).toContain("| 1 | alpha |");
    });

    it("runs publish_database through the CLI wrapper", async () => {
        let capturedArgs: string[] = [];
        let capturedCwd = "";
        const handlers = createHandlers({
            dbClient: createStubClient(),
            defaultDatabase: "db",
            host: "http://localhost:3000",
            publishCommandRunner: async ({ args, cwd }) => {
                capturedArgs = args;
                capturedCwd = cwd ?? "";
                return { stdout: "published", stderr: "" };
            },
        });

        const response = await handlers.callTool({
            params: {
                name: "publish_database",
                arguments: {
                    database: "my-db",
                    project_path: "C:/Projects/my-db",
                    clear_data: true,
                },
            },
        });

        expect(response.content[0].text).toContain("published");
        expect(capturedArgs).toEqual([
            "publish",
            "my-db",
            "--project-path",
            "C:/Projects/my-db",
            "-y",
            "--server",
            "http://localhost:3000",
            "--delete-data",
        ]);
        expect(capturedCwd).toBe("C:/Projects/my-db");
    });
});
