import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Server, HardDrive, Network, Cpu, Router, Plug, Cable, Star, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useGame } from "@/lib/game-context";
import { useToast } from "@/hooks/use-toast";
import type { Equipment, Rack } from "@shared/schema";
import type { EquipmentCatalogItem } from "@/lib/static-equipment";

interface EquipmentPickerProps {
  rack: Rack;
  selectedSlot: number;
  onClose: () => void;
  onSuccess: () => void;
}

const categoryConfig: Record<string, { label: string; icon: typeof Server; types: string[] }> = {
  servers: {
    label: "Servers",
    icon: Server,
    types: ["server_1u", "server_2u", "server_4u"],
  },
  switches: {
    label: "Switches",
    icon: Network,
    types: ["switch_1u", "switch_2u"],
  },
  storage: {
    label: "Storage",
    icon: HardDrive,
    types: ["storage_2u", "storage_4u"],
  },
  network: {
    label: "Network",
    icon: Router,
    types: ["router_1u", "router_2u", "firewall_1u", "firewall_2u"],
  },
  power: {
    label: "Power",
    icon: Plug,
    types: ["pdu_1u", "ups_2u", "ups_4u"],
  },
  infrastructure: {
    label: "Infrastructure",
    icon: Cable,
    types: ["patch_panel_1u", "kvm_1u", "console_1u", "blank_1u", "cable_management_1u"],
  },
};

const FAVORITES_STORAGE_KEY = "equipment-picker-favorites";
const RECENTS_STORAGE_KEY = "equipment-picker-recents";
const MAX_RECENTS = 8;
const ROW_HEIGHT = 140;

const getStoredIds = (key: string) => {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
};

const storeIds = (key: string, ids: string[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(ids));
};

interface VirtualizedListProps {
  items: EquipmentCatalogItem[];
  emptyMessage: string;
  renderItem: (item: EquipmentCatalogItem, index: number) => React.ReactNode;
}

