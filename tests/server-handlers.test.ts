import { describe, expect, it } from "vitest";
import { createHandlers, SpacetimeClientLike } from "../src/server.js";

const createStubClient = (overrides?: Partial<SpacetimeClientLike>): SpacetimeClientLike => ({
    testConnection: async () => ({ success: true, data: "ok" }),
    getSchema: async () => ({ success: true, data: "schema" }),
    runSql: async () => ({ success: true, data: [{ value: 1 }] }),
    callReducer: async () => ({ success: true, data: { ok: true } }),
    getLogs: async () => ({ success: true, data: "logs" }),
    ...overrides,
});

describe("createHandlers", () => {
    it("requires database when no default is configured", async () => {
        const handlers = createHandlers({ dbClient: createStubClient(), defaultDatabase: "" });
        const response = await handlers.callTool({ params: { name: "get_schema", arguments: {} } });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("No database specified");
    });

    it("exposes tool schemas based on default database", async () => {
        const handlers = createHandlers({ dbClient: createStubClient(), defaultDatabase: "" });
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
        });

        const logsResponse = await handlers.readResource({ params: { uri: "spacetimedb://db/logs" } });
        const testResponse = await handlers.callTool({ params: { name: "test_connection" } });

        expect(logsResponse.contents[0].text).toBe("log-output");
        expect(testResponse.content[0].text).toContain("connected");
    });
});
