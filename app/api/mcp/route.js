import { NextResponse } from "next/server";
import { validateMcpKey } from "@/lib/mcp-auth";
import {
  listProjects,
  getProjectContext,
  getContextHistory,
  appendContextItem,
  updateCompressedText,
} from "@/lib/context";

// --- Tool & Resource Definitions ---

const SERVER_INFO = {
  protocolVersion: "2025-03-26",
  capabilities: { tools: {}, resources: {} },
  serverInfo: { name: "nexus-context", version: "1.0.0" },
};

const TOOLS = [
  {
    name: "list_projects",
    description:
      "List all active projects with their context metadata, version info, and chat counts",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_context",
    description:
      "Get the full current context for a project including decisions, discoveries, constraints, and the compressed text that gets injected into system prompts",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "integer", description: "The project ID" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "add_decision",
    description:
      "Record a project decision. Appends to the decisions list, regenerates the compressed context, and creates a new context version.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "integer", description: "The project ID" },
        decision: { type: "string", description: "What was decided" },
        rationale: {
          type: "string",
          description: "Why this decision was made (optional)",
        },
        source: {
          type: "string",
          description:
            "Which tool is recording this (claude.ai, code, nexus)",
          default: "nexus",
        },
      },
      required: ["project_id", "decision"],
    },
  },
  {
    name: "add_discovery",
    description:
      "Record a project discovery — something learned during development or analysis. Appends to discoveries, regenerates context, creates new version.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "integer", description: "The project ID" },
        discovery: {
          type: "string",
          description: "What was discovered or learned",
        },
        source: {
          type: "string",
          description: "Which tool is recording this",
          default: "nexus",
        },
      },
      required: ["project_id", "discovery"],
    },
  },
  {
    name: "add_constraint",
    description:
      "Record a project constraint — a boundary or limitation on the solution space. Appends to constraints, regenerates context, creates new version.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "integer", description: "The project ID" },
        constraint: {
          type: "string",
          description: "The constraint or limitation",
        },
        source: {
          type: "string",
          description: "Which tool is recording this",
          default: "nexus",
        },
      },
      required: ["project_id", "constraint"],
    },
  },
  {
    name: "update_context",
    description:
      "Replace the entire compressed_text for a project. Use for bulk context updates when the incremental add tools aren't sufficient.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "integer", description: "The project ID" },
        compressed_text: {
          type: "string",
          description: "The full replacement text for the project context",
        },
        source: {
          type: "string",
          description: "Which tool is recording this",
          default: "nexus",
        },
      },
      required: ["project_id", "compressed_text"],
    },
  },
];

// --- JSON-RPC Helpers ---

function jsonRpcResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

// --- Resource Handling ---

async function handleResourcesList() {
  const projects = await listProjects();
  const resources = [
    {
      uri: "projects://list",
      name: "Project List",
      description: "All active projects with context metadata",
      mimeType: "application/json",
    },
  ];
  for (const p of projects) {
    resources.push({
      uri: `projects://${p.id}/context`,
      name: `${p.name} — Context`,
      description: `Full context for project: ${p.name}`,
      mimeType: "application/json",
    });
  }
  return { resources };
}

async function handleResourcesRead(params) {
  const uri = params?.uri;
  if (!uri) return { contents: [] };

  if (uri === "projects://list") {
    const projects = await listProjects();
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(projects, null, 2),
        },
      ],
    };
  }

  const contextMatch = uri.match(/^projects:\/\/(\d+)\/context$/);
  if (contextMatch) {
    const data = await getProjectContext(Number(contextMatch[1]));
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  const historyMatch = uri.match(/^projects:\/\/(\d+)\/history$/);
  if (historyMatch) {
    const data = await getContextHistory(Number(historyMatch[1]));
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  return { contents: [] };
}

// --- Tool Execution ---

async function handleToolCall(params) {
  const { name, arguments: args } = params;

  switch (name) {
    case "list_projects": {
      const projects = await listProjects();
      return toolResult(projects);
    }

    case "get_context": {
      const data = await getProjectContext(args.project_id);
      if (!data) return toolResult({ error: "Project not found" });
      return toolResult(data);
    }

    case "add_decision": {
      let text = args.decision;
      if (args.rationale) text += ` — Rationale: ${args.rationale}`;
      const result = await appendContextItem(
        args.project_id,
        "decisions",
        text,
        args.source || "nexus"
      );
      return toolResult(result);
    }

    case "add_discovery": {
      const result = await appendContextItem(
        args.project_id,
        "discoveries",
        args.discovery,
        args.source || "nexus"
      );
      return toolResult(result);
    }

    case "add_constraint": {
      const result = await appendContextItem(
        args.project_id,
        "constraints",
        args.constraint,
        args.source || "nexus"
      );
      return toolResult(result);
    }

    case "update_context": {
      const result = await updateCompressedText(
        args.project_id,
        args.compressed_text,
        args.source || "nexus"
      );
      return toolResult(result);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- Method Router ---

async function handleMethod(method, params, id) {
  switch (method) {
    case "initialize":
      return jsonRpcResponse(id, SERVER_INFO);

    case "notifications/initialized":
      // Notification — no response needed
      return null;

    case "ping":
      return jsonRpcResponse(id, {});

    case "resources/list":
      return jsonRpcResponse(id, await handleResourcesList());

    case "resources/read":
      return jsonRpcResponse(id, await handleResourcesRead(params));

    case "tools/list":
      return jsonRpcResponse(id, { tools: TOOLS });

    case "tools/call":
      try {
        const result = await handleToolCall(params);
        return jsonRpcResponse(id, result);
      } catch (err) {
        return jsonRpcResponse(id, {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        });
      }

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

// --- HTTP Handlers ---

/**
 * GET /api/mcp — SSE endpoint for MCP transport compatibility.
 * Sends an endpoint event pointing clients to POST on the same URL.
 */
export async function GET(request) {
  const valid = await validateMcpKey(request);
  if (!valid) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const endpoint = `${url.origin}/api/mcp`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send the endpoint event for SSE transport clients
      controller.enqueue(
        encoder.encode(`event: endpoint\ndata: ${endpoint}\n\n`)
      );

      // Keep-alive ping every 30 seconds
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(interval);
        }
      }, 30000);

      // Clean up if the connection is aborted
      request.signal?.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * POST /api/mcp — Streamable HTTP transport.
 * Receives JSON-RPC 2.0 requests and returns JSON responses.
 */
export async function POST(request) {
  const valid = await validateMcpKey(request);
  if (!valid) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      jsonRpcError(null, -32700, "Parse error"),
      { status: 400 }
    );
  }

  // Handle batch requests
  if (Array.isArray(body)) {
    const results = [];
    for (const msg of body) {
      const result = await handleMethod(msg.method, msg.params, msg.id);
      if (result !== null) results.push(result);
    }
    if (results.length === 0) {
      return new Response(null, { status: 204 });
    }
    return NextResponse.json(results);
  }

  // Single request
  const { jsonrpc, id, method, params } = body;

  if (jsonrpc !== "2.0") {
    return NextResponse.json(
      jsonRpcError(id, -32600, "Invalid JSON-RPC version"),
      { status: 400 }
    );
  }

  const result = await handleMethod(method, params, id);

  // Notifications (no id) don't get responses
  if (result === null) {
    return new Response(null, { status: 204 });
  }

  return NextResponse.json(result);
}
