/**
 * Propagation delay calculator.
 *
 * Distance comes from a typed length or from two cities through the
 * haversine formula. The medium sets the speed. Satellite media replace the
 * ground route with a bent pipe up to one satellite and back down, computed
 * as vectors on a spherical Earth. Serialization sits beside it, because the
 * two are the delays people most often confuse.
 */

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  CITIES,
  EARTH_RADIUS_KM,
  MAX_HOPS,
  MAX_SURFACE_KM,
  MEDIA,
  SPEED_OF_LIGHT_M_S,
  type DistanceUnit,
  type MediumId,
  type Parsed,
  type PathInput,
  type RateUnit,
  bdpBytes,
  cityById,
  computeDelay,
  equatorialPair,
  formatBytes,
  formatDuration,
  formatKm,
  formatRate,
  haversineKm,
  mediumById,
  microsecondsPerKm,
  parseDistanceKm,
  parseHops,
  parsePacketBytes,
  parseRateBps,
  parseStretch,
  parseVelocityFactor,
  serializationSeconds,
  wireBytes,
} from "@/lib/toolkit/propagation-delay-calculator";

type Mode = "cities" | "distance";

const DISTANCE_UNITS: { value: DistanceUnit; label: string }[] = [
  { value: "km", label: "km" },
  { value: "mi", label: "miles" },
  { value: "m", label: "meters" },
  { value: "ft", label: "feet" },
];

const RATE_UNITS: RateUnit[] = ["bps", "kbps", "Mbps", "Gbps", "Tbps"];

/** Below this elevation a ground link is impractical, though still above the horizon. */
const LOW_ELEVATION_DEG = 10;

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT =
  "min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_BASE =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON = "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const ERROR_TEXT = "mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_TEXT = "mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

function speedText(velocityFactor: number): string {
  const kmPerS = (SPEED_OF_LIGHT_M_S * velocityFactor) / 1000;
  return `${Math.round(kmPerS).toLocaleString("en-US")} km/s (${velocityFactor.toFixed(3)} c)`;
}

function degrees(value: number): string {
  return `${value.toFixed(1)}°`;
}