function VirtualizedList({ items, emptyMessage, renderItem }: VirtualizedListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setHeight(containerRef.current.clientHeight);
      }
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [items]);

  const totalHeight = items.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const visibleCount = Math.ceil(height / ROW_HEIGHT) + 6;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div ref={containerRef} className="flex-1 overflow-auto" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      {items.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">{emptyMessage}</div>
      ) : (
        <div className="relative" style={{ height: totalHeight }}>
          {visibleItems.map((item, index) => {
            const actualIndex = startIndex + index;
            return (
              <div
                key={item.id}
                className="absolute left-0 right-0 px-4"
                style={{ top: actualIndex * ROW_HEIGHT }}
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function EquipmentPicker({ rack, selectedSlot, onClose, onSuccess }: EquipmentPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState("servers");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => getStoredIds(FAVORITES_STORAGE_KEY));
  const [recentIds, setRecentIds] = useState<string[]>(() => getStoredIds(RECENTS_STORAGE_KEY));
  const { equipmentCatalog, isStaticMode, addEquipmentToRack } = useGame();
  const { toast } = useToast();
  
  const addEquipmentMutation = useMutation({
    mutationFn: async ({ equipmentId, uStart }: { equipmentId: string; uStart: number }) => {
      const response = await apiRequest("POST", `/api/racks/${rack.id}/equipment`, {
        equipmentId,
        uStart,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/racks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/racks", rack.id] });
      onSuccess();
    },
    onError: () => {
      toast({
        title: "Unable to add equipment",
        description: "The service is unavailable. Please retry in a moment.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    storeIds(FAVORITES_STORAGE_KEY, favoriteIds);
  }, [favoriteIds]);

  useEffect(() => {
    storeIds(RECENTS_STORAGE_KEY, recentIds);
  }, [recentIds]);

  const favoritesSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    equipmentCatalog.forEach((equipment) => {
      if (selectedCategory !== "all" && !equipment.categories.includes(selectedCategory)) return;
      equipment.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [equipmentCatalog, selectedCategory]);

  const filteredEquipment = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return equipmentCatalog.filter((equipment) => {
      if (selectedCategory !== "all" && !equipment.categories.includes(selectedCategory)) {
        return false;
      }
      if (showFavoritesOnly && !favoritesSet.has(equipment.id)) {
        return false;
      }
      if (selectedTags.length > 0 && !selectedTags.every((tag) => equipment.tags.includes(tag))) {
        return false;
      }
      if (normalizedSearch.length > 0) {
        return equipment.searchTokens.some((token) => token.includes(normalizedSearch));
      }
      return true;
    });
  }, [equipmentCatalog, favoritesSet, searchTerm, selectedCategory, selectedTags, showFavoritesOnly]);

  const recentEquipment = useMemo(() => {
    return recentIds
      .map((id) => equipmentCatalog.find((equipment) => equipment.id === id))
      .filter(Boolean) as EquipmentCatalogItem[];
  }, [equipmentCatalog, recentIds]);

  const canFitEquipment = (equipment: Equipment): boolean => {
    const totalUs = rack.totalUs ?? 42;
    const endSlot = selectedSlot + equipment.uHeight - 1;
    if (selectedSlot < 1 || endSlot > totalUs) return false;
    return true;
  };

  const registerRecent = useCallback((equipmentId: string) => {
    setRecentIds((prev) => {
      const next = [equipmentId, ...prev.filter((id) => id !== equipmentId)];
      return next.slice(0, MAX_RECENTS);
    });
  }, []);

  const toggleFavorite = useCallback((equipmentId: string) => {
    setFavoriteIds((prev) =>
      prev.includes(equipmentId) ? prev.filter((id) => id !== equipmentId) : [...prev, equipmentId]
    );
  }, []);

  const handleAddEquipment = useCallback((equipment: Equipment) => {
    if (isStaticMode) {
      setIsSaving(true);
      setSaveError(false);
      const ok = addEquipmentToRack(rack.id, equipment.id, selectedSlot);
      setSaveError(!ok);
      setIsSaving(false);
      if (ok) {
        toast({
          title: "Equipment added",
          description: `${equipment.name} installed in ${rack.name}.`,
        });
        registerRecent(equipment.id);
        onSuccess();
      }
      return;
    }
    addEquipmentMutation.mutate(
      { equipmentId: equipment.id, uStart: selectedSlot },
      {
        onSuccess: () => {
          registerRecent(equipment.id);
        },
      }
    );
  }, [addEquipmentMutation, isStaticMode, rack, selectedSlot, registerRecent, toast, addEquipmentToRack, onSuccess]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (event.key >= "1" && event.key <= "9") {
        const index = Number(event.key) - 1;
        const targetEquipment = filteredEquipment[index];
        if (targetEquipment) {
          handleAddEquipment(targetEquipment);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredEquipment, handleAddEquipment]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <Card className="w-[720px] max-h-[80vh] flex flex-col bg-background/95 border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-display font-bold text-lg">Add Equipment</h2>
            <p className="text-sm text-muted-foreground">
              {rack.name} - Starting at U{selectedSlot}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-picker">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="px-4 py-3 border-b border-border space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search equipment, tags, models..."
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant={showFavoritesOnly ? "secondary" : "outline"}
              onClick={() => setShowFavoritesOnly((prev) => !prev)}
              className="gap-2"
            >
              <Star className="w-4 h-4" />
              Favorites
            </Button>
            {(searchTerm || selectedTags.length > 0) && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedTags([]);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <Button
                  key={tag}
                  type="button"
                  variant={active ? "secondary" : "outline"}
                  size="sm"
                  onClick={() =>
                    setSelectedTags((prev) =>
                      prev.includes(tag) ? prev.filter((existing) => existing !== tag) : [...prev, tag]
                    )
                  }
                >
                  {tag}
                </Button>
              );
            })}
          </div>
        </div>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="flex-1 flex flex-col">
          <div className="px-4 pt-2">
            <TabsList className="w-full grid grid-cols-7">
              <TabsTrigger value="all" className="text-xs gap-1">
                <Cpu className="w-3 h-3" />
                <span className="hidden sm:inline">All</span>
              </TabsTrigger>
              {Object.entries(categoryConfig).map(([key, config]) => (
                <TabsTrigger key={key} value={key} className="text-xs gap-1">
                  <config.icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{config.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="px-4 pt-3">
            {recentEquipment.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  <Clock className="w-3 h-3" />
                  Recent adds
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentEquipment.map((equipment) => (
                    <Button
                      key={equipment.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleAddEquipment(equipment)}
                    >
                      <span className="font-semibold">{equipment.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {equipment.uHeight}U
                      </Badge>
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Quick add: press 1-9 to add the first nine results.
            </div>
          </div>

          <TabsContent key={selectedCategory} value={selectedCategory} className="mt-0 flex flex-col flex-1">
            <VirtualizedList
              items={filteredEquipment}
              emptyMessage="No equipment matches the current filters."
              renderItem={(equipment, index) => {
                const canFit = canFitEquipment(equipment);
                const isFavorite = favoritesSet.has(equipment.id);
                return (
                  <Card
                    key={equipment.id}
                    className={`p-3 mb-2 cursor-pointer transition-all ${
                      canFit
                        ? "hover-elevate border-border"
                        : "hover-elevate border-border opacity-70"
                    }`}
                    onClick={() => handleAddEquipment(equipment)}
                    data-testid={`equipment-option-${equipment.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-3 h-3 rounded-sm"
                            style={{ background: equipment.color }}
                          />
                          <span className="font-semibold text-sm">{equipment.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {equipment.uHeight}U
                          </Badge>
                          {index < 9 && (
                            <Badge variant="secondary" className="text-[10px]">
                              {index + 1}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {equipment.manufacturer} {equipment.model}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                          {equipment.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-4 mt-2 text-xs">
                          <span className="text-noc-yellow">
                            {equipment.powerDraw}W
                          </span>
                          <span className="text-noc-cyan">
                            {equipment.portCount} ports
                          </span>
                          <span className="text-noc-green">
                            ${equipment.price.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Button
                          type="button"
                          variant={isFavorite ? "secondary" : "ghost"}
                          size="icon"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleFavorite(equipment.id);
                          }}
                        >
                          <Star className={`w-4 h-4 ${isFavorite ? "text-yellow-400" : ""}`} />
                        </Button>
                        {!canFit && (
                          <Badge variant="outline" className="text-xs">
                            Replaces
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              }}
            />
          </TabsContent>
        </Tabs>

        {(addEquipmentMutation.isPending || isSaving) && (
          <div className="p-4 border-t border-border bg-muted/30">
            <p className="text-sm text-center text-muted-foreground">Adding equipment...</p>
          </div>
        )}

        {(addEquipmentMutation.isError || saveError) && (
          <div className="p-4 border-t border-destructive/30 bg-destructive/10">
            <p className="text-sm text-center text-destructive">
              Failed to add equipment. Please try again.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
