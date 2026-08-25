/**
 * Incident scenarios for the 3D floor.
 *
 * Every objective is checked against the real derived state of the visible
 * floor: rack count, measured IT load, cooling load against the plant that is
 * actually online, installed equipment counts, and per-rack heat. Nothing here
 * is scored on a timer or on a fake completion flag, so a scenario can be
 * failed back out of by undoing whatever satisfied it.
 *
 * Objectives come in two kinds. A goal is the thing you are asked to achieve.
 * A guard is a constraint you must not break on the way there, which is what
 * stops "delete the data centre" from being the answer to every incident. A
 * scenario completes when all of both hold at the same moment.
 *
 * The starting conditions and thresholds are tuned against the procedural
 * floor the simulator actually generates (seed 42, dense fill), where racks
 * run 10 to 22 kW and average about 15.6 kW. Recheck them if the generator
 * changes.
 */

import type { CapacityOverrides, FacilityCapacity } from "@/lib/capacity";
import { formatWatts } from "@/lib/capacity";

/** What the floor looked like the moment the scenario started. */
export interface ScenarioBaseline {
  rackCount: number;
  itLoadW: number;
  equipmentCount: number;
  serverCount: number;
  switchCount: number;
  routerCount: number;
  firewallCount: number;
}

export interface ScenarioContext {
  capacity: FacilityCapacity;
  baseline: ScenarioBaseline;
  /** The heatmap toggle in the dock. Some scenarios ask you to use it. */
  heatmapOn: boolean;
  criticalAlerts: number;
  elapsedSeconds: number;
}

export interface ObjectiveProgress {
  /** Current value on the objective's own scale. */
  value: number;
  /** The number the objective is aiming at. */
  target: number;
  /** Fraction complete, 0 to 1, for the bar. */
  fraction: number;
  /** Human readable state, because a bar alone says nothing precise. */
  text: string;
}

export interface ScenarioObjective {
  id: string;
  kind: "goal" | "guard";
  label: string;
  detail: string;
  check: (context: ScenarioContext) => boolean;
  progress: (context: ScenarioContext) => ObjectiveProgress;
}

export interface ScenarioSetup {
  /** Rack density the scenario starts you at. */
  rackCount?: number;
  overrides?: CapacityOverrides;
  /**
   * A power budget expressed as watts on top of the load measured when the
   * scenario starts. Turned into a hard ceiling by resolveScenarioOverrides.
   */
  powerBudgetDeltaW?: number;
}

