import { randomUUID } from "crypto";
import type {
  Rack,
  InsertRack,
  ServerConfig,
  InsertServerConfig,
  Alert,
  Incident,
  NetworkNode,
  NetworkLink,
  FacilityMetrics,
  CPU,
  RAM,
  Storage,
  NIC,
  RAIDController,
  GameState,
  Equipment,
  InstalledEquipment,
} from "@shared/schema";

export interface IStorage {
  // Game State
  getGameState(): Promise<GameState>;
  updateGameState(state: Partial<GameState>): Promise<GameState>;

  // Racks
  getRacks(): Promise<Rack[]>;
  getRack(id: string): Promise<Rack | undefined>;
  createRack(rack: InsertRack): Promise<Rack>;
  updateRack(id: string, rack: Partial<Rack>): Promise<Rack | undefined>;
  deleteRack(id: string): Promise<boolean>;

  // Servers
  getServers(): Promise<ServerConfig[]>;
  getServer(id: string): Promise<ServerConfig | undefined>;
  createServer(server: InsertServerConfig): Promise<ServerConfig>;
  updateServer(id: string, server: Partial<ServerConfig>): Promise<ServerConfig | undefined>;

  // Alerts
  getAlerts(): Promise<Alert[]>;
  acknowledgeAlert(id: string): Promise<Alert | undefined>;
  createAlert(alert: Omit<Alert, "id">): Promise<Alert>;

  // Incidents
  getIncidents(): Promise<Incident[]>;
  getIncident(id: string): Promise<Incident | undefined>;
  updateIncidentStatus(id: string, status: Incident["status"]): Promise<Incident | undefined>;

  // Network
  getNetworkNodes(): Promise<NetworkNode[]>;
  getNetworkLinks(): Promise<NetworkLink[]>;

  // Metrics
  getFacilityMetrics(): Promise<FacilityMetrics>;

  // Inventory
  getInventory(): Promise<{
    cpus: CPU[];
    rams: RAM[];
    storage: Storage[];
    nics: NIC[];
    raidControllers: RAIDController[];
  }>;

  // Equipment Catalog
  getEquipmentCatalog(): Promise<Equipment[]>;
  
  // Rack Equipment
  addEquipmentToRack(rackId: string, equipmentId: string, uStart: number): Promise<Rack | null>;
  removeEquipmentFromRack(rackId: string, equipmentInstanceId: string): Promise<Rack | null>;
  
  // Maxed datacenter
  generateMaxedDatacenter(): Promise<Rack[]>;
}

// Initial data
const initialInventory = {
  cpus: [
    { id: "cpu-1", name: "Intel Xeon Gold 6348", cores: 28, threads: 56, baseClock: 2.6, boostClock: 3.5, tdp: 235, architecture: "x86" as const, socket: "LGA4189", price: 3100 },
    { id: "cpu-2", name: "Intel Xeon Platinum 8380", cores: 40, threads: 80, baseClock: 2.3, boostClock: 3.4, tdp: 270, architecture: "x86" as const, socket: "LGA4189", price: 8100 },
    { id: "cpu-3", name: "AMD EPYC 7763", cores: 64, threads: 128, baseClock: 2.45, boostClock: 3.5, tdp: 280, architecture: "x86" as const, socket: "SP3", price: 7890 },
    { id: "cpu-4", name: "Ampere Altra Q80-30", cores: 80, threads: 80, baseClock: 3.0, boostClock: 3.0, tdp: 250, architecture: "ARM" as const, socket: "LGA4926", price: 5500 },
  ],
  rams: [
    { id: "ram-1", name: "Samsung DDR4-3200 ECC 32GB", capacity: 32, speed: 3200, type: "DDR4" as const, ecc: true, channels: 1, price: 180 },
    { id: "ram-2", name: "Samsung DDR4-3200 ECC 64GB", capacity: 64, speed: 3200, type: "DDR4" as const, ecc: true, channels: 1, price: 350 },
    { id: "ram-3", name: "Samsung DDR5-4800 ECC 64GB", capacity: 64, speed: 4800, type: "DDR5" as const, ecc: true, channels: 1, price: 520 },
    { id: "ram-4", name: "SK Hynix DDR5-5600 ECC 128GB", capacity: 128, speed: 5600, type: "DDR5" as const, ecc: true, channels: 1, price: 980 },
  ],
  storage: [
    { id: "stor-1", name: "Seagate Exos 10TB SAS", capacity: 10000, type: "SAS_HDD" as const, iops: 200, readSpeed: 270, writeSpeed: 250, endurance: 2500000, price: 280 },
    { id: "stor-2", name: "Intel D7-P5520 3.84TB NVMe", capacity: 3840, type: "NVMe_U2" as const, iops: 800000, readSpeed: 5300, writeSpeed: 3000, endurance: 3, price: 890 },
    { id: "stor-3", name: "Samsung PM1733 7.68TB NVMe", capacity: 7680, type: "NVMe_U2" as const, iops: 1500000, readSpeed: 7000, writeSpeed: 3800, endurance: 1, price: 1650 },
    { id: "stor-4", name: "Samsung 980 PRO 2TB M.2", capacity: 2000, type: "NVMe_M2" as const, iops: 1000000, readSpeed: 7000, writeSpeed: 5100, endurance: 1200, price: 180 },
  ],
  nics: [
    { id: "nic-1", name: "Intel X710-DA2 10GbE", speed: 10, ports: 2, type: "SFP+" as const, pcieLanes: 8, price: 380 },
    { id: "nic-2", name: "Mellanox ConnectX-6 25GbE", speed: 25, ports: 2, type: "SFP28" as const, pcieLanes: 16, price: 650 },
    { id: "nic-3", name: "Mellanox ConnectX-6 100GbE", speed: 100, ports: 2, type: "QSFP28" as const, pcieLanes: 16, price: 1200 },
    { id: "nic-4", name: "Intel I350-T4 1GbE", speed: 1, ports: 4, type: "RJ45" as const, pcieLanes: 4, price: 180 },
  ],
  raidControllers: [
    { id: "raid-1", name: "Broadcom MegaRAID 9460-8i", ports: 8, cacheSize: 2048, batteryBackup: true, supportedLevels: ["0", "1", "5", "6", "10", "50", "60"], price: 520 },
    { id: "raid-2", name: "Broadcom MegaRAID 9560-16i", ports: 16, cacheSize: 8192, batteryBackup: true, supportedLevels: ["0", "1", "5", "6", "10", "50", "60"], price: 980 },
  ],
};

