import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import {
  gameModeSchema,
  insertRackSchema,
  insertServerConfigSchema,
  incidentSchema,
  alertSchema,
} from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Game State
  app.get("/api/game-state", async (_req, res) => {
    const state = await storage.getGameState();
    res.json(state);
  });

  app.patch("/api/game-state", async (req, res) => {
    try {
      const schema = z.object({
        currentMode: gameModeSchema.optional(),
        money: z.number().optional(),
        reputation: z.number().optional(),
      });
      const validated = schema.parse(req.body);
      const updated = await storage.updateGameState(validated);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request body", details: error.errors });
      }
      throw error;
    }
  });

  // Racks
  app.get("/api/racks", async (_req, res) => {
    const racks = await storage.getRacks();
    res.json(racks);
  });

  app.get("/api/racks/:id", async (req, res) => {
    const rack = await storage.getRack(req.params.id);
    if (!rack) {
      return res.status(404).json({ error: "Rack not found" });
    }
    res.json(rack);
  });

  app.post("/api/racks", async (req, res) => {
    try {
      const validated = insertRackSchema.parse(req.body);
      const rack = await storage.createRack(validated);
      res.status(201).json(rack);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid rack data", details: error.errors });
      }
      throw error;
    }
  });

  app.patch("/api/racks/:id", async (req, res) => {
    try {
      const schema = insertRackSchema.partial();
      const validated = schema.parse(req.body);
      const rack = await storage.updateRack(req.params.id, validated);
      if (!rack) {
        return res.status(404).json({ error: "Rack not found" });
      }
      res.json(rack);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid rack update", details: error.errors });
      }
      throw error;
    }
  });

  app.delete("/api/racks/:id", async (req, res) => {
    const deleted = await storage.deleteRack(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Rack not found" });
    }
    res.status(204).send();
  });

  // Equipment Catalog
  app.get("/api/equipment", async (_req, res) => {
    const equipment = await storage.getEquipmentCatalog();
    res.json(equipment);
  });

  // Rack Equipment Management
  app.post("/api/racks/:id/equipment", async (req, res) => {
    try {
      const schema = z.object({
        equipmentId: z.string(),
        uStart: z.number().min(1).max(42),
      });
      const validated = schema.parse(req.body);
      const rack = await storage.addEquipmentToRack(req.params.id, validated.equipmentId, validated.uStart);
      if (!rack) {
        return res.status(400).json({ error: "Could not add equipment - slot occupied or invalid position" });
      }
      res.status(201).json(rack);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      throw error;
    }
  });

  app.delete("/api/racks/:rackId/equipment/:equipmentInstanceId", async (req, res) => {
    const rack = await storage.removeEquipmentFromRack(req.params.rackId, req.params.equipmentInstanceId);
    if (!rack) {
      return res.status(404).json({ error: "Equipment or rack not found" });
    }
    res.json(rack);
  });

  // Generate maxed datacenter
  app.post("/api/datacenter/generate-maxed", async (_req, res) => {
    const racks = await storage.generateMaxedDatacenter();
    res.json(racks);
  });

  // Servers
  app.get("/api/servers", async (_req, res) => {
    const servers = await storage.getServers();
    res.json(servers);
  });

  app.get("/api/servers/:id", async (req, res) => {
    const server = await storage.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }
    res.json(server);
  });

  app.post("/api/servers", async (req, res) => {
    try {
      const validated = insertServerConfigSchema.parse(req.body);
      const server = await storage.createServer(validated);
      res.status(201).json(server);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid server data", details: error.errors });
      }
      throw error;
    }
  });

  app.patch("/api/servers/:id", async (req, res) => {
    try {
      const schema = insertServerConfigSchema.partial();
      const validated = schema.parse(req.body);
      const server = await storage.updateServer(req.params.id, validated);
      if (!server) {
        return res.status(404).json({ error: "Server not found" });
      }
      res.json(server);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid server update", details: error.errors });
      }
      throw error;
    }
  });

  // Alerts
  app.get("/api/alerts", async (_req, res) => {
    const alerts = await storage.getAlerts();
    res.json(alerts);
  });

  app.post("/api/alerts", async (req, res) => {
    try {
      const insertAlertSchema = alertSchema.omit({ id: true });
      const validated = insertAlertSchema.parse(req.body);
      const alert = await storage.createAlert(validated);
      res.status(201).json(alert);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid alert data", details: error.errors });
      }
      throw error;
    }
  });

  app.patch("/api/alerts/:id/acknowledge", async (req, res) => {
    const alert = await storage.acknowledgeAlert(req.params.id);
    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }
    res.json(alert);
  });

  // Incidents
  app.get("/api/incidents", async (_req, res) => {
    const incidents = await storage.getIncidents();
    res.json(incidents);
  });

  app.get("/api/incidents/:id", async (req, res) => {
    const incident = await storage.getIncident(req.params.id);
    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }
    res.json(incident);
  });

  app.patch("/api/incidents/:id/status", async (req, res) => {
    try {
      const schema = z.object({ status: incidentSchema.shape.status });
      const { status } = schema.parse(req.body);
      const incident = await storage.updateIncidentStatus(req.params.id, status);
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }
      res.json(incident);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid status update", details: error.errors });
      }
      throw error;
    }
  });

  // Network
  app.get("/api/network/nodes", async (_req, res) => {
    const nodes = await storage.getNetworkNodes();
    res.json(nodes);
  });

  app.get("/api/network/links", async (_req, res) => {
    const links = await storage.getNetworkLinks();
    res.json(links);
  });

  app.get("/api/network", async (_req, res) => {
    const [nodes, links] = await Promise.all([
      storage.getNetworkNodes(),
      storage.getNetworkLinks(),
    ]);
    res.json({ nodes, links });
  });

  // Metrics
  app.get("/api/metrics", async (_req, res) => {
    const metrics = await storage.getFacilityMetrics();
    res.json(metrics);
  });

  // Inventory
  app.get("/api/inventory", async (_req, res) => {
    const inventory = await storage.getInventory();
    res.json(inventory);
  });

  // Combined initial data endpoint for frontend
  app.get("/api/init", async (_req, res) => {
    const [gameState, racks, servers, alerts, incidents, network, metrics, inventory] =
      await Promise.all([
        storage.getGameState(),
        storage.getRacks(),
        storage.getServers(),
        storage.getAlerts(),
        storage.getIncidents(),
        Promise.all([storage.getNetworkNodes(), storage.getNetworkLinks()]),
        storage.getFacilityMetrics(),
        storage.getInventory(),
      ]);

    res.json({
      gameState,
      racks,
      servers,
      alerts,
      incidents,
      networkNodes: network[0],
      networkLinks: network[1],
      facilityMetrics: metrics,
      inventory,
    });
  });

  return httpServer;
}
