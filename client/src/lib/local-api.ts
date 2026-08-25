/**
 * In-browser API backend.
 *
 * The original app shipped an Express server (server/routes.ts + server/storage.ts)
 * backed by purely in-memory data (no database, no secrets). To let the whole
 * site run as a static deployment (e.g. Cloudflare Pages) with zero backend, we
 * reuse that same in-memory storage in the browser and intercept `/api/*` fetch
 * calls, serving them locally. Each visitor gets their own isolated sandbox.
 *
 * This module is the heavy half: it pulls in server/storage and, through the
 * shared schema, zod. It used to patch window.fetch on import, which meant
 * every visitor to the blog or the contact page downloaded the whole API
 * backend to serve requests they would never make. The interceptor now lives
 * in local-api-install.ts and imports this on the first /api/ call.
 */

import { storage } from "../../../server/storage";

// ============ Route dispatch (mirrors server/routes.ts) ============

type RouteResult = { status: number; body?: unknown };

function json(body: unknown, status = 200): RouteResult {
  return { status, body };
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

async function handleApi(method: string, pathname: string, body: any): Promise<RouteResult> {
  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/");
  const seg = parts.slice(1); // drop leading "api"

  // /api/game-state
  if (seg[0] === "game-state" && seg.length === 1) {
    if (method === "GET") return json(await storage.getGameState());
    if (method === "PATCH") return json(await storage.updateGameState(body || {}));
  }

  // /api/racks ...
  if (seg[0] === "racks") {
    if (seg.length === 1) {
      if (method === "GET") return json(await storage.getRacks());
      if (method === "POST") return json(await storage.createRack(body), 201);
    }
    if (seg.length === 2) {
      const id = seg[1];
      if (method === "GET") {
        const rack = await storage.getRack(id);
        return rack ? json(rack) : json({ error: "Rack not found" }, 404);
      }
      if (method === "PATCH") {
        const rack = await storage.updateRack(id, body);
        return rack ? json(rack) : json({ error: "Rack not found" }, 404);
      }
      if (method === "DELETE") {
        const ok = await storage.deleteRack(id);
        return ok ? { status: 204 } : json({ error: "Rack not found" }, 404);
      }
    }
    if (seg.length === 3 && seg[2] === "equipment" && method === "POST") {
      const rack = await storage.addEquipmentToRack(seg[1], String(body?.equipmentId), num(body?.uStart));
      return rack ? json(rack, 201) : json({ error: "Could not add equipment - slot occupied or invalid position" }, 400);
    }
    if (seg.length === 4 && seg[2] === "equipment" && method === "DELETE") {
      const rack = await storage.removeEquipmentFromRack(seg[1], seg[3]);
      return rack ? json(rack) : json({ error: "Equipment or rack not found" }, 404);
    }
  }

  // /api/equipment
  if (seg[0] === "equipment" && seg.length === 1 && method === "GET") {
    return json(await storage.getEquipmentCatalog());
  }

  // /api/datacenter/generate-maxed
  if (seg[0] === "datacenter" && seg[1] === "generate-maxed" && method === "POST") {
    return json(await storage.generateMaxedDatacenter());
  }

  // /api/servers ...
  if (seg[0] === "servers") {
    if (seg.length === 1) {
      if (method === "GET") return json(await storage.getServers());
      if (method === "POST") return json(await storage.createServer(body), 201);
    }
    if (seg.length === 2) {
      const id = seg[1];
      if (method === "GET") {
        const s = await storage.getServer(id);
        return s ? json(s) : json({ error: "Server not found" }, 404);
      }
      if (method === "PATCH") {
        const s = await storage.updateServer(id, body);
        return s ? json(s) : json({ error: "Server not found" }, 404);
      }
    }
  }

  // /api/alerts ...
  if (seg[0] === "alerts") {
    if (seg.length === 1) {
      if (method === "GET") return json(await storage.getAlerts());
      if (method === "POST") return json(await storage.createAlert(body), 201);
    }
    if (seg.length === 3 && seg[2] === "acknowledge" && method === "PATCH") {
      const a = await storage.acknowledgeAlert(seg[1]);
      return a ? json(a) : json({ error: "Alert not found" }, 404);
    }
  }

  // /api/incidents ...
  if (seg[0] === "incidents") {
    if (seg.length === 1 && method === "GET") return json(await storage.getIncidents());
    if (seg.length === 2 && method === "GET") {
      const i = await storage.getIncident(seg[1]);
      return i ? json(i) : json({ error: "Incident not found" }, 404);
    }
    if (seg.length === 3 && seg[2] === "status" && method === "PATCH") {
      const i = await storage.updateIncidentStatus(seg[1], body?.status);
      return i ? json(i) : json({ error: "Incident not found" }, 404);
    }
  }

  // /api/network ...
  if (seg[0] === "network") {
    if (seg.length === 1 && method === "GET") {
      const [nodes, links] = await Promise.all([storage.getNetworkNodes(), storage.getNetworkLinks()]);
      return json({ nodes, links });
    }
    if (seg[1] === "nodes" && method === "GET") return json(await storage.getNetworkNodes());
    if (seg[1] === "links" && method === "GET") return json(await storage.getNetworkLinks());
  }

  // /api/metrics
  if (seg[0] === "metrics" && method === "GET") return json(await storage.getFacilityMetrics());

  // /api/inventory
  if (seg[0] === "inventory" && method === "GET") return json(await storage.getInventory());

  // /api/init
  if (seg[0] === "init" && method === "GET") {
    const [gameState, racks, servers, alerts, incidents, nodes, links, metrics, inventory] = await Promise.all([
      storage.getGameState(),
      storage.getRacks(),
      storage.getServers(),
      storage.getAlerts(),
      storage.getIncidents(),
      storage.getNetworkNodes(),
      storage.getNetworkLinks(),
      storage.getFacilityMetrics(),
      storage.getInventory(),
    ]);
    return json({
      gameState,
      racks,
      servers,
      alerts,
      incidents,
      networkNodes: nodes,
      networkLinks: links,
      facilityMetrics: metrics,
      inventory,
    });
  }

  return json({ error: "Not found" }, 404);
}

function toResponse(result: RouteResult): Response {
  if (result.status === 204) return new Response(null, { status: 204 });
  return new Response(JSON.stringify(result.body ?? null), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Serve one /api/ request from the in-browser backend.
 *
 * Called by the interceptor in local-api-install.ts once this module has
 * been fetched.
 */
export async function respond(
  method: string,
  pathname: string,
  body: unknown,
): Promise<Response> {
  return toResponse(await handleApi(method, pathname, body));
}