function latLonText(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

export function PropagationDelayCalculator() {
  const [mode, setMode] = useState<Mode>("cities");
  const [distanceDraft, setDistanceDraft] = useState("1000");
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("km");
  const [fromId, setFromId] = useState("new-york");
  const [toId, setToId] = useState("london");
  const [stretchDraft, setStretchDraft] = useState("1");
  const [mediumId, setMediumId] = useState<MediumId>("fiber");
  const [vfDraft, setVfDraft] = useState("0.7");

  const [packetDraft, setPacketDraft] = useState("1500");
  const [rateDraft, setRateDraft] = useState("1");
  const [rateUnit, setRateUnit] = useState<RateUnit>("Gbps");
  const [ethernet, setEthernet] = useState(true);
  const [hopsDraft, setHopsDraft] = useState("1");

  const distance = useMemo(() => parseDistanceKm(distanceDraft, distanceUnit), [distanceDraft, distanceUnit]);
  const stretch = useMemo(() => parseStretch(stretchDraft), [stretchDraft]);
  const customVf = useMemo(() => parseVelocityFactor(vfDraft), [vfDraft]);
  const from = cityById(fromId) ?? CITIES[0];
  const to = cityById(toId) ?? CITIES[1];
  const greatCircleKm = haversineKm(from, to);

  const pathInput: Parsed<PathInput> = useMemo(() => {
    if (mode === "distance") {
      if (!distance.ok) return distance;
      const km = distance.value;
      return {
        ok: true,
        value: {
          ends: equatorialPair(Math.min(km, MAX_SURFACE_KM)),
          routeKm: km,
          groundKm: km,
          fromPlaces: false,
        },
      };
    }
    if (!stretch.ok) return stretch;
    return {
      ok: true,
      value: { ends: [from, to], routeKm: greatCircleKm * stretch.value, groundKm: greatCircleKm, fromPlaces: true },
    };
  }, [mode, distance, stretch, from, to, greatCircleKm]);

  const medium = mediumById(mediumId);
  const velocity: Parsed<number> = useMemo(
    () => (mediumId === "custom" ? customVf : { ok: true, value: mediumById(mediumId).velocityFactor }),
    [mediumId, customVf],
  );

  const result = useMemo(
    () => (pathInput.ok && velocity.ok ? computeDelay(pathInput.value, medium, velocity.value) : null),
    [pathInput, medium, velocity],
  );

  const comparison = useMemo(() => {
    if (!pathInput.ok) return [];
    return MEDIA.filter((m) => m.id !== "custom" || customVf.ok).map((m) =>
      computeDelay(pathInput.value, m, m.id === "custom" && customVf.ok ? customVf.value : m.velocityFactor),
    );
  }, [pathInput, customVf]);

  const packet = useMemo(() => parsePacketBytes(packetDraft), [packetDraft]);
  const rate = useMemo(() => parseRateBps(rateDraft, rateUnit), [rateDraft, rateUnit]);
  const hops = useMemo(() => parseHops(hopsDraft), [hopsDraft]);

  const onWire = packet.ok ? wireBytes(packet.value, ethernet) : null;
  const serial = onWire !== null && rate.ok ? serializationSeconds(onWire, rate.value) : null;
  const usable = result !== null && result.problem === null && Number.isFinite(result.oneWaySeconds);
  const totalSerial = serial !== null && hops.ok ? serial * hops.value : null;
  const totalOneWay = usable && totalSerial !== null ? result.oneWaySeconds + totalSerial : null;
  const bdp = usable && rate.ok ? bdpBytes(rate.value, result.rttSeconds) : null;

  let ratioText: string | null = null;
  if (usable && serial !== null && serial > 0 && result.oneWaySeconds > 0) {
    const ratio = result.oneWaySeconds / serial;
    ratioText =
      ratio >= 1
        ? `Propagation is ${ratio.toLocaleString("en-US", { maximumSignificantDigits: 3 })} times one frame's serialization here, so a faster link barely moves the latency. Only a shorter path does.`
        : `Serialization is ${(1 / ratio).toLocaleString("en-US", { maximumSignificantDigits: 3 })} times the propagation here, so the link speed, not the distance, sets the latency.`;
  }

  const minElevation = result?.satellite
    ? Math.min(result.satellite.up.elevationDeg, result.satellite.down.elevationDeg)
    : null;

  return (
    <ToolShell slug="propagation-delay-calculator">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-6">
            <ToolPanel title="Distance">
              <div className="flex flex-wrap gap-2" role="group" aria-label="How to give the distance">
                {(
                  [
                    { key: "cities", label: "Two cities" },
                    { key: "distance", label: "Type a distance" },
                  ] as { key: Mode; label: string }[]
                ).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMode(m.key)}
                    aria-pressed={mode === m.key}
                    data-testid={`button-mode-${m.key}`}
                    className={`${CHIP_BASE} ${mode === m.key ? CHIP_ON : CHIP_OFF}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {mode === "distance" ? (
                <div className="mt-5">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-[2] basis-[9rem]">
                      <label htmlFor="pd-distance" className={LABEL}>
                        {medium.altitudeKm !== undefined ? "Ground distance between the ends" : "Cable or path length"}
                      </label>
                      <input
                        id="pd-distance"
                        value={distanceDraft}
                        onChange={(e) => setDistanceDraft(e.target.value)}
                        inputMode="decimal"
                        spellCheck={false}
                        autoComplete="off"
                        aria-invalid={!distance.ok}
                        aria-describedby={distance.ok ? undefined : "pd-distance-error"}
                        data-testid="input-distance"
                        className={`mt-2 ${INPUT}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1 basis-[6rem]">
                      <label htmlFor="pd-distance-unit" className={LABEL}>
                        Unit
                      </label>
                      <select
                        id="pd-distance-unit"
                        value={distanceUnit}
                        onChange={(e) => setDistanceUnit(e.target.value as DistanceUnit)}
                        data-testid="select-distance-unit"
                        className={`mt-2 ${SELECT}`}
                      >
                        {DISTANCE_UNITS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {!distance.ok ? (
                    <p id="pd-distance-error" role="alert" className={ERROR_TEXT}>
                      {distance.error}
                    </p>
                  ) : (
                    <p className={HINT_TEXT}>
                      {formatKm(distance.value)}. For a satellite medium this is the distance between the two ground
                      ends, and the satellite is placed above their midpoint.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-5">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1 basis-[9rem]">
                      <label htmlFor="pd-from" className={LABEL}>
                        From
                      </label>
                      <select
                        id="pd-from"
                        value={fromId}
                        onChange={(e) => setFromId(e.target.value)}
                        data-testid="select-from"
                        className={`mt-2 ${SELECT}`}
                      >
                        {CITIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFromId(toId);
                        setToId(fromId);
                      }}
                      aria-label="Swap the two cities"
                      data-testid="button-swap"
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                    >
                      <ArrowLeftRight className="h-4 w-4" aria-hidden />
                    </button>
                    <div className="min-w-0 flex-1 basis-[9rem]">
                      <label htmlFor="pd-to" className={LABEL}>
                        To
                      </label>
                      <select
                        id="pd-to"
                        value={toId}
                        onChange={(e) => setToId(e.target.value)}
                        data-testid="select-to"
                        className={`mt-2 ${SELECT}`}
                      >
                        {CITIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4">
                    <ToolResult
                      label="Great circle"
                      value={`${formatKm(greatCircleKm)} · ${(greatCircleKm / 1.609344).toLocaleString("en-US", { maximumFractionDigits: 0 })} mi`}
                      testId="text-great-circle"
                    />
                  </div>

                  <div className="mt-4">
                    <label htmlFor="pd-stretch" className={LABEL}>
                      Route stretch over the great circle
                    </label>
                    <input
                      id="pd-stretch"
                      value={stretchDraft}
                      onChange={(e) => setStretchDraft(e.target.value)}
                      inputMode="decimal"
                      spellCheck={false}
                      aria-invalid={!stretch.ok}
                      aria-describedby={stretch.ok ? "pd-stretch-hint" : "pd-stretch-error"}
                      data-testid="input-stretch"
                      className={`mt-2 ${INPUT}`}
                    />
                    {stretch.ok ? (
                      <p id="pd-stretch-hint" className={HINT_TEXT}>
                        1 is the great circle itself, the physical floor. Real cables follow coastlines, rights of way
                        and landing stations, so they run longer; raise this to model that. Ground media only.
                      </p>
                    ) : (
                      <p id="pd-stretch-error" role="alert" className={ERROR_TEXT}>
                        {stretch.error}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </ToolPanel>

            <ToolPanel title="Medium">
              <fieldset>
                <legend className="sr-only">Transmission medium</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {MEDIA.map((m) => {
                    const on = m.id === mediumId;
                    return (
                      <label
                        key={m.id}
                        className={`flex min-h-[44px] cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
                          on
                            ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                            : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="pd-medium"
                          value={m.id}
                          checked={on}
                          onChange={() => setMediumId(m.id)}
                          className="sr-only"
                          data-testid={`radio-medium-${m.id}`}
                        />
                        <span
                          className={`font-mono-tight text-sm ${on ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone))]"}`}
                        >
                          {m.label}
                        </span>
                        <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {m.detail}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {mediumId === "custom" ? (
                <div className="mt-4">
                  <label htmlFor="pd-vf" className={LABEL}>
                    Velocity factor, as a fraction of c
                  </label>
                  <input
                    id="pd-vf"
                    value={vfDraft}
                    onChange={(e) => setVfDraft(e.target.value)}
                    inputMode="decimal"
                    spellCheck={false}
                    aria-invalid={!customVf.ok}
                    aria-describedby={customVf.ok ? undefined : "pd-vf-error"}
                    data-testid="input-velocity-factor"
                    className={`mt-2 ${INPUT}`}
                  />
                  {!customVf.ok ? (
                    <p id="pd-vf-error" role="alert" className={ERROR_TEXT}>
                      {customVf.error}
                    </p>
                  ) : (
                    <p className={HINT_TEXT}>
                      For glass, the velocity factor is 1 divided by the group index: 1 / 1.468 is 0.681.
                    </p>
                  )}
                </div>
              ) : null}
            </ToolPanel>
          </div>

          <div className="min-w-0 space-y-6">
            <ToolPanel title="Propagation delay">
              {result === null ? (
                <p className={ERROR_TEXT} data-testid="text-one-way">
                  Fix the inputs marked in red to see the delay.
                </p>
              ) : (
                <>
                  <ToolResult
                    label="One way"
                    value={result.problem ? (result.satellite ? "no single hop" : "n/a") : formatDuration(result.oneWaySeconds)}
                    testId="text-one-way"
                  />
                  <ToolResult
                    label="Round trip"
                    value={result.problem ? (result.satellite ? "no single hop" : "n/a") : formatDuration(result.rttSeconds)}
                    testId="text-rtt"
                  />
                  <ToolResult
                    label="Path traveled"
                    value={Number.isFinite(result.pathKm) ? formatKm(result.pathKm) : "n/a"}
                  />
                  <ToolResult label="Signal speed" value={speedText(result.velocityFactor)} />
                  <ToolResult
                    label="Per kilometer"
                    value={`${microsecondsPerKm(result.velocityFactor).toFixed(3)} µs one way`}
                  />
                  {result.satellite ? (
                    <>
                      <ToolResult
                        label="Up leg"
                        value={`${formatKm(result.satellite.up.slantKm)} at ${degrees(result.satellite.up.elevationDeg)} elevation`}
                      />
                      <ToolResult
                        label="Down leg"
                        value={`${formatKm(result.satellite.down.slantKm)} at ${degrees(result.satellite.down.elevationDeg)} elevation`}
                      />
                      <ToolResult
                        label="Satellite over"
                        value={latLonText(result.satellite.satellite.lat, result.satellite.satellite.lon)}
                      />
                    </>
                  ) : null}

                  {result.problem ? (
                    <p
                      role="alert"
                      className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
                    >
                      {result.problem}
                      {result.satellite ? " The legs above show the geometry of the closest attempt." : ""}
                    </p>
                  ) : minElevation !== null && minElevation < LOW_ELEVATION_DEG ? (
                    <p className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                      The satellite sits {degrees(minElevation)} above the horizon at one end. Terrain, buildings and a
                      long path through the atmosphere make a link that low impractical, so a real route would add a
                      hop.
                    </p>
                  ) : null}

                  <p className={HINT_TEXT}>
                    {result.satellite
                      ? "Propagation only, ground to satellite to ground at c. Round trip assumes the reply takes the same hop back. Ground segments, processing and queuing come on top."
                      : mode === "cities"
                        ? `Great circle on a sphere of radius ${EARTH_RADIUS_KM.toLocaleString("en-US")} km${
                            stretch.ok && stretch.value !== 1 ? `, stretched by ${stretch.value}` : ""
                          }. A measured round trip is always longer than this floor.`
                        : "Propagation only. Queuing, processing and serialization come on top."}
                  </p>
                </>
              )}
            </ToolPanel>

            <ToolPanel title="Serialization">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 basis-[8rem]">
                  <label htmlFor="pd-packet" className={LABEL}>
                    Packet size, bytes
                  </label>
                  <input
                    id="pd-packet"
                    value={packetDraft}
                    onChange={(e) => setPacketDraft(e.target.value)}
                    inputMode="numeric"
                    spellCheck={false}
                    aria-invalid={!packet.ok}
                    aria-describedby={packet.ok ? undefined : "pd-packet-error"}
                    data-testid="input-packet"
                    className={`mt-2 ${INPUT}`}
                  />
                </div>
                <div className="min-w-0 flex-1 basis-[8rem]">
                  <label htmlFor="pd-rate" className={LABEL}>
                    Link speed
                  </label>
                  <input
                    id="pd-rate"
                    value={rateDraft}
                    onChange={(e) => setRateDraft(e.target.value)}
                    inputMode="decimal"
                    spellCheck={false}
                    aria-invalid={!rate.ok}
                    aria-describedby={rate.ok ? undefined : "pd-rate-error"}
                    data-testid="input-rate"
                    className={`mt-2 ${INPUT}`}
                  />
                </div>
                <div className="min-w-0 basis-[6rem]">
                  <label htmlFor="pd-rate-unit" className={LABEL}>
                    Unit
                  </label>
                  <select
                    id="pd-rate-unit"
                    value={rateUnit}
                    onChange={(e) => setRateUnit(e.target.value as RateUnit)}
                    data-testid="select-rate-unit"
                    className={`mt-2 ${SELECT}`}
                  >
                    {RATE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {!packet.ok ? (
                <p id="pd-packet-error" role="alert" className={ERROR_TEXT}>
                  {packet.error}
                </p>
              ) : null}
              {!rate.ok ? (
                <p id="pd-rate-error" role="alert" className={ERROR_TEXT}>
                  {rate.error}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="w-40">
                  <label htmlFor="pd-hops" className={LABEL}>
                    Store-and-forward hops
                  </label>
                  <input
                    id="pd-hops"
                    value={hopsDraft}
                    onChange={(e) => setHopsDraft(e.target.value)}
                    inputMode="numeric"
                    aria-invalid={!hops.ok}
                    aria-describedby={hops.ok ? undefined : "pd-hops-error"}
                    data-testid="input-hops"
                    className={`mt-2 ${INPUT}`}
                  />
                </div>
                <label
                  className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
                    ethernet
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={ethernet}
                    onChange={() => setEthernet((v) => !v)}
                    data-testid="checkbox-ethernet"
                  />
                  <span aria-hidden>{ethernet ? "[x]" : "[ ]"}</span>
                  Add Ethernet framing
                </label>
              </div>
              {!hops.ok ? (
                <p id="pd-hops-error" role="alert" className={ERROR_TEXT}>
                  {hops.error}
                </p>
              ) : null}
              <p className={HINT_TEXT}>
                Framing adds the 14-byte header, 4-byte FCS, 8 bytes of preamble and SFD and the 12-byte gap, and pads
                anything under 46 bytes up to the 64-byte minimum frame. Up to {MAX_HOPS} hops.
              </p>

              <div className="mt-4">
                <ToolResult label="Bytes on the wire" value={onWire === null ? "n/a" : onWire.toLocaleString("en-US")} />
                <ToolResult
                  label="Per hop"
                  value={serial === null ? "n/a" : formatDuration(serial)}
                  testId="text-serialization"
                />
                <ToolResult
                  label={`Across ${hops.ok ? hops.value : "n/a"} ${hops.ok && hops.value === 1 ? "hop" : "hops"}`}
                  value={totalSerial === null ? "n/a" : formatDuration(totalSerial)}
                />
                <ToolResult
                  label="Plus propagation, one way"
                  value={totalOneWay === null ? "n/a" : formatDuration(totalOneWay)}
                  testId="text-total-one-way"
                />
                <ToolResult
                  label="Bandwidth-delay product"
                  value={bdp === null ? "n/a" : formatBytes(bdp)}
                  testId="text-bdp"
                />
              </div>
              {ratioText ? <p className={HINT_TEXT}>{ratioText}</p> : null}
              {bdp !== null && rate.ok ? (
                <p className={HINT_TEXT}>
                  To keep {formatRate(rate.value)} busy over this round trip, a sender needs {formatBytes(bdp)} in
                  flight. A TCP window smaller than that caps throughput below the link rate.
                </p>
              ) : null}
            </ToolPanel>
          </div>
        </div>

        {comparison.length ? (
          <ToolPanel title="Same distance, every medium">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-media">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Medium
                    </th>
                    <th scope="col" className={TH}>
                      Path
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      One way
                    </th>
                    <th scope="col" className={`${TH} pr-0 text-right`}>
                      Round trip
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => {
                    const blocked = row.problem !== null;
                    const selected = row.medium.id === mediumId;
                    return (
                      <tr key={row.medium.id} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                        <th
                          scope="row"
                          className={`py-2.5 pr-4 font-mono-tight text-sm font-normal ${
                            selected ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone))]"
                          }`}
                        >
                          {row.medium.label}
                          {row.medium.id === "custom" ? ` (${row.velocityFactor} c)` : ""}
                        </th>
                        <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                          {Number.isFinite(row.pathKm) ? formatKm(row.pathKm) : "n/a"}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right font-mono-tight text-sm ${
                            blocked ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-bone))]"
                          }`}
                        >
                          {blocked ? "no single hop" : formatDuration(row.oneWaySeconds)}
                        </td>
                        <td
                          className={`py-2.5 text-right font-mono-tight text-sm ${
                            blocked ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-bone))]"
                          }`}
                        >
                          {blocked ? "n/a" : formatDuration(row.rttSeconds)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={HINT_TEXT}>
              Ground media cover the route length; satellite rows cover the climb to orbit and back. A GEO hop is at
              least 71,572 km, more than three times the longest great circle on Earth.
            </p>
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
