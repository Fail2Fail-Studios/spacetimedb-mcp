#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { createServer } from "./server.js";

dotenv.config();

const HOST = process.env.SPACETIMEDB_HOST || "http://localhost:3000";
const TOKEN = process.env.SPACETIMEDB_TOKEN || "";
const DEFAULT_DATABASE = process.env.SPACETIMEDB_DEFAULT_DATABASE || "";

async function run() {
    const server = createServer({
        host: HOST,
        token: TOKEN,
        defaultDatabase: DEFAULT_DATABASE,
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("SpacetimeDB MCP Server running on stdio");
}

run().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