const initialMetrics: FacilityMetrics = {
  totalPower: 125000,
  itLoad: 98000,
  pue: 1.28,
  coolingCapacity: 150000,
  coolingLoad: 112000,
  uptime: 99.9847,
  activeAlerts: 7,
  criticalAlerts: 1,
  serverCount: 48,
  rackCount: 6,
  networkDevices: 24,
  storageCapacity: 2400000,
  storageUsed: 1680000,
};

const initialNetworkNodes: NetworkNode[] = [
  { id: "spine-1", name: "SPINE-01", type: "spine", ports: 64, usedPorts: 32, status: "online", throughput: 3200, packetLoss: 0, positionX: 200, positionY: 50 },
  { id: "spine-2", name: "SPINE-02", type: "spine", ports: 64, usedPorts: 32, status: "online", throughput: 3100, packetLoss: 0, positionX: 400, positionY: 50 },
  { id: "leaf-1", name: "LEAF-01", type: "leaf", ports: 48, usedPorts: 36, status: "online", throughput: 1800, packetLoss: 0.001, positionX: 100, positionY: 150 },
  { id: "leaf-2", name: "LEAF-02", type: "leaf", ports: 48, usedPorts: 42, status: "warning", throughput: 2100, packetLoss: 0.02, positionX: 250, positionY: 150 },
  { id: "leaf-3", name: "LEAF-03", type: "leaf", ports: 48, usedPorts: 38, status: "online", throughput: 1650, packetLoss: 0, positionX: 400, positionY: 150 },
  { id: "leaf-4", name: "LEAF-04", type: "leaf", ports: 48, usedPorts: 40, status: "online", throughput: 1900, packetLoss: 0, positionX: 550, positionY: 150 },
  { id: "tor-1", name: "ToR-R01", type: "tor", ports: 48, usedPorts: 24, status: "online", throughput: 450, packetLoss: 0, positionX: 50, positionY: 250 },
  { id: "tor-2", name: "ToR-R02", type: "tor", ports: 48, usedPorts: 28, status: "online", throughput: 520, packetLoss: 0, positionX: 150, positionY: 250 },
  { id: "tor-3", name: "ToR-R03", type: "tor", ports: 48, usedPorts: 32, status: "critical", throughput: 180, packetLoss: 2.1, positionX: 250, positionY: 250 },
  { id: "tor-4", name: "ToR-R04", type: "tor", ports: 48, usedPorts: 26, status: "online", throughput: 480, packetLoss: 0, positionX: 350, positionY: 250 },
  { id: "fw-1", name: "FW-CORE-01", type: "firewall", ports: 8, usedPorts: 6, status: "online", throughput: 8500, packetLoss: 0, positionX: 300, positionY: 350 },
  { id: "lb-1", name: "LB-PROD-01", type: "loadbalancer", ports: 8, usedPorts: 4, status: "online", throughput: 4200, packetLoss: 0, positionX: 450, positionY: 350 },
];