export interface Scenario {
  id: string;
  title: string;
  discipline: "cooling" | "power" | "network" | "thermal" | "capacity";
  /** One line for the card. */
  summary: string;
  briefing: string;
  startingCondition: string;
  setup: ScenarioSetup;
  objectives: ScenarioObjective[];
  debrief: string;
  hints: string[];
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const fractionTowards = (value: number, target: number, start: number) => {
  if (target === start) return value >= target ? 1 : 0;
  return clamp01((value - start) / (target - start));
};

export const SCENARIOS: Scenario[] = [
  {
    id: "crah-failure",
    title: "Cooling plant down a bank",
    discipline: "cooling",
    summary: "Three CRAH units drop offline under a full floor.",
    briefing:
      "A chilled water valve fault took three CRAH units in aisle B out of service. The floor did not stop, so the heat it rejects has not changed, but the plant left standing cannot carry it. Inlet temperatures climb from the top of the racks down, and the first thing you lose is the margin you would need to ride out a second failure.",
    startingCondition:
      "23 of 26 CRAH units online. 8.05 MW of sensible cooling against a full 500 rack floor rejecting roughly 8.3 MW.",
    setup: { rackCount: 500, overrides: { crahUnitsOffline: 3 } },
    objectives: [
      {
        id: "cooling-under-90",
        kind: "goal",
        label: "Cooling load at or under 90 percent of the surviving plant",
        detail:
          "Ninety percent, not a hundred: at a hundred you have no margin for the next unit to fail.",
        check: (ctx) => ctx.capacity.coolingUtilization <= 0.9,
        progress: (ctx) => ({
          value: ctx.capacity.coolingUtilization * 100,
          target: 90,
          fraction: clamp01(0.9 / Math.max(0.0001, ctx.capacity.coolingUtilization)),
          text: `${(ctx.capacity.coolingUtilization * 100).toFixed(1)}% of ${formatWatts(
            ctx.capacity.coolingCapacityW,
          )}`,
        }),
      },
      {
        id: "keep-400-racks",
        kind: "guard",
        label: "Keep at least 400 racks powered",
        detail:
          "Shedding the whole floor would fix the thermals and lose the business. Four hundred racks stay up.",
        check: (ctx) => ctx.capacity.rackCount >= 400,
        progress: (ctx) => ({
          value: ctx.capacity.rackCount,
          target: 400,
          fraction: clamp01(ctx.capacity.rackCount / 400),
          text: `${ctx.capacity.rackCount} racks powered`,
        }),
      },
    ],
    debrief:
      "A hall can sit comfortably inside its electrical budget and still be outside its thermal one, which is why cooling gets its own meter here. Shedding roughly 60 racks buys back the margin, and in a real hall that shedding is planned in advance: a documented list of which workloads go first, agreed with whoever owns them, so the decision is made on a good day rather than at two in the morning with the aisle at 40 degrees.",
    hints: [
      "The rack density slider is the fastest lever. Cooling capacity is fixed while the units are down.",
      "Cooling load is IT load plus six percent for in-room losses, so it always sits above the power number.",
    ],
  },
  {
    id: "pdu-trip",
    title: "PDU branch trip",
    discipline: "power",
    summary: "A feed drops to 72 percent and the floor is over its ceiling.",
    briefing:
      "A branch breaker opened on one of the two utility feeds and the automatic transfer left the hall running on 72 percent of its rated IT supply. Everything is still up, which is the dangerous part: the floor is drawing more than the surviving feed is rated to carry, and the next transient trips the lot.",
    startingCondition:
      "5.76 MW of feed against a 400 rack floor drawing roughly 6.29 MW. The hall is over its supply.",
    setup: { rackCount: 400, overrides: { powerFeedFraction: 0.72 } },
    objectives: [
      {
        id: "feed-margin",
        kind: "goal",
        label: "Leave at least 8 percent of the surviving feed free",
        detail:
          "Restarting equipment pulls well above its steady state draw, so the headroom is what lets you bring anything back.",
        check: (ctx) => ctx.capacity.powerHeadroomW >= ctx.capacity.powerCeilingW * 0.08,
        progress: (ctx) => {
          const target = ctx.capacity.powerCeilingW * 0.08;
          return {
            value: ctx.capacity.powerHeadroomW,
            target,
            fraction: clamp01(ctx.capacity.powerHeadroomW / Math.max(1, target)),
            text: `${formatWatts(ctx.capacity.powerHeadroomW)} free of the ${formatWatts(
              target,
            )} needed`,
          };
        },
      },
      {
        id: "keep-300-racks",
        kind: "guard",
        label: "Keep at least 300 racks powered",
        detail: "The incident is a power problem, not permission to empty the hall.",
        check: (ctx) => ctx.capacity.rackCount >= 300,
        progress: (ctx) => ({
          value: ctx.capacity.rackCount,
          target: 300,
          fraction: clamp01(ctx.capacity.rackCount / 300),
          text: `${ctx.capacity.rackCount} racks powered`,
        }),
      },
      {
        id: "cooling-holds",
        kind: "guard",
        label: "Cooling stays inside plant capacity",
        detail: "Fixing power by concentrating load somewhere hot is not fixing anything.",
        check: (ctx) => ctx.capacity.coolingUtilization <= 1,
        progress: (ctx) => ({
          value: ctx.capacity.coolingUtilization * 100,
          target: 100,
          fraction: clamp01(1 / Math.max(0.0001, ctx.capacity.coolingUtilization)),
          text: `${(ctx.capacity.coolingUtilization * 100).toFixed(1)}% of cooling used`,
        }),
      },
    ],
    debrief:
      "Utilities are sized on nameplate and run on headroom. The eight percent asked for here is a stand-in for inrush: a rack of servers restarting draws far more than the same rack idling, so a feed with no margin cannot recover the load it just dropped. Real halls answer this with dual corded equipment across A and B feeds, and with each feed loaded below half so either one can carry everything alone.",
    hints: [
      "Around 338 racks is where the eight percent margin appears. Below 300 the guard fails.",
      "The power meter shows headroom in watts, so you can watch it cross zero.",
    ],
  },
  {
    id: "leaf-uplink",
    title: "Leaf switch loses an uplink",
    discipline: "network",
    summary: "A pod is down to a single path out. Build the second one.",
    briefing:
      "One leaf switch is running on a single uplink after an optic failed, so the pod under it has no redundant path to the spine. Traffic is flowing, which means nobody outside the network team has noticed, and it will stay that way right up until the surviving link goes too. The fix is more switching, not more monitoring.",
    startingCondition: "A 24 rack pod with one surviving uplink and no spare switch capacity.",
    setup: { rackCount: 24 },
    objectives: [
      {
        id: "add-switches",
        kind: "goal",
        label: "Install two more switches on the floor",
        detail: "A second leaf gives the pod somewhere else to go.",
        check: (ctx) => ctx.capacity.switchCount >= ctx.baseline.switchCount + 2,
        progress: (ctx) => ({
          value: ctx.capacity.switchCount - ctx.baseline.switchCount,
          target: 2,
          fraction: fractionTowards(ctx.capacity.switchCount, ctx.baseline.switchCount + 2, ctx.baseline.switchCount),
          text: `${Math.max(0, ctx.capacity.switchCount - ctx.baseline.switchCount)} of 2 switches added`,
        }),
      },
      {
        id: "add-layer3",
        kind: "goal",
        label: "Add a router or a firewall as the second way out",
        detail: "Redundant switching into a single edge device just moves the failure up a layer.",
        check: (ctx) =>
          ctx.capacity.routerCount + ctx.capacity.firewallCount >=
          ctx.baseline.routerCount + ctx.baseline.firewallCount + 1,
        progress: (ctx) => {
          const added =
            ctx.capacity.routerCount +
            ctx.capacity.firewallCount -
            (ctx.baseline.routerCount + ctx.baseline.firewallCount);
          return {
            value: added,
            target: 1,
            fraction: clamp01(added / 1),
            text: `${Math.max(0, added)} of 1 edge device added`,
          };
        },
      },
      {
        id: "keep-pod",
        kind: "guard",
        label: "Do not shed any racks",
        detail: "The pod stays the size it was.",
        check: (ctx) => ctx.capacity.rackCount >= ctx.baseline.rackCount,
        progress: (ctx) => ({
          value: ctx.capacity.rackCount,
          target: ctx.baseline.rackCount,
          fraction: clamp01(ctx.capacity.rackCount / Math.max(1, ctx.baseline.rackCount)),
          text: `${ctx.capacity.rackCount} of ${ctx.baseline.rackCount} racks`,
        }),
      },
    ],
    debrief:
      "Redundancy that has never been tested is a claim, not a property. Two uplinks off one leaf into one spine is a single failure domain wearing a disguise, which is why spine and leaf fabrics are built so every leaf reaches every spine and any one of them can be taken out for maintenance in the middle of the day. The cost of the second path is always cheaper than the outage it prevents.",
    hints: [
      "The procedural racks are full to 42U, so use Spawn Rack for an empty cabinet.",
      "Click the new rack to open its panel, then click an empty U to pick equipment.",
    ],
  },
  {
    id: "hot-rack",
    title: "Hot rack in the middle of the row",
    discipline: "thermal",
    summary: "One cabinet runs far above its neighbours. Find it and fix it.",
    briefing:
      "A capacity install went into whichever cabinets had space rather than into the cabinets that had airflow. The floor average looks fine and the plant is nowhere near its limit, but at least one rack is rejecting more heat than contained aisle airflow will carry away from it, and its neighbours are breathing that exhaust.",
    startingCondition:
      "A 60 rack floor with plenty of plant capacity and a handful of cabinets above 20 kW.",
    setup: { rackCount: 60 },
    objectives: [
      {
        id: "heatmap-on",
        kind: "goal",
        label: "Turn the heatmap on",
        detail: "You cannot fix a hot spot you are guessing at. Colour the floor by real rack heat.",
        check: (ctx) => ctx.heatmapOn,
        progress: (ctx) => ({
          value: ctx.heatmapOn ? 1 : 0,
          target: 1,
          fraction: ctx.heatmapOn ? 1 : 0,
          text: ctx.heatmapOn ? "Heatmap on" : "Heatmap off",
        }),
      },
      {
        id: "hottest-under-20kw",
        kind: "goal",
        label: "Bring every rack under 20 kW of heat",
        detail: "Pull equipment out of the worst cabinets. The panel names the current worst one.",
        check: (ctx) => ctx.capacity.hottestRackHeatW <= 20_000,
        progress: (ctx) => ({
          value: ctx.capacity.hottestRackHeatW,
          target: 20_000,
          fraction: clamp01(20_000 / Math.max(1, ctx.capacity.hottestRackHeatW)),
          text: ctx.capacity.hottestRackName
            ? `Hottest is rack ${ctx.capacity.hottestRackName} at ${formatWatts(
                ctx.capacity.hottestRackHeatW,
              )}`
            : "No racks on the floor",
        }),
      },
      {
        id: "hold-load",
        kind: "guard",
        label: "Keep at least 95 percent of the IT load you started with",
        detail: "Rebalance the heat, do not delete the workload.",
        check: (ctx) => ctx.capacity.itLoadW >= ctx.baseline.itLoadW * 0.95,
        progress: (ctx) => ({
          value: ctx.capacity.itLoadW,
          target: ctx.baseline.itLoadW * 0.95,
          fraction: clamp01(ctx.capacity.itLoadW / Math.max(1, ctx.baseline.itLoadW * 0.95)),
          text: `${formatWatts(ctx.capacity.itLoadW)} of ${formatWatts(
            ctx.baseline.itLoadW * 0.95,
          )} minimum`,
        }),
      },
    ],
    debrief:
      "Density is a per-cabinet property, not a floor average. A hall running at half its rated cooling can still cook one rack, because the air that reaches a cabinet is set by the tile layout, the blanking panels and the containment around it rather than by the size of the plant. Blanking the empty U in a rack is the cheapest thermal fix there is: it stops hot exhaust from curling back around the front of the equipment.",
    hints: [
      "Rack heat here is the rack's own draw plus an airflow penalty, so a restricted cabinet reads hotter than its wattage alone.",
      "Select the named rack, then use the remove control on an installed item in the rack panel.",
    ],
  },
  {
    id: "capacity-request",
    title: "Capacity request inside a power budget",
    discipline: "capacity",
    summary: "Twelve more servers, six more kilowatts, no exceptions.",
    briefing:
      "A tenant has asked for twelve more servers. Finance has approved six kilowatts of additional draw and not a watt more, because the budget was written against the hall's remaining committed capacity rather than against what happens to be free today. Which servers you choose is the whole exercise: the same twelve slots can land anywhere between five and ten kilowatts.",
    startingCondition:
      "A 40 rack floor with a hard tenant budget of the current load plus 6 kW.",
    setup: { rackCount: 40, powerBudgetDeltaW: 6_000 },
    objectives: [
      {
        id: "add-servers",
        kind: "goal",
        label: "Install twelve more servers",
        detail: "Any server class counts. Spawn an empty rack if the floor has no free U left.",
        check: (ctx) => ctx.capacity.serverCount >= ctx.baseline.serverCount + 12,
        progress: (ctx) => ({
          value: ctx.capacity.serverCount - ctx.baseline.serverCount,
          target: 12,
          fraction: fractionTowards(
            ctx.capacity.serverCount,
            ctx.baseline.serverCount + 12,
            ctx.baseline.serverCount,
          ),
          text: `${Math.max(0, ctx.capacity.serverCount - ctx.baseline.serverCount)} of 12 servers installed`,
        }),
      },
      {
        id: "inside-budget",
        kind: "guard",
        label: "Stay inside the approved power budget",
        detail: "Six kilowatts across twelve servers is 500 W each. A 2U server will not fit that.",
        check: (ctx) => ctx.capacity.powerHeadroomW >= 0,
        progress: (ctx) => ({
          value: ctx.capacity.powerHeadroomW,
          target: 0,
          fraction: ctx.capacity.powerHeadroomW >= 0 ? 1 : 0,
          text: `${formatWatts(ctx.capacity.powerHeadroomW)} of budget left`,
        }),
      },
      {
        id: "cooling-fits",
        kind: "guard",
        label: "Cooling stays inside plant capacity",
        detail: "Power approval is not thermal approval.",
        check: (ctx) => ctx.capacity.coolingUtilization <= 1,
        progress: (ctx) => ({
          value: ctx.capacity.coolingUtilization * 100,
          target: 100,
          fraction: clamp01(1 / Math.max(0.0001, ctx.capacity.coolingUtilization)),
          text: `${(ctx.capacity.coolingUtilization * 100).toFixed(1)}% of cooling used`,
        }),
      },
    ],
    debrief:
      "Capacity planning is arithmetic done before the purchase order rather than after it. Twelve 1U servers at 400 to 500 W fit inside six kilowatts with room to spare, twelve 2U servers at 800 W do not, and the difference is invisible until someone adds it up. The same sum runs at every scale: committed capacity, not free space, is what a hall actually sells.",
    hints: [
      "Spawn Rack adds an empty 42U cabinet. The procedural racks are already full.",
      "Check the power headroom line in the dock before you commit to a server class.",
    ],
  },
];

export const getScenario = (id: string): Scenario | undefined =>
  SCENARIOS.find((scenario) => scenario.id === id);

/**
 * Capacity overrides for a running scenario.
 *
 * A power budget is relative to the load measured when the scenario started,
 * so it can only be resolved once there is a baseline.
 */
export function resolveScenarioOverrides(
  scenario: Scenario,
  baseline: ScenarioBaseline,
): CapacityOverrides {
  const overrides: CapacityOverrides = { ...(scenario.setup.overrides ?? {}) };
  if (scenario.setup.powerBudgetDeltaW !== undefined) {
    overrides.powerCeilingOverrideW = baseline.itLoadW + scenario.setup.powerBudgetDeltaW;
  }
  return overrides;
}

export interface ObjectiveResult {
  objective: ScenarioObjective;
  met: boolean;
  progress: ObjectiveProgress;
}

export interface ScenarioEvaluation {
  results: ObjectiveResult[];
  metCount: number;
  total: number;
  complete: boolean;
  /** A guard that is currently broken, if any. Worth saying out loud. */
  brokenGuard: ScenarioObjective | null;
}

export function evaluateScenario(
  scenario: Scenario,
  context: ScenarioContext,
): ScenarioEvaluation {
  const results = scenario.objectives.map((objective) => ({
    objective,
    met: objective.check(context),
    progress: objective.progress(context),
  }));
  const metCount = results.filter((result) => result.met).length;
  const brokenGuard =
    results.find((result) => result.objective.kind === "guard" && !result.met)?.objective ?? null;
  return {
    results,
    metCount,
    total: results.length,
    complete: metCount === results.length && results.length > 0,
    brokenGuard,
  };
}
