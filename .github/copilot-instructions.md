---
description: 
globs: 
alwaysApply: true
---
# MCP TypeScript SDK ![NPM Version](https://img.shields.io/npm/v/%40modelcontextprotocol%2Fsdk) ![MIT licensed](https://img.shields.io/npm/l/%40modelcontextprotocol%2Fsdk)

## Table of Contents
- [Overview](#overview)
- [Installation](#installation)
- [Quickstart](#quickstart)
- [What is MCP?](#what-is-mcp)
- [Core Concepts](#core-concepts)
  - [Server](#server)
  - [Resources](#resources)
  - [Tools](#tools)
  - [Prompts](#prompts)
- [Running Your Server](#running-your-server)
  - [stdio](#stdio)
  - [Streamable HTTP](#streamable-http)
  - [Testing and Debugging](#testing-and-debugging)
- [Examples](#examples)
  - [Echo Server](#echo-server)
  - [SQLite Explorer](#sqlite-explorer)
- [Advanced Usage](#advanced-usage)
  - [Low-Level Server](#low-level-server)
  - [Writing MCP Clients](#writing-mcp-clients)
  - [Server Capabilities](#server-capabilities)
  - [Proxy OAuth Server](#proxy-authorization-requests-upstream)
  - [Backwards Compatibility](#backwards-compatibility)

## Overview

The Model Context Protocol allows applications to provide context for LLMs in a standardized way, separating the concerns of providing context from the actual LLM interaction. This TypeScript SDK implements the full MCP specification, making it easy to:

- Build MCP clients that can connect to any MCP server
- Create MCP servers that expose resources, prompts and tools
- Use standard transports like stdio and Streamable HTTP
- Handle all MCP protocol messages and lifecycle events

## Installation

```bash
npm install @modelcontextprotocol/sdk
```

## Quick Start

Let's create a simple MCP server that exposes a calculator tool and some data:

```typescript
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({
  name: "Demo",
  version: "1.0.0"
});

// Add an addition tool
server.tool("add",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }]
  })
);

// Add a dynamic greeting resource
server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  async (uri, { name }) => ({
    contents: [{
      uri: uri.href,
      text: `Hello, ${name}!`
    }]
  })
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
```

## What is MCP?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io) lets you build servers that expose data and functionality to LLM applications in a secure, standardized way. Think of it like a web API, but specifically designed for LLM interactions. MCP servers can:

- Expose data through **Resources** (think of these sort of like GET endpoints; they are used to load information into the LLM's context)
- Provide functionality through **Tools** (sort of like POST endpoints; they are used to execute code or otherwise produce a side effect)
- Define interaction patterns through **Prompts** (reusable templates for LLM interactions)
- And more!

## Core Concepts

### Server

The McpServer is your core interface to the MCP protocol. It handles connection management, protocol compliance, and message routing:

```typescript
const server = new McpServer({
  name: "My App",
  version: "1.0.0"
});
```

### Resources

Resources are how you expose data to LLMs. They're similar to GET endpoints in a REST API - they provide data but shouldn't perform significant computation or have side effects:

```typescript
// Static resource
server.resource(
  "config",
  "config://app",
  async (uri) => ({
    contents: [{
      uri: uri.href,
      text: "App configuration here"
    }]
  })
);

// Dynamic resource with parameters
server.resource(
  "user-profile",
  new ResourceTemplate("users://{userId}/profile", { list: undefined }),
  async (uri, { userId }) => ({
    contents: [{
      uri: uri.href,
      text: `Profile data for user ${userId}`
    }]
  })
);
```

### Tools

Tools let LLMs take actions through your server. Unlike resources, tools are expected to perform computation and have side effects:

```typescript
// Simple tool with parameters
server.tool(
  "calculate-bmi",
  {
    weightKg: z.number(),
    heightM: z.number()
  },
  async ({ weightKg, heightM }) => ({
    content: [{
      type: "text",
      text: String(weightKg / (heightM * heightM))
    }]
  })
);

// Async tool with external API call
server.tool(
  "fetch-weather",
  { city: z.string() },
  async ({ city }) => {
    const response = await fetch(`https://api.weather.com/${city}`);
    const data = await response.text();
    return {
      content: [{ type: "text", text: data }]
    };
  }
);
```

### Prompts

Prompts are reusable templates that help LLMs interact with your server effectively:

```typescript
server.prompt(
  "review-code",
  { code: z.string() },
  ({ code }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please review this code:\n\n${code}`
      }
    }]
  })
);
```

## Running Your Server

MCP servers in TypeScript need to be connected to a transport to communicate with clients. How you start the server depends on the choice of transport:

### stdio

For command-line tools and direct integrations:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "example-server",
  version: "1.0.0"
});

// ... set up server resources, tools, and prompts ...

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Streamable HTTP

For remote servers, set up a Streamable HTTP transport that handles both client requests and server-to-client notifications.

#### With Session Management

In some cases, servers need to be stateful. This is achieved by [session management](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#session-management).

```typescript
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"



const app = express();
app.use(express.json());

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
  // Check for existing session ID
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
      }
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    const server = new McpServer({
      name: "example-server",
      version: "1.0.0"
    });

    // ... set up server resources, tools, and prompts ...

    // Connect to the MCP server
    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Handle the request
  await transport.handleRequest(req, res, req.body);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

app.listen(3000);
```

#### Without Session Management (Stateless)

For simpler use cases where session management isn't needed:

```typescript
const app = express();
app.use(express.json());

app.post('/mcp', async (req: Request, res: Response) => {
  // In stateless mode, create a new instance of transport and server for each request
  // to ensure complete isolation. A single instance would cause request ID collisions
  // when multiple clients connect concurrently.
  
  try {
    const server = getServer(); 
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req: Request, res: Response) => {
  console.log('Received GET MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
});

app.delete('/mcp', async (req: Request, res: Response) => {
  console.log('Received DELETE MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});

```

This stateless approach is useful for:
- Simple API wrappers
- RESTful scenarios where each request is independent
- Horizontally scaled deployments without shared session state

### Testing and Debugging

To test your server, you can use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector). See its README for more information.

## Examples

### Echo Server

A simple server demonstrating resources, tools, and prompts:

```typescript
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "Echo",
  version: "1.0.0"
});

server.resource(
  "echo",
  new ResourceTemplate("echo://{message}", { list: undefined }),
  async (uri, { message }) => ({
    contents: [{
      uri: uri.href,
      text: `Resource echo: ${message}`
    }]
  })
);

server.tool(
  "echo",
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: "text", text: `Tool echo: ${message}` }]
  })
);

server.prompt(
  "echo",
  { message: z.string() },
  ({ message }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please process this message: ${message}`
      }
    }]
  })
);
```

### SQLite Explorer

A more complex example showing database integration:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import sqlite3 from "sqlite3";
import { promisify } from "util";
import { z } from "zod";

const server = new McpServer({
  name: "SQLite Explorer",
  version: "1.0.0"
});

// Helper to create DB connection
const getDb = () => {
  const db = new sqlite3.Database("database.db");
  return {
    all: promisify<string, any[]>(db.all.bind(db)),
    close: promisify(db.close.bind(db))
  };
};

server.resource(
  "schema",
  "schema://main",
  async (uri) => {
    const db = getDb();
    try {
      const tables = await db.all(
        "SELECT sql FROM sqlite_master WHERE type='table'"
      );
      return {
        contents: [{
          uri: uri.href,
          text: tables.map((t: {sql: string}) => t.sql).join("\n")
        }]
      };
    } finally {
      await db.close();
    }
  }
);

server.tool(
  "query",
  { sql: z.string() },
  async ({ sql }) => {
    const db = getDb();
    try {
      const results = await db.all(sql);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(results, null, 2)
        }]
      };
    } catch (err: unknown) {
      const error = err as Error;
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    } finally {
      await db.close();
    }
  }
);
```

## Advanced Usage

### Dynamic Servers

If you want to offer an initial set of tools/prompts/resources, but later add additional ones based on user action or external state change, you can add/update/remove them _after_ the Server is connected. This will automatically emit the corresponding `listChanged` notificaions:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "Dynamic Example",
  version: "1.0.0"
});

const listMessageTool = server.tool(
  "listMessages",
  { channel: z.string() },
  async ({ channel }) => ({
    content: [{ type: "text", text: await listMessages(channel) }]
  })
);

const putMessageTool = server.tool(
  "putMessage",
  { channel: z.string(), message: z.string() },
  async ({ channel, message }) => ({
    content: [{ type: "text", text: await putMessage(channel, string) }]
  })
);
// Until we upgrade auth, `putMessage` is disabled (won't show up in listTools)
putMessageTool.disable()

const upgradeAuthTool = server.tool(
  "upgradeAuth",
  { permission: z.enum(["write', vadmin"])},
  // Any mutations here will automatically emit `listChanged` notifications
  async ({ permission }) => {
    const { ok, err, previous } = await upgradeAuthAndStoreToken(permission)
    if (!ok) return {content: [{ type: "text", text: `Error: ${err}` }]}

    // If we previously had read-only access, 'putMessage' is now available
    if (previous === "read") {
      putMessageTool.enable()
    }

    if (permission === 'write') {
      // If we've just upgraded to 'write' permissions, we can still call 'upgradeAuth' 
      // but can only upgrade to 'admin'. 
      upgradeAuthTool.update({
        paramSchema: { permission: z.enum(["admin"]) }, // change validation rules
      })
    } else {
      // If we're now an admin, we no longer have anywhere to upgrade to, so fully remove that tool
      upgradeAuthTool.remove()
    }
  }
)

// Connect as normal
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Low-Level Server

For more control, you can use the low-level Server class directly:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "example-server",
    version: "1.0.0"
  },
  {
    capabilities: {
      prompts: {}
    }
  }
);

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [{
      name: "example-prompt",
      description: "An example prompt template",
      arguments: [{
        name: "arg1",
        description: "Example argument",
        required: true
      }]
    }]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== "example-prompt") {
    throw new Error("Unknown prompt");
  }
  return {
    description: "Example prompt",
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: "Example prompt text"
      }
    }]
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Writing MCP Clients

The SDK provides a high-level client interface:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"]
});

const client = new Client(
  {
    name: "example-client",
    version: "1.0.0"
  }
);

await client.connect(transport);

// List prompts
const prompts = await client.listPrompts();

// Get a prompt
const prompt = await client.getPrompt({
  name: "example-prompt",
  arguments: {
    arg1: "value"
  }
});

// List resources
const resources = await client.listResources();

// Read a resource
const resource = await client.readResource({
  uri: "file:///example.txt"
});

// Call a tool
const result = await client.callTool({
  name: "example-tool",
  arguments: {
    arg1: "value"
  }
});
```

### Proxy Authorization Requests Upstream

You can proxy OAuth requests to an external authorization provider:

```typescript
import express from 'express';
import { ProxyOAuthServerProvider, mcpAuthRouter } from '@modelcontextprotocol/sdk';

const app = express();

const proxyProvider = new ProxyOAuthServerProvider({
    endpoints: {
        authorizationUrl: "https://auth.external.com/oauth2/v1/authorize",
        tokenUrl: "https://auth.external.com/oauth2/v1/token",
        revocationUrl: "https://auth.external.com/oauth2/v1/revoke",
    },
    verifyAccessToken: async (token) => {
        return {
            token,
            clientId: "123",
            scopes: ["openid", "email", "profile"],
        }
    },
    getClient: async (client_id) => {
        return {
            client_id,
            redirect_uris: ["http://localhost:3000/callback"],
        }
    }
})

app.use(mcpAuthRouter({
    provider: proxyProvider,
    issuerUrl: new URL("http://auth.external.com"),
    baseUrl: new URL("http://mcp.example.com"),
    serviceDocumentationUrl: new URL("https://docs.example.com/"),
}))
```

This setup allows you to:
- Forward OAuth requests to an external provider
- Add custom token validation logic
- Manage client registrations
- Provide custom documentation URLs
- Maintain control over the OAuth flow while delegating to an external provider

### Backwards Compatibility

Clients and servers with StreamableHttp tranport can maintain [backwards compatibility](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#backwards-compatibility) with the deprecated HTTP+SSE transport (from protocol version 2024-11-05) as follows

#### Client-Side Compatibility

For clients that need to work with both Streamable HTTP and older SSE servers:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
let client: Client|undefined = undefined
const baseUrl = new URL(url);
try {
  client = new Client({
    name: 'streamable-http-client',
    version: '1.0.0'
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(baseUrl)
  );
  await client.connect(transport);
  console.log("Connected using Streamable HTTP transport");
} catch (error) {
  // If that fails with a 4xx error, try the older SSE transport
  console.log("Streamable HTTP connection failed, falling back to SSE transport");
  client = new Client({
    name: 'sse-client',
    version: '1.0.0'
  });
  const sseTransport = new SSEClientTransport(baseUrl);
  await client.connect(sseTransport);
  console.log("Connected using SSE transport");
}
```

#### Server-Side Compatibility

For servers that need to support both Streamable HTTP and older clients:

```typescript
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const server = new McpServer({
  name: "backwards-compatible-server",
  version: "1.0.0"
});

// ... set up server resources, tools, and prompts ...

const app = express();
app.use(express.json());

// Store transports for each session type
const transports = {
  streamable: {} as Record<string, StreamableHTTPServerTransport>,
  sse: {} as Record<string, SSEServerTransport>
};

// Modern Streamable HTTP endpoint
app.all('/mcp', async (req, res) => {
  // Handle Streamable HTTP transport for modern clients
  // Implementation as shown in the "With Session Management" example
  // ...
});

// Legacy SSE endpoint for older clients
app.get('/sse', async (req, res) => {
  // Create SSE transport for legacy clients
  const transport = new SSEServerTransport('/messages', res);
  transports.sse[transport.sessionId] = transport;
  
  res.on("close", () => {
    delete transports.sse[transport.sessionId];
  });
  
  await server.connect(transport);
});

// Legacy message endpoint for older clients
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.sse[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});

app.listen(3000);
```

**Note**: The SSE transport is now deprecated in favor of Streamable HTTP. New implementations should use Streamable HTTP, and existing SSE implementations should plan to migrate.

## Documentation

- [Model Context Protocol documentation](https://modelcontextprotocol.io)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- [Example Servers](https://github.com/modelcontextprotocol/servers)

## Contributing

Issues and pull requests are welcome on GitHub at https://github.com/modelcontextprotocol/typescript-sdk.

## License

This project is licensed under the MIT License—see the [LICENSE](LICENSE) file for details.---
description: Should be referenced when working with testing
globs: 
alwaysApply: false
---
# Model Context Providers Testing Guide
You are an expert in TypeScript and Jest and testing Model Context Protocol implementations.

## Core Concepts and Architecture

- all tests and feature sliced, they go in the __tests__ folder in the root of each feature
- use builder pattern to create helpers where model entities are worked with out side of what is being tested
- create test helpers for common used functionality within testing
    - create global test helpers that can used trought out the system
    - create local test helpers for features slices or single entities
    - create tests for test helpers so we are sure they work
- create a single test file per area of testing per feature e.g create, delete, find, get and move. The only exception to this is with trees, where ancestor, tree and root can be grouped together. This is because they are just tree manipulation of hierarchical content
- testing should be minimal per feature, we just want to smoke test the api calls to Umbraco. Not test Umbraco
- all strings used in builders should be a constant at the head of the test
- all created object should be deleted / cleaned up in the after test hook

## Inside test rules

- always use arrange, act and assert
- instead of asserting on individual properties, snapshots should be used to assert content of json objects
- turn off console.error for testing
- create local constants for any entity names, don't use magic strings
- don't rely on existing content, always create new content and delete when finished
- test the tool handlers not MCP itself
- any api params should use the zod schema to parse objects
- always remove any UUID's for id's and parent id's as these cause snapshots to fail. Use the helper provider to convert these into blank id's
- for the act phase of testing always use the call to the tool handle. For the arrange always use the helper or the builder.
- any password field will need to be at least 10 characters and contain at least one number and one symbol.

The Dictionary entity is the gold standard for testing. Use this as a reference for creating new feature testing suites. This is both in terms of the splitting between logical api endpoints and the number of tests created.

Here is an example of a test as reference

```
import CreateDictionaryItemTool from "../post/create-dictionary-item.js";
import { DEFAULT_ISO_CODE, DictionaryVerificationHelper } from "./helpers/dictionary-verification-helper.js";
import { jest } from "@jest/globals";

const TEST_DICTIONARY_NAME = "_Test Dictionary Created";
const TEST_DICTIONARY_TRANSLATION = "_Test Translation";
const EXISTING_DICTIONARY_NAME = "_Existing Dictionary";
const EXISTING_DICTIONARY_TRANSLATION = "_Existing Translation";

describe("create-dictionary-item", () => {
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleError = console.error;
    console.error = jest.fn();
  });

  afterEach(async () => {
    console.error = originalConsoleError;
    // Clean up any test dictionary items
    await DictionaryVerificationHelper.cleanup(TEST_DICTIONARY_NAME);
    await DictionaryVerificationHelper.cleanup(EXISTING_DICTIONARY_NAME);
  });

  it("should create a dictionary item", async () => {
    const result = await CreateDictionaryItemTool().handler({
      name: TEST_DICTIONARY_NAME,
      translations: [{ isoCode: DEFAULT_ISO_CODE, translation: TEST_DICTIONARY_TRANSLATION }]
    }, { signal: new AbortController().signal });

    // Verify the handler response using snapshot
    expect(result).toMatchSnapshot();

    // Verify the created item exists and matches expected values
    const items = await DictionaryVerificationHelper.findDictionaryItems(TEST_DICTIONARY_NAME, true);
    expect(items).toMatchSnapshot();
  });

  it("should handle existing dictionary item", async () => {
    // First create the item
    await CreateDictionaryItemTool().handler({
      name: EXISTING_DICTIONARY_NAME,
      translations: [{ isoCode: DEFAULT_ISO_CODE, translation: EXISTING_DICTIONARY_TRANSLATION }]
    }, { signal: new AbortController().signal });

    // Try to create it again
    const result = await CreateDictionaryItemTool().handler({
      name: EXISTING_DICTIONARY_NAME,
      translations: [{ isoCode: DEFAULT_ISO_CODE, translation: EXISTING_DICTIONARY_TRANSLATION }]
    }, { signal: new AbortController().signal });

    // Verify the error response using snapshot
    expect(result).toMatchSnapshot();
  });
}); 
```

## Process for generating tests for a feature

Always follow this process when asked to create testing for a new feature. Complete these one at a time, always stop between each step.

- always build the builder first for the entities present in the feature. There may be more than one, e.g Document Blueprints have Document Blueprint and Document BluePrint folders
- before actual testing create a helper alongside the builder that will allow easy arrangement. This likely includes methods to 
    - normalise ids : convert all generated ids to the blank for snapshotting
    - cleanup : remove any added items for tests
    - find : find an items from the search / items, dependant on the feature. be careful
- next start by creating one test for creating a entity then stop and test that
- then create the CRUD operations
- then add items tests (ancestor, chidren, root)
- then add folder tests

## Builders

Test builders help us to create a narrative around the arrange partt of the test. They help us to build up and create instance of the entity. 

- should include the model that is typed the to the create requests RequuestModel i.e CreateDictionaryItemRequestModel for postDictionary
- should include with methods that add new data to the model. They always return this.
```
  withName(name: string): DictionaryBuilder {
    this.model.name = name;
    return this;
  }
```
- should include a build method that returns the model
- should include a create method that is async and returns a Promise<Builder>
    - the create should use zod to verify the model
    - the create should create a new entity and set a local createdItem property with the newly create entity
    - the create should check that the model has been created by either
        - getting the model directly from the API. only possible if the API includes a endpoint that get by name
        - if this is not the case then use the find static method on the helper to get the entity
- should include a getId method that return the created item id
- should include a getItem method that returns the created item,

The builder shouls always have integration tests that test that the builder works and integrates correctly

---
description: 
globs: 
alwaysApply: true
---
# Model Context Providers Development Guide

You are an expert in TypeScript and Model Context Protocol implementation.

## Core Concepts and Architecture

- Follow the [Model Context Protocol](mdc:https:/modelcontextprotocol.io/introduction) specifications for implementing context providers.
- Creates standardized interfaces between LLMs and your application's context.
- Use TypeScript for all implementations to ensure type safety and better developer experience.
- Structure providers to handle different types of context: resource retieval, prompt creation, tool invocation, etc.
- Model context providers are made up of resources, prompts and tools. For the rest of this document we will use the name provider files to logically group these different types.

## Provider Structure and Organization

- Organize providers in a modular, composable architecture.
- Structure files: exported provider, context handling logic, retrieval methods, serialization, types.

## Naming Conventions

- Use descriptive, consistent naming for provider files (e.g., `DocumentContextProvider`, `ConversationHistoryProvider`).
- Use descripive, consistant file naming for provider files (e.g., `DocumentContextProvider`, `ConversationHistoryProvider`).
- Follow camelCase for methods and PascalCase for interface names.

## Umbraco API Integration

- The Umbraco API exposes the management API for Umbraco
    - It contains Gets, Posts, Puts, Deletes for inreacting with Umbraco
    - It contains groups of endpoints including Culture, Data Type, Dictionary, Document Blueprint, Document Type, Document Version, Document, Dynamic Root, Health Check, Help, Imaging, Import Indexer, Install, Lanuage, Log Viewer, Manifest, Media Type, Media, Member Group, Member Type, Member, Models Builder, Object Types, oEmbed, Package, Partial View, Preview, Profiling, Property Type, Published Cache, Redirect Management, Relation Type, Scripts, Search, Security, Segment, Server, Static File, Stylesheet, Segment, Telemetry, Template, Temporary File, Upgrade, User Data, User Group, User, Webhook
- The Umbraco API client and models are generated using Orval. 
- The Umbraco API is in the /src/api/umbraco
- Use the UmbracoManagmentClient to make an instance of the client
```
    const client = UmbracoManagementClient.getClient();
```
- All schemas are generated for all data, params, requests and responses.
- Zod schemas have been generated for all data, params, requests and responses. 
- Zod schemas should always be used to validate any params into provider files 
- When placing tools or resources in folders use the rest verb to group the files e.g put actions in the put folder
- When placing tools in folders also group by common types, so folder actions and item action gets groups together. Also group items by rest verb as above within sub folders.

## Resources Intergration
In MCP resources are readonly endpoints for LLM's to query and provide context. They should be used for Get requests.

- There are 2 types of resource calls, static resource and dynamic resource. Dynamic resources can be filtered and changed using params, static resources always return the same data.

## Read Resource
- Static resources using CreateUmbracoReadResource 
    - they always have a url that starts with umbraco:// and breaks down the logical path for the endpoint e.g getItemLanguageDefault os umbraco://item/language/default
    - they always use a name that respresents the umbraco endpoint
    - they always use a description that represents the endpoint 
    - they always use a try catch to catch reponse errors 
- here is an example of the implementation
```
import { UmbracoManagementClient } from "@/clients/umbraco-management-client.js";
import { CreateUmbracoReadResource } from "@/helpers/create-umbraco-read-resource.js";

const GetLangagueDefaultResource = CreateUmbracoReadResource(
  "umbraco://item/langage/default",
  "List default language",
  "List the default language for the current Umbraco instance",
  async (uri) => {
    try {
      const client = UmbracoManagementClient.getClient();
      const response = await client.getItemLanguageDefault();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(response, null, 2),
          mimeType: "application/json"
        }]
      };
    } catch (error) {
      console.error('Error in GetItemLanguageDefault:', error);
      throw error;
    }
  }
);

export default GetLangagueDefaultResource;
```

## Resource Template
- Resource templates using CreateUmbracoTemplateResource 
    - they always use a name that respresents the umbraco endpoint
    - they always use a description that represents the endpoint 
    - they always have a url that starts with umbraco:// and breaks down the logical path for the endpoint e.g getItemLanguageDefault os umbraco://item/language/default
    - the url always contains query strings for the params that are taken from the zod schema definition i.e params of skip, take and foldersOnly become ?skip={skip}&take={take}&foldersOnly={foldersOnly}
    - valid options for the params are shown in the complete property on the ResourceTemplate definition, they always match the param type i.e true and false for boolen but the value is always string. e.g
    ```
        new ResourceTemplate("umbraco://data-type/root?skip={skip}&take={take}&foldersOnly={foldersOnly}", {
            list: undefined,
            complete: {
            skip: (value: string) => ["0", "10", "20", "30", "40", "50", "60", "70", "80", "90", "100"],
            take: (value: string) => ["10", "20", "50", "100"],
            foldersOnly: (value: string) => ["true", "false"]
            }
        }),
    ```
    - they always use the zod schema to parse the raw passed variables
    - they always use a try catch to catch reponse errors 
- here is an example of the implementation
```
import { UmbracoManagementClient } from "@/clients/umbraco-management-client.js";
import { CreateUmbracoTemplateResource } from "@/helpers/create-umbraco-template-resource.js";
import { getTreeDataTypeRootQueryParams } from "@/umb-management-api/umbracoManagementAPI.zod.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

const GetDataTypeRootResource = CreateUmbracoTemplateResource(
  "List Data Types at Root",
  "List the data types at the root of the Umbraco instance",
  new ResourceTemplate("umbraco://data-type/root?skip={skip}&take={take}&foldersOnly={foldersOnly}", {
    list: undefined,
    complete: {
      skip: (value: string) => ["0", "10", "20", "30", "40", "50", "60", "70", "80", "90", "100"],
      take: (value: string) => ["10", "20", "50", "100"],
      foldersOnly: (value: string) => ["true", "false"]
    }
  }),
  async (uri, variables) => {
    try {
      const client = UmbracoManagementClient.getClient();
      const params = getTreeDataTypeRootQueryParams.parse(variables);
      const response = await client.getTreeDataTypeRoot(params);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(response, null, 2),
          mimeType: "application/json"
        }]
      };
    } catch (error) {
      console.error('Error in GetDataTypeRootResource:', error);
      throw error;
    }
  }
);

export default GetDataTypeRootResource;
```

## Tool Intergration
In MCP tools are endpoints for LLM's to query and perform actions against a resource. They should be used for Get, Post, Put, Delete requests.

- There are 1 types of tool calls. Dynamic tools can be used to query or change the resource by using params.
    - they always use a name that respresents the umbraco endpoint
    - they always use a description that represents the endpoint 
    - they always of the shape of the zod definition to define how the tool interacts with the LLM.
    - the handler always has a parameter that matches the model for the zod schema definition
- here is an example of the implementation
```
import { UmbracoManagementClient } from "@/clients/umbraco-management-client.js";
import { CreateUmbracoTool } from "@/helpers/create-umbraco-tool.js";
import { GetFilterDataTypeParams } from "@/umb-management-api/schemas/index.js";
import { getFilterDataTypeQueryParams } from "@/umb-management-api/umbracoManagementAPI.zod.js";

const FindDataTypeTool = CreateUmbracoTool(
  "find-data-type",
  "Finds a data type by Id or Name",
  getFilterDataTypeQueryParams.shape,
  async (model: GetFilterDataTypeParams) => {
      const client = UmbracoManagementClient.getClient();
      var response = await client.getFilterDataType(model);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(response),
          },
        ],
      };
  }
);

export default FindDataTypeTool;
```

## TypeScript Implementation

- Define clear interfaces for all context objects and provider methods.
- Use generics to create flexible, reusable provider implementations.
- Implement proper error handling with custom error types.
- Use TypeScript's discriminated unions for context type differentiation.

## Key Conventions

1. Follow the Model Context Protocol specifications rigorously.
2. Prioritize type safety throughout the implementation.
3. Design for composability and extensibility.
4. Optimize for relevant context retrieval rather than volume.
5. Implement robust error handling and fallback mechanisms.
6. Test with multiple model providers to ensure compatibility.
7. Document all providers, interfaces, and integration patterns.

## Additional Resources

- [Model Context Protocol Specification](mdc:https:/modelcontextprotocol.io/specification)
- [Retrieval Augmented Generation Best Practices](mdc:https:/modelcontextprotocol.io/rag)
- [Tool Integration Guidelines](mdc:https:/modelcontextprotocol.io/tools)
- [Context Window Management](mdc:https:/modelcontextprotocol.io/context-window)