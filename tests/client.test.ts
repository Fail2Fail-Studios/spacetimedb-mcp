import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import nock from "nock";
import { SpacetimeClient } from "../src/client.js";
import { RawSchema } from "../src/types.js";

const HOST = "http://localhost:3000";

describe("SpacetimeClient", () => {
    beforeAll(() => {
        nock.disableNetConnect();
    });

    afterAll(() => {
        nock.enableNetConnect();
    });

    beforeEach(() => {
        nock.cleanAll();
    });

    it("handles testConnection success and failure", async () => {
        const client = new SpacetimeClient({ host: HOST, token: "token" });

        nock(HOST).get("/v1/ping").reply(200);
        nock(HOST).get("/v1/ping").reply(500, { error: "oops" });

        const success = await client.testConnection();
        const failure = await client.testConnection();

        expect(success.success).toBe(true);
        expect(success.data).toEqual({ status: "connected", host: HOST });
        expect(failure.success).toBe(false);
        expect(failure.error).toContain("Server returned status 500");
    });

    it("formats schema output and reports schema errors", async () => {
        const client = new SpacetimeClient({ host: HOST, token: "token" });
        const schema: RawSchema = {
            tables: [{ name: "users", product_type_ref: 0 }],
            reducers: [
                {
                    name: "CreateUser",
                    lifecycle: { some: { Init: {} } },
                    params: {
                        elements: [
                            { name: { some: "name" }, algebraic_type: { String: {} } },
                            { name: { some: "role" }, algebraic_type: { Sum: { variants: [] } } },
                        ],
                    },
                },
            ],
            typespace: {
                types: [
                    {
                        Product: {
                            elements: [
                                { name: { some: "id" }, algebraic_type: { U64: {} } },
                                { name: { some: "tags" }, algebraic_type: { Array: { String: {} } } },
                                { name: { some: "status" }, algebraic_type: { Option: { I32: {} } } },
                                { name: { some: "profile" }, algebraic_type: { Ref: 1 } },
                                {
                                    name: { some: "identity" },
                                    algebraic_type: {
                                        Product: {
                                            elements: [
                                                { name: { some: "__identity__" }, algebraic_type: { U256: {} } },
                                            ],
                                        },
                                    },
                                },
                            ],
                        },
                    },
                    { Product: { elements: [] } },
                ],
            },
            types: [
                { name: { scope: [], name: "User" }, ty: 0, custom_ordering: false },
                { name: { scope: [], name: "Profile" }, ty: 1, custom_ordering: false },
            ],
        };

        nock(HOST)
            .get("/v1/database/strc/schema")
            .query({ version: 9 })
            .reply(200, schema);
        nock(HOST)
            .get("/v1/database/strc/schema")
            .query({ version: 9 })
            .reply(500, { error: "nope" });

        const success = await client.getSchema("strc");
        const failure = await client.getSchema("strc");

        expect(success.success).toBe(true);
        expect(String(success.data)).toContain("TABLES (1)");
        expect(String(success.data)).toContain("users");
        expect(String(success.data)).toContain("tags: Array<String>");
        expect(String(success.data)).toContain("status: Option<I32>");
        expect(String(success.data)).toContain("profile: Profile");
        expect(String(success.data)).toContain("identity: Identity");
        expect(String(success.data)).toContain("CreateUser [Init]");
        expect(String(success.data)).toContain("role: Enum");

        expect(failure.success).toBe(false);
        expect(failure.error).toContain("HTTP 500");
    });

    it("handles SQL and reducer calls", async () => {
        const client = new SpacetimeClient({ host: HOST, token: "token" });

        nock(HOST)
            .post("/v1/database/strc/sql", "SELECT 1")
            .reply(200, [{ value: 1 }]);
        nock(HOST)
            .post("/v1/database/strc/sql", "SELECT 2")
            .reply(400, { error: "bad" });
        nock(HOST)
            .post("/v1/database/strc/call/CreateUser", ["alpha"])
            .reply(200, { ok: true });
        nock(HOST)
            .post("/v1/database/strc/call/CreateUser", ["beta"])
            .reply(500, { error: "fail" });

        const sqlSuccess = await client.runSql("strc", "SELECT 1");
        const sqlFailure = await client.runSql("strc", "SELECT 2");
        const reducerSuccess = await client.callReducer("strc", "CreateUser", ["alpha"]);
        const reducerFailure = await client.callReducer("strc", "CreateUser", ["beta"]);

        expect(sqlSuccess.success).toBe(true);
        expect(sqlSuccess.data).toEqual([{ value: 1 }]);
        expect(sqlFailure.success).toBe(false);
        expect(sqlFailure.error).toContain("HTTP 400");
        expect(reducerSuccess.success).toBe(true);
        expect(reducerSuccess.data).toEqual({ ok: true });
        expect(reducerFailure.success).toBe(false);
        expect(reducerFailure.error).toContain("HTTP 500");
    });

    it("formats logs, handles empty logs, and 404 responses", async () => {
        const client = new SpacetimeClient({ host: HOST, token: "token" });

        nock(HOST)
            .get("/v1/database/strc/logs")
            .query({ num_lines: 50 })
            .reply(200, [
                {
                    level: "info",
                    ts: 1700000000000,
                    target: "server",
                    filename: "main.rs",
                    line_number: 42,
                    message: "connected",
                },
            ]);
        nock(HOST)
            .get("/v1/database/strc/logs")
            .query({ num_lines: 50 })
            .reply(200, "");
        nock(HOST)
            .get("/v1/database/strc/logs")
            .query({ num_lines: 50 })
            .reply(404, { error: "missing" });

        const formatted = await client.getLogs("strc", 50);
        const empty = await client.getLogs("strc", 50);
        const missing = await client.getLogs("strc", 50);

        expect(formatted.success).toBe(true);
        expect(String(formatted.data)).toContain("INFO");
        expect(String(formatted.data)).toContain("server");
        expect(String(formatted.data)).toContain("connected");

        expect(empty.success).toBe(true);
        expect(empty.data).toBe("No logs available");

        expect(missing.success).toBe(false);
        expect(missing.error).toContain("not found");
    });

    it("handles database management endpoints", async () => {
        const client = new SpacetimeClient({ host: HOST, token: "token" });

        nock(HOST).get("/v1/database/alpha").reply(200, { name: "alpha" });
        nock(HOST).get("/v1/database/alpha/identity").reply(200, { identity: "0xabc" });
        nock(HOST).delete("/v1/database/alpha").reply(200, { ok: true });
        nock(HOST).get("/v1/identity/0xabc/databases").reply(200, { addresses: ["alpha"] });
        nock(HOST).post("/v1/database/0xabc/names", "alias-a").reply(200, { Success: { domain: "alias-a" } });
        nock(HOST).get("/v1/database/0xabc/names").reply(200, { names: ["alias-a"] });
        nock(HOST).delete("/v1/database/beta").reply(404, { error: "missing" });

        const describe = await client.describeDatabase("alpha");
        const identity = await client.getDatabaseIdentity("alpha");
        const deleted = await client.deleteDatabase("alpha");
        const list = await client.listDatabases("0xabc");
        const aliasAdd = await client.addDatabaseAlias("0xabc", "alias-a");
        const aliases = await client.getDatabaseAliases("0xabc");
        const deleteFail = await client.deleteDatabase("beta");

        expect(describe.success).toBe(true);
        expect(describe.data).toEqual({ name: "alpha" });
        expect(identity.success).toBe(true);
        expect(identity.data).toEqual({ identity: "0xabc" });
        expect(deleted.success).toBe(true);
        expect(list.success).toBe(true);
        expect(list.data).toEqual({ addresses: ["alpha"] });
        expect(aliasAdd.success).toBe(true);
        expect(aliases.success).toBe(true);
        expect(aliases.data).toEqual({ names: ["alias-a"] });
        expect(deleteFail.success).toBe(false);
        expect(deleteFail.error).toContain("HTTP 404");
    });
});