const initialNetworkLinks: NetworkLink[] = [
  { id: "link-1", sourceId: "spine-1", targetId: "leaf-1", bandwidth: 100, utilization: 45, latency: 0.1, status: "active" },
  { id: "link-2", sourceId: "spine-1", targetId: "leaf-2", bandwidth: 100, utilization: 72, latency: 0.1, status: "active" },
  { id: "link-3", sourceId: "spine-1", targetId: "leaf-3", bandwidth: 100, utilization: 38, latency: 0.1, status: "active" },
  { id: "link-4", sourceId: "spine-1", targetId: "leaf-4", bandwidth: 100, utilization: 52, latency: 0.1, status: "active" },
  { id: "link-5", sourceId: "spine-2", targetId: "leaf-1", bandwidth: 100, utilization: 43, latency: 0.1, status: "active" },
  { id: "link-6", sourceId: "spine-2", targetId: "leaf-2", bandwidth: 100, utilization: 68, latency: 0.15, status: "degraded" },
  { id: "link-7", sourceId: "spine-2", targetId: "leaf-3", bandwidth: 100, utilization: 35, latency: 0.1, status: "active" },
  { id: "link-8", sourceId: "spine-2", targetId: "leaf-4", bandwidth: 100, utilization: 48, latency: 0.1, status: "active" },
  { id: "link-9", sourceId: "leaf-1", targetId: "tor-1", bandwidth: 25, utilization: 60, latency: 0.05, status: "active" },
  { id: "link-10", sourceId: "leaf-1", targetId: "tor-2", bandwidth: 25, utilization: 75, latency: 0.05, status: "active" },
  { id: "link-11", sourceId: "leaf-2", targetId: "tor-3", bandwidth: 25, utilization: 95, latency: 2.5, status: "degraded" },
  { id: "link-12", sourceId: "leaf-3", targetId: "tor-4", bandwidth: 25, utilization: 55, latency: 0.05, status: "active" },
];

const initialAlerts: Alert[] = [
  { id: "alert-1", timestamp: new Date(Date.now() - 120000).toISOString(), severity: "critical", source: "ToR-R03", sourceType: "network", message: "High packet loss detected: 2.1% on uplink port 49", acknowledged: false },
  { id: "alert-2", timestamp: new Date(Date.now() - 300000).toISOString(), severity: "warning", source: "RACK-03", sourceType: "cooling", message: "Inlet temperature elevated: 28.5°C (threshold: 27°C)", acknowledged: false },
  { id: "alert-3", timestamp: new Date(Date.now() - 450000).toISOString(), severity: "warning", source: "SRV-R03-U12", sourceType: "server", message: "RAID rebuild in progress: 34% complete", acknowledged: true },
  { id: "alert-4", timestamp: new Date(Date.now() - 600000).toISOString(), severity: "info", source: "PDU-A-03", sourceType: "power", message: "Phase imbalance: L1=18.2A, L2=22.1A, L3=19.8A", acknowledged: true },
  { id: "alert-5", timestamp: new Date(Date.now() - 900000).toISOString(), severity: "warning", source: "LEAF-02", sourceType: "network", message: "Port channel degraded: 2/4 members active", acknowledged: false },
  { id: "alert-6", timestamp: new Date(Date.now() - 1200000).toISOString(), severity: "info", source: "SAN-01", sourceType: "storage", message: "Snapshot retention: 45 snapshots, 2.1TB consumed", acknowledged: true },
  { id: "alert-7", timestamp: new Date(Date.now() - 1800000).toISOString(), severity: "info", source: "CRAC-02", sourceType: "cooling", message: "Filter maintenance due in 14 days", acknowledged: true },
];

const initialIncidents: Incident[] = [
  {
    id: "inc-1",
    title: "Network connectivity issues - Rack 03",
    severity: "P2",
    status: "investigating",
    affectedSystems: ["ToR-R03", "LEAF-02", "SRV-R03-U08", "SRV-R03-U12"],
    createdAt: new Date(Date.now() - 180000).toISOString(),
    updatedAt: new Date(Date.now() - 60000).toISOString(),
    description: "Multiple servers in Rack 03 experiencing intermittent connectivity. ToR switch showing elevated packet loss on uplink.",
    timeline: [
      { timestamp: new Date(Date.now() - 180000).toISOString(), action: "Incident created from alert correlation", actor: "System" },
      { timestamp: new Date(Date.now() - 120000).toISOString(), action: "Acknowledged by NOC operator", actor: "Operator" },
      { timestamp: new Date(Date.now() - 60000).toISOString(), action: "Investigating ToR-R03 uplink ports", actor: "Operator" },
    ],
  },
];

