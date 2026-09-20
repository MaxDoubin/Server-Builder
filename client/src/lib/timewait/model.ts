import type { Claim, Setup } from "./types";

/**
 * TCP_TIMEWAIT_LEN, from include/net/tcp.h: 60 * HZ, fixed at compile time.
 *
 * It is a constant here because it is a constant there. Measured on this host
 * at 60.2s with tcp_fin_timeout set to 5.
 */
export const TIME_WAIT_SECONDS = 60;

/** The state the side that closed first is sitting in. */
export function closerState(setup: Setup): string {
  return setup.peerFinSeen ? "TIME_WAIT" : "FIN_WAIT2";
}

/**
 * How long TIME_WAIT lasts. The setup is taken, and the setup is ignored,
 * which is the whole point: no field in it reaches this number.
 */
export function timeWaitSeconds(_setup: Setup): number {
  return TIME_WAIT_SECONDS;
}

/** How long FIN_WAIT2 lasts once the socket is orphaned. This one is tunable. */
export function finWait2Seconds(setup: Setup): number {
  return setup.finTimeout;
}

/** How long the closing side's current state lasts. */
export function stateSeconds(setup: Setup): number {
  return setup.peerFinSeen ? timeWaitSeconds(setup) : finWait2Seconds(setup);
}

/** Whichever end called close() first is the end that waits. */
export function waitingSide(setup: Setup): "client" | "server" | "neither" {
  return setup.closedFirst;
}

/**
 * Whether tcp_fin_timeout reaches TIME_WAIT at all, asked by moving it.
 *
 * Derived rather than asserted, so that a change making TIME_WAIT depend on
 * the knob would turn this true instead of quietly agreeing with itself.
 */
export function tunableByFinTimeout(setup: Setup): boolean {
  const moved = { ...setup, finTimeout: setup.finTimeout + 7 };
  return timeWaitSeconds(moved) !== timeWaitSeconds(setup);
}

/** Ephemeral ports available to outbound connections, inclusive of both ends. */
export function ephemeralPorts(setup: Setup): number {
  const [low, high] = setup.portRange;
  return high - low + 1;
}

/** Distinct four tuples available: every port against every destination. */
export function tupleCapacity(setup: Setup): number {
  return ephemeralPorts(setup) * setup.destinations;
}

/** New connections per second the tuple space sustains while each is held 60s. */
export function sustainableRate(setup: Setup): number {
  return Math.floor(tupleCapacity(setup) / TIME_WAIT_SECONDS);
}

/** Whether the attempted rate outruns the tuple space. */
export function exhausts(setup: Setup): boolean {
  return setup.attemptsPerSecond > sustainableRate(setup);
}

/** Sockets sitting in TIME_WAIT once the workload reaches steady state. */
export function concurrentTimeWait(setup: Setup): number {
  return setup.attemptsPerSecond * TIME_WAIT_SECONDS;
}

/**
 * Whether the bucket cap is reached, at which point the kernel stops waiting
 * and logs "TCP: time wait bucket table overflow". A count, never a duration.
 */
export function overflowsBuckets(setup: Setup): boolean {
  return concurrentTimeWait(setup) > setup.twBuckets;
}

/**
 * Whether tcp_tw_reuse relieves this workload.
 *
 * Three conditions, all of them real. It reuses a TIME_WAIT slot for a new
 * OUTBOUND connection, so it does nothing for a side that closed as a server.
 * It needs timestamps to tell a stray old segment from a new one. And the
 * modern default of 2 covers loopback only.
 */
export function reuseHelps(setup: Setup): boolean {
  if (!setup.timestamps) return false;
  if (setup.closedFirst !== "client") return false;
  if (setup.twReuse === 1) return true;
  return setup.twReuse === 2 && setup.loopback;
}

/** The lines a reader would gather before answering, with their units named. */
export function asSysctl(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    { name: "net.ipv4.tcp_fin_timeout", value: String(setup.finTimeout), unit: "seconds: FIN_WAIT2, NOT TIME_WAIT" },
    { name: "net.ipv4.tcp_max_tw_buckets", value: String(setup.twBuckets), unit: "a COUNT of sockets, not a duration" },
    { name: "net.ipv4.tcp_tw_reuse", value: String(setup.twReuse), unit: "0 off, 1 on, 2 loopback only" },
    { name: "net.ipv4.tcp_timestamps", value: setup.timestamps ? "1" : "0", unit: "tw_reuse is inert at 0" },
    { name: "net.ipv4.ip_local_port_range", value: setup.portRange.join("  "), unit: "low and high, inclusive" },
  ];
}

/** Thousands separators, so 28232 reads as a count rather than a port number. */
export function human(count: number): string {
  return count.toLocaleString("en-US");
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "state":
      return claim.name === closerState(setup);
    case "seconds":
      return claim.value === stateSeconds(setup);
    case "side":
      return claim.name === waitingSide(setup);
    case "tunable":
      return claim.value === tunableByFinTimeout(setup);
    case "reuse-helps":
      return claim.value === reuseHelps(setup);
    case "ports":
      return claim.value === ephemeralPorts(setup);
    case "rate":
      return claim.value === sustainableRate(setup);
    case "exhausts":
      return claim.value === exhausts(setup);
    case "overflows":
      return claim.value === overflowsBuckets(setup);
    case "nothing":
      return false;
  }
}

/**
 * The option the model says is right.
 *
 * The page calls this rather than reading an answer out of the data, which is
 * the property check-answer-keys exists to hold.
 */
export function correctOption(item: { setup: Setup; options: { id: string; says: Claim }[] }) {
  return item.options.find((option) => claimHolds(option.says, item.setup));
}
