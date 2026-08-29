import { useState } from "react";
import { useGame } from "@/lib/game-context";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Cpu, MemoryStick, HardDrive, Network, Shield } from "lucide-react";

export function HardwarePalette() {
  const { inventory } = useGame();
  const [search, setSearch] = useState("");

  const filterItems = <T extends { name: string }>(items: T[]) =>
    items.filter((item) =>
      item.name.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <Card className="flex flex-col h-full bg-card/50 backdrop-blur-sm" data-testid="hardware-palette">
      <div className="p-4 border-b border-border">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider mb-3">
          Hardware Inventory
        </h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search components..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-hardware-search"
          />
        </div>
      </div>

      <Tabs defaultValue="cpu" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start px-4 pt-2 bg-transparent border-b border-border">
          <TabsTrigger value="cpu" className="text-xs gap-1">
            <Cpu className="w-3 h-3" /> CPU
          </TabsTrigger>
          <TabsTrigger value="ram" className="text-xs gap-1">
            <MemoryStick className="w-3 h-3" /> RAM
          </TabsTrigger>
          <TabsTrigger value="storage" className="text-xs gap-1">
            <HardDrive className="w-3 h-3" /> Storage
          </TabsTrigger>
          <TabsTrigger value="nic" className="text-xs gap-1">
            <Network className="w-3 h-3" /> NIC
          </TabsTrigger>
          <TabsTrigger value="raid" className="text-xs gap-1">
            <Shield className="w-3 h-3" /> RAID
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="cpu" className="p-4 space-y-2 mt-0">
            {filterItems(inventory.cpus).map((cpu) => (
              <div
                key={cpu.id}
                className="p-3 rounded-md border border-border bg-background/50 hover-elevate cursor-grab"
                draggable
                data-testid={`component-cpu-${cpu.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{cpu.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="font-mono">
                        {cpu.cores}C/{cpu.threads}T
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {cpu.tdp}W
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {cpu.architecture}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-sm font-mono text-noc-green">
                    ${cpu.price.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="ram" className="p-4 space-y-2 mt-0">
            {filterItems(inventory.rams).map((ram) => (
              <div
                key={ram.id}
                className="p-3 rounded-md border border-border bg-background/50 hover-elevate cursor-grab"
                draggable
                data-testid={`component-ram-${ram.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{ram.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="font-mono">
                        {ram.capacity}GB
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {ram.speed}MHz
                      </Badge>
                      {ram.ecc && (
                        <Badge variant="secondary">
                          ECC
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-mono text-noc-green">
                    ${ram.price.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="storage" className="p-4 space-y-2 mt-0">
            {filterItems(inventory.storage).map((stor) => (
              <div
                key={stor.id}
                className="p-3 rounded-md border border-border bg-background/50 hover-elevate cursor-grab"
                draggable
                data-testid={`component-storage-${stor.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{stor.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="font-mono">
                        {stor.capacity >= 1000
                          ? `${(stor.capacity / 1000).toFixed(1)}TB`
                          : `${stor.capacity}GB`}
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {(stor.iops / 1000).toFixed(0)}K IOPS
                      </Badge>
                      <Badge variant="secondary">
                        {stor.type.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-sm font-mono text-noc-green">
                    ${stor.price.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="nic" className="p-4 space-y-2 mt-0">
            {filterItems(inventory.nics).map((nic) => (
              <div
                key={nic.id}
                className="p-3 rounded-md border border-border bg-background/50 hover-elevate cursor-grab"
                draggable
                data-testid={`component-nic-${nic.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{nic.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="font-mono">
                        {nic.speed}GbE
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {nic.ports} ports
                      </Badge>
                      <Badge variant="secondary">
                        {nic.type}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-sm font-mono text-noc-green">
                    ${nic.price.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="raid" className="p-4 space-y-2 mt-0">
            {filterItems(inventory.raidControllers).map((raid) => (
              <div
                key={raid.id}
                className="p-3 rounded-md border border-border bg-background/50 hover-elevate cursor-grab"
                draggable
                data-testid={`component-raid-${raid.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{raid.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="font-mono">
                        {raid.ports} ports
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {raid.cacheSize}MB
                      </Badge>
                      {raid.batteryBackup && (
                        <Badge variant="secondary">
                          BBU
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-mono text-noc-green">
                    ${raid.price.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </Card>
  );
}