const equipmentCatalog: Equipment[] = [
  { id: "eq-srv-1u-dell", name: "Dell PowerEdge R650", type: "server_1u", uHeight: 1, manufacturer: "Dell", model: "R650", powerDraw: 450, heatOutput: 1535, price: 8500, color: "#2a2a2a", ledColor: "#00ff00", hasFans: true, portCount: 4 },
  { id: "eq-srv-1u-hp", name: "HPE ProLiant DL360", type: "server_1u", uHeight: 1, manufacturer: "HPE", model: "DL360 Gen10+", powerDraw: 500, heatOutput: 1706, price: 9200, color: "#1a1a1a", ledColor: "#00ff00", hasFans: true, portCount: 4 },
  { id: "eq-srv-1u-supermicro", name: "Supermicro SYS-1029U", type: "server_1u", uHeight: 1, manufacturer: "Supermicro", model: "SYS-1029U", powerDraw: 400, heatOutput: 1365, price: 6800, color: "#333333", ledColor: "#00ff00", hasFans: true, portCount: 2 },
  { id: "eq-srv-2u-dell", name: "Dell PowerEdge R750", type: "server_2u", uHeight: 2, manufacturer: "Dell", model: "R750", powerDraw: 800, heatOutput: 2729, price: 15000, color: "#2a2a2a", ledColor: "#00ff00", hasFans: true, portCount: 8 },
  { id: "eq-srv-2u-hp", name: "HPE ProLiant DL380", type: "server_2u", uHeight: 2, manufacturer: "HPE", model: "DL380 Gen10+", powerDraw: 850, heatOutput: 2900, price: 16500, color: "#1a1a1a", ledColor: "#00ff00", hasFans: true, portCount: 8 },
  { id: "eq-srv-2u-lenovo", name: "Lenovo ThinkSystem SR650", type: "server_2u", uHeight: 2, manufacturer: "Lenovo", model: "SR650 V2", powerDraw: 750, heatOutput: 2558, price: 14200, color: "#222222", ledColor: "#00ff00", hasFans: true, portCount: 6 },
  { id: "eq-srv-4u-dell", name: "Dell PowerEdge R940xa", type: "server_4u", uHeight: 4, manufacturer: "Dell", model: "R940xa", powerDraw: 1600, heatOutput: 5458, price: 45000, color: "#2a2a2a", ledColor: "#00ff00", hasFans: true, portCount: 8 },
  { id: "eq-srv-4u-hp", name: "HPE ProLiant DL580", type: "server_4u", uHeight: 4, manufacturer: "HPE", model: "DL580 Gen10", powerDraw: 1800, heatOutput: 6141, price: 52000, color: "#1a1a1a", ledColor: "#00ff00", hasFans: true, portCount: 8 },
  { id: "eq-sw-1u-cisco", name: "Cisco Nexus 9336C", type: "switch_1u", uHeight: 1, manufacturer: "Cisco", model: "Nexus 9336C-FX2", powerDraw: 350, heatOutput: 1194, price: 22000, color: "#0d274d", ledColor: "#00ff00", hasFans: true, portCount: 36 },
  { id: "eq-sw-1u-arista", name: "Arista 7050X3", type: "switch_1u", uHeight: 1, manufacturer: "Arista", model: "7050X3-48YC12", powerDraw: 320, heatOutput: 1092, price: 18500, color: "#1a365d", ledColor: "#00ff00", hasFans: true, portCount: 48 },
  { id: "eq-sw-1u-juniper", name: "Juniper QFX5120", type: "switch_1u", uHeight: 1, manufacturer: "Juniper", model: "QFX5120-48Y", powerDraw: 280, heatOutput: 955, price: 16000, color: "#2d3748", ledColor: "#00ff00", hasFans: true, portCount: 48 },
  { id: "eq-sw-2u-cisco", name: "Cisco Nexus 9504", type: "switch_2u", uHeight: 2, manufacturer: "Cisco", model: "Nexus 9504", powerDraw: 1200, heatOutput: 4094, price: 85000, color: "#0d274d", ledColor: "#00ff00", hasFans: true, portCount: 96 },
  { id: "eq-stor-2u-netapp", name: "NetApp AFF A250", type: "storage_2u", uHeight: 2, manufacturer: "NetApp", model: "AFF A250", powerDraw: 600, heatOutput: 2047, price: 35000, color: "#1e3a5f", ledColor: "#0088ff", hasFans: true, portCount: 4 },
  { id: "eq-stor-2u-dell", name: "Dell PowerStore 500T", type: "storage_2u", uHeight: 2, manufacturer: "Dell", model: "PowerStore 500T", powerDraw: 650, heatOutput: 2218, price: 42000, color: "#2a2a2a", ledColor: "#0088ff", hasFans: true, portCount: 8 },
  { id: "eq-stor-4u-netapp", name: "NetApp AFF A800", type: "storage_4u", uHeight: 4, manufacturer: "NetApp", model: "AFF A800", powerDraw: 1400, heatOutput: 4777, price: 120000, color: "#1e3a5f", ledColor: "#0088ff", hasFans: true, portCount: 8 },
  { id: "eq-stor-4u-pure", name: "Pure Storage FlashArray", type: "storage_4u", uHeight: 4, manufacturer: "Pure Storage", model: "FlashArray//X90", powerDraw: 1200, heatOutput: 4094, price: 150000, color: "#ff6600", ledColor: "#ff6600", hasFans: true, portCount: 16 },
  { id: "eq-pdu-1u", name: "APC Switched PDU", type: "pdu_1u", uHeight: 1, manufacturer: "APC", model: "AP8959", powerDraw: 0, heatOutput: 50, price: 2500, color: "#444444", ledColor: "#ffaa00", hasFans: false, portCount: 24 },
  { id: "eq-patch-1u", name: "CAT6A Patch Panel", type: "patch_panel_1u", uHeight: 1, manufacturer: "Panduit", model: "CP48BLY", powerDraw: 0, heatOutput: 0, price: 450, color: "#333333", ledColor: null, hasFans: false, portCount: 48 },
  { id: "eq-ups-2u", name: "APC Smart-UPS 3000", type: "ups_2u", uHeight: 2, manufacturer: "APC", model: "SMT3000RM2U", powerDraw: 0, heatOutput: 200, price: 3200, color: "#1a1a1a", ledColor: "#00ff00", hasFans: true, portCount: 8 },
  { id: "eq-ups-4u", name: "Eaton 9PX 6000", type: "ups_4u", uHeight: 4, manufacturer: "Eaton", model: "9PX6K", powerDraw: 0, heatOutput: 450, price: 8500, color: "#2d2d2d", ledColor: "#00ff00", hasFans: true, portCount: 12 },
  { id: "eq-router-1u-cisco", name: "Cisco ASR 1001-X", type: "router_1u", uHeight: 1, manufacturer: "Cisco", model: "ASR 1001-X", powerDraw: 200, heatOutput: 682, price: 28000, color: "#0d274d", ledColor: "#00ff00", hasFans: true, portCount: 8 },
  { id: "eq-router-2u-juniper", name: "Juniper MX204", type: "router_2u", uHeight: 2, manufacturer: "Juniper", model: "MX204", powerDraw: 450, heatOutput: 1535, price: 45000, color: "#2d3748", ledColor: "#00ff00", hasFans: true, portCount: 8 },
  { id: "eq-fw-1u-paloalto", name: "Palo Alto PA-3260", type: "firewall_1u", uHeight: 1, manufacturer: "Palo Alto", model: "PA-3260", powerDraw: 300, heatOutput: 1023, price: 32000, color: "#cc3300", ledColor: "#00ff00", hasFans: true, portCount: 12 },
  { id: "eq-fw-2u-fortinet", name: "Fortinet FG-3700D", type: "firewall_2u", uHeight: 2, manufacturer: "Fortinet", model: "FortiGate 3700D", powerDraw: 550, heatOutput: 1877, price: 65000, color: "#cc0000", ledColor: "#00ff00", hasFans: true, portCount: 16 },
  { id: "eq-kvm-1u", name: "Raritan Dominion KX III", type: "kvm_1u", uHeight: 1, manufacturer: "Raritan", model: "DKX3-864", powerDraw: 50, heatOutput: 170, price: 4500, color: "#333333", ledColor: "#ffff00", hasFans: false, portCount: 64 },
  { id: "eq-console-1u", name: "Opengear Console Server", type: "console_1u", uHeight: 1, manufacturer: "Opengear", model: "OM2248", powerDraw: 35, heatOutput: 119, price: 3800, color: "#1a1a1a", ledColor: "#00ff00", hasFans: false, portCount: 48 },
  { id: "eq-blank-1u", name: "Blank Panel 1U", type: "blank_1u", uHeight: 1, manufacturer: "Generic", model: "BP-1U", powerDraw: 0, heatOutput: 0, price: 25, color: "#1a1a1a", ledColor: null, hasFans: false, portCount: 0 },
  { id: "eq-cable-1u", name: "Cable Management 1U", type: "cable_management_1u", uHeight: 1, manufacturer: "CyberPower", model: "CRA30001", powerDraw: 0, heatOutput: 0, price: 75, color: "#2a2a2a", ledColor: null, hasFans: false, portCount: 0 },
];

function createInstalledEquipment(eqId: string, uStart: number, uHeight: number, status: "online" | "warning" | "critical" | "offline" = "online"): InstalledEquipment {
  return {
    id: `inst-${eqId}-${uStart}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    equipmentId: eqId,
    uStart,
    uEnd: uStart + uHeight - 1,
    status,
    cpuLoad: Math.random() * 80 + 10,
    memoryUsage: Math.random() * 70 + 20,
    networkActivity: Math.random() * 90 + 5,
  };
}

function createRackWithEquipment(id: string, name: string, power: number, inlet: number, exhaust: number, airflow: number, x: number, y: number): Rack {
  const equipment: InstalledEquipment[] = [];
  
  type ConfigItem = { eq: string; u: number; status?: InstalledEquipment["status"] };
  const configs: ConfigItem[][] = [
    [
      { eq: "eq-pdu-1u", u: 1 },
      { eq: "eq-ups-2u", u: 2 },
      { eq: "eq-patch-1u", u: 4 },
      { eq: "eq-sw-1u-cisco", u: 5 },
      { eq: "eq-srv-2u-dell", u: 6 },
      { eq: "eq-srv-2u-dell", u: 8 },
      { eq: "eq-srv-1u-hp", u: 10 },
      { eq: "eq-srv-1u-hp", u: 11 },
      { eq: "eq-srv-2u-hp", u: 12 },
      { eq: "eq-stor-2u-netapp", u: 14 },
      { eq: "eq-srv-1u-dell", u: 16 },
      { eq: "eq-srv-1u-dell", u: 17 },
    ],
    [
      { eq: "eq-ups-4u", u: 1 },
      { eq: "eq-fw-1u-paloalto", u: 5 },
      { eq: "eq-router-1u-cisco", u: 6 },
      { eq: "eq-sw-1u-arista", u: 7 },
      { eq: "eq-sw-1u-arista", u: 8 },
      { eq: "eq-srv-2u-lenovo", u: 9 },
      { eq: "eq-srv-2u-lenovo", u: 11 },
      { eq: "eq-srv-4u-dell", u: 13 },
      { eq: "eq-srv-1u-supermicro", u: 17 },
    ],
    [
      { eq: "eq-stor-4u-netapp", u: 1 },
      { eq: "eq-stor-4u-pure", u: 5 },
      { eq: "eq-stor-2u-dell", u: 9 },
      { eq: "eq-sw-2u-cisco", u: 11 },
      { eq: "eq-srv-2u-dell", u: 13, status: "warning" },
      { eq: "eq-srv-2u-dell", u: 15 },
    ],
  ];
  
  const configIndex = (x + y * 3) % configs.length;
  const config = configs[configIndex];
  
  for (const item of config) {
    const eq = equipmentCatalog.find(e => e.id === item.eq);
    if (eq) {
      equipment.push(createInstalledEquipment(item.eq, item.u, eq.uHeight, item.status ?? "online"));
    }
  }
  
  return {
    id,
    name,
    type: "enclosed_42U",
    totalUs: 42,
    slots: Array.from({ length: 42 }, (_, i) => ({ uPosition: i + 1, equipmentInstanceId: null })),
    installedEquipment: equipment,
    powerCapacity: 20000,
    currentPowerDraw: power,
    inletTemp: inlet,
    exhaustTemp: exhaust,
    airflowRestriction: airflow,
    positionX: x,
    positionY: y,
  };
}

function createRack(id: string, name: string, power: number, inlet: number, exhaust: number, airflow: number, x: number, y: number): Rack {
  return createRackWithEquipment(id, name, power, inlet, exhaust, airflow, x, y);
}

const initialRacks: Rack[] = [
  createRack("rack-1", "RACK-01", 14500, 22.3, 35.1, 12, 0, 0),
  createRack("rack-2", "RACK-02", 16200, 23.1, 36.8, 18, 1, 0),
  createRack("rack-3", "RACK-03", 17800, 28.5, 42.1, 35, 2, 0),
  createRack("rack-4", "RACK-04", 15100, 22.8, 34.2, 10, 0, 1),
  createRack("rack-5", "RACK-05", 18500, 24.2, 38.5, 22, 1, 1),
  createRack("rack-6", "RACK-06", 12800, 21.5, 32.1, 8, 2, 1),
  createRack("rack-7", "RACK-07", 19200, 25.1, 40.2, 28, 0, 2),
  createRack("rack-8", "RACK-08", 16800, 23.5, 37.8, 15, 1, 2),
  createRack("rack-9", "RACK-09", 14200, 22.1, 33.9, 11, 2, 2),
];

const initialServers: ServerConfig[] = [
  {
    id: "srv-1",
    name: "SRV-R01-U01",
    chassisType: "2U",
    cpuSlots: 2,
    maxRam: 2048,
    driveBays: 24,
    pciSlots: 8,
    installedCpus: ["cpu-2", "cpu-2"],
    installedRam: ["ram-3", "ram-3", "ram-3", "ram-3", "ram-3", "ram-3", "ram-3", "ram-3"],
    installedStorage: ["stor-2", "stor-2", "stor-2", "stor-2"],
    installedNics: ["nic-2"],
    raidController: "raid-1",
    raidLevel: "10",
    powerDraw: 850,
    inletTemp: 22.1,
    exhaustTemp: 34.5,
    status: "online",
  },
];

const initialGameState: GameState = {
  currentMode: "noc",
  money: 500000,
  reputation: 75,
  tier: "tier2",
  contracts: [
    {
      id: "contract-1",
      name: "Enterprise VM Cluster",
      requirements: { vms: 20, iops: 100000, uptime: 99.99 },
      reward: 25000,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "active",
    },
  ],
};

export class MemStorage implements IStorage {
  private gameState: GameState;
  private racks: Map<string, Rack>;
  private servers: Map<string, ServerConfig>;
  private alerts: Map<string, Alert>;
  private incidents: Map<string, Incident>;
  private networkNodes: NetworkNode[];
  private networkLinks: NetworkLink[];
  private facilityMetrics: FacilityMetrics;
  private inventory: typeof initialInventory;

  constructor() {
    this.gameState = { ...initialGameState };
    this.racks = new Map(initialRacks.map((r) => [r.id, r]));
    this.servers = new Map(initialServers.map((s) => [s.id, s]));
    this.alerts = new Map(initialAlerts.map((a) => [a.id, a]));
    this.incidents = new Map(initialIncidents.map((i) => [i.id, i]));
    this.networkNodes = [...initialNetworkNodes];
    this.networkLinks = [...initialNetworkLinks];
    this.facilityMetrics = { ...initialMetrics };
    this.inventory = initialInventory;
  }

  // Game State
  async getGameState(): Promise<GameState> {
    return { ...this.gameState };
  }

  async updateGameState(state: Partial<GameState>): Promise<GameState> {
    this.gameState = { ...this.gameState, ...state };
    return { ...this.gameState };
  }

  // Racks
  async getRacks(): Promise<Rack[]> {
    return Array.from(this.racks.values());
  }

  async getRack(id: string): Promise<Rack | undefined> {
    return this.racks.get(id);
  }

  async createRack(rack: InsertRack): Promise<Rack> {
    const id = randomUUID();
    const newRack: Rack = { ...rack, id };
    this.racks.set(id, newRack);
    return newRack;
  }

  async updateRack(id: string, rack: Partial<Rack>): Promise<Rack | undefined> {
    const existing = this.racks.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...rack };
    this.racks.set(id, updated);
    return updated;
  }

  async deleteRack(id: string): Promise<boolean> {
    return this.racks.delete(id);
  }

  // Servers
  async getServers(): Promise<ServerConfig[]> {
    return Array.from(this.servers.values());
  }

  async getServer(id: string): Promise<ServerConfig | undefined> {
    return this.servers.get(id);
  }

  async createServer(server: InsertServerConfig): Promise<ServerConfig> {
    const id = randomUUID();
    const newServer: ServerConfig = { ...server, id };
    this.servers.set(id, newServer);
    return newServer;
  }

  async updateServer(id: string, server: Partial<ServerConfig>): Promise<ServerConfig | undefined> {
    const existing = this.servers.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...server };
    this.servers.set(id, updated);
    return updated;
  }

  // Alerts
  async getAlerts(): Promise<Alert[]> {
    return Array.from(this.alerts.values());
  }

  async acknowledgeAlert(id: string): Promise<Alert | undefined> {
    const existing = this.alerts.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, acknowledged: true };
    this.alerts.set(id, updated);
    return updated;
  }

  async createAlert(alert: Omit<Alert, "id">): Promise<Alert> {
    const id = randomUUID();
    const newAlert: Alert = { ...alert, id };
    this.alerts.set(id, newAlert);
    return newAlert;
  }

  // Incidents
  async getIncidents(): Promise<Incident[]> {
    return Array.from(this.incidents.values());
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    return this.incidents.get(id);
  }

  async updateIncidentStatus(id: string, status: Incident["status"]): Promise<Incident | undefined> {
    const existing = this.incidents.get(id);
    if (!existing) return undefined;
    const updated: Incident = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
      timeline: [
        ...existing.timeline,
        {
          timestamp: new Date().toISOString(),
          action: `Status changed to ${status}`,
          actor: "Operator",
        },
      ],
    };
    this.incidents.set(id, updated);
    return updated;
  }

  // Network
  async getNetworkNodes(): Promise<NetworkNode[]> {
    return [...this.networkNodes];
  }

  async getNetworkLinks(): Promise<NetworkLink[]> {
    return [...this.networkLinks];
  }

  // Metrics
  async getFacilityMetrics(): Promise<FacilityMetrics> {
    return { ...this.facilityMetrics };
  }

  // Inventory
  async getInventory(): Promise<typeof initialInventory> {
    return this.inventory;
  }

  // Equipment Catalog
  async getEquipmentCatalog(): Promise<Equipment[]> {
    return [...equipmentCatalog];
  }

  // Rack Equipment
  async addEquipmentToRack(rackId: string, equipmentId: string, uStart: number): Promise<Rack | null> {
    const rack = this.racks.get(rackId);
    if (!rack) return null;

    const equipment = equipmentCatalog.find(e => e.id === equipmentId);
    if (!equipment) return null;

    const uEnd = uStart + equipment.uHeight - 1;
    if (uEnd > 42 || uStart < 1) return null;

    for (let u = uStart; u <= uEnd; u++) {
      const slot = rack.slots.find(s => s.uPosition === u);
      if (slot?.equipmentInstanceId) return null;
    }

    const instanceId = randomUUID();
    const installed: InstalledEquipment = {
      id: instanceId,
      equipmentId,
      uStart,
      uEnd,
      status: "online",
      cpuLoad: Math.random() * 60 + 10,
      memoryUsage: Math.random() * 50 + 20,
      networkActivity: Math.random() * 100,
    };

    rack.installedEquipment.push(installed);
    for (let u = uStart; u <= uEnd; u++) {
      const slot = rack.slots.find(s => s.uPosition === u);
      if (slot) slot.equipmentInstanceId = instanceId;
    }

    rack.currentPowerDraw += equipment.powerDraw;
    this.racks.set(rackId, rack);
    return rack;
  }

  async removeEquipmentFromRack(rackId: string, equipmentInstanceId: string): Promise<Rack | null> {
    const rack = this.racks.get(rackId);
    if (!rack) return null;

    const installed = rack.installedEquipment.find(e => e.id === equipmentInstanceId);
    if (!installed) return null;

    const equipment = equipmentCatalog.find(e => e.id === installed.equipmentId);
    rack.installedEquipment = rack.installedEquipment.filter(e => e.id !== equipmentInstanceId);
    rack.slots.forEach(slot => {
      if (slot.equipmentInstanceId === equipmentInstanceId) {
        slot.equipmentInstanceId = null;
      }
    });

    if (equipment) {
      rack.currentPowerDraw = Math.max(0, rack.currentPowerDraw - equipment.powerDraw);
    }

    this.racks.set(rackId, rack);
    return rack;
  }

  // Maxed datacenter
  async generateMaxedDatacenter(): Promise<Rack[]> {
    this.racks.clear();
    const rows = 25;
    const cols = 20;
    const racks: Rack[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const rackId = `rack-${row}-${col}`;
        const rack = createRack(
          rackId,
          `R${String(row + 1).padStart(2, '0')}-${String(col + 1).padStart(2, '0')}`,
          Math.random() * 8000 + 12000,
          20 + Math.random() * 6,
          32 + Math.random() * 12,
          Math.random() * 30,
          col,
          row
        );

        let currentU = 1;
        while (currentU <= 42) {
          const availableEquipment = equipmentCatalog.filter(e => currentU + e.uHeight - 1 <= 42);
          if (availableEquipment.length === 0) break;

          const equipment = availableEquipment[Math.floor(Math.random() * availableEquipment.length)];
          const instanceId = randomUUID();
          const installed: InstalledEquipment = {
            id: instanceId,
            equipmentId: equipment.id,
            uStart: currentU,
            uEnd: currentU + equipment.uHeight - 1,
            status: Math.random() > 0.95 ? "warning" : Math.random() > 0.98 ? "critical" : "online",
            cpuLoad: Math.random() * 80 + 5,
            memoryUsage: Math.random() * 70 + 15,
            networkActivity: Math.random() * 100,
          };

          rack.installedEquipment.push(installed);
          for (let u = currentU; u <= currentU + equipment.uHeight - 1; u++) {
            const slot = rack.slots.find(s => s.uPosition === u);
            if (slot) slot.equipmentInstanceId = instanceId;
          }
          rack.currentPowerDraw += equipment.powerDraw;
          currentU += equipment.uHeight;
        }

        this.racks.set(rackId, rack);
        racks.push(rack);
      }
    }

    return racks;
  }
}

export const storage = new MemStorage();
