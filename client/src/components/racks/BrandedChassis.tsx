/**
 * A rack device in 3D, wearing its own vendor's finish.
 *
 * The hero scene's ServerChassis is deliberately generic: it fills a
 * fictional datacenter with plausible hardware. The library is the opposite
 * problem. A UniFi rack has to look like UniFi and a Catalyst closet has to
 * look like Cisco, because telling those two apart on sight is most of what
 * the page is teaching, and a rack of identical grey boxes teaches nothing.
 *
 * So this builds each device from the same RackDefinition the elevation
 * uses: the vendor's chassis finish, the port throat colour, the real port
 * counts laid out in the real two-row arrangement, and emissive indicators
 * that inherit each port's actual link state. One source of truth, two
 * renderers, and they cannot drift.
 *
 * Materials are memoised per finish rather than per device, because a rack
 * holds up to ten devices and three.js materials are expensive to rebuild
 * every frame.
 *
 * The connectors themselves are not drawn here. They are modelled parts
 * with shielded rims, latch slots and gold contacts, and there are hundreds
 * of them in a rack, so RackHardware instances the lot in one pass. What
 * stays here is the chassis: body, ears, screen, recess, vents, bays, and
 * the indicators, which have to blink and so cannot be instanced with the
 * static parts.
 */

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { RackDevice } from "@/lib/rackTypes";
import { MATERIALS } from "./RackDefs";
import { CHASSIS_WIDTH, chassisLayout, deviceDepth } from "./chassisLayout";
import { chassisShell } from "./parts";
import { faceplateTexture } from "./faceplateTexture";
import { bodyColour, surfaceGrain } from "./surfaces";
import { screenTexture } from "./screenTexture";
import { RACK_INNER_WIDTH, U } from "@/components/cinematic/rack3d/rackConfig";

const LED_HEX: Record<string, string> = {
  green: "#4ef08a",
  blue: "#5ad2ff",
  amber: "#ffc043",
  red: "#ff5f5f",
  off: "#191d22",
};

/** One standing material per finish, shared by every device that wears it. */
const chassisMaterials = new Map<string, THREE.MeshStandardMaterial>();
function chassisMaterial(finish: string): THREE.MeshStandardMaterial {
  let m = chassisMaterials.get(finish);
  if (!m) {
    const spec = MATERIALS[finish] ?? MATERIALS.dark;
    m = new THREE.MeshStandardMaterial({
      color: bodyColour(finish),
      // Anodised aluminium is far more reflective than powder coated steel,
      // and that difference is most of how the two read apart in a photo.
      // Both need the scene's environment map: a metal surface with nothing
      // to reflect renders black, which is why the first pass came out grey
      // and dead however much light was thrown at it.
      metalness: spec.pale ? 0.55 : 0.46,
      roughness: spec.pale ? 0.3 : 0.44,
      roughnessMap: surfaceGrain(),
      // Dark finishes lean harder on reflection, because that is all the
      // shape information a dark surface has to give.
      envMapIntensity: spec.pale ? 1.15 : 1.5,
    });
    chassisMaterials.set(finish, m);
  }
  return m;
}

const throatMaterial = new THREE.MeshStandardMaterial({ color: "#05070a", metalness: 0.2, roughness: 0.95 });
const shellMaterial = new THREE.MeshStandardMaterial({ color: "#20252c", metalness: 0.5, roughness: 0.6 });
/** One backlit screen material per display kind. */
const screenMaterials = new Map<string, THREE.MeshStandardMaterial>();
function screenMaterial(kind: "unifi" | "ups" | "server"): THREE.MeshStandardMaterial {
  let m = screenMaterials.get(kind);
  if (!m) {
    const tex = screenTexture(kind);
    m = new THREE.MeshStandardMaterial({
      color: "#0a1015",
      map: tex ?? undefined,
      // Emissive, because a screen is a light source. Lit only by the room
      // it would read as a dark sticker whatever is drawn on it.
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: tex ?? undefined,
      emissiveIntensity: 1.15,
      metalness: 0.05,
      roughness: 0.2,
    });
    screenMaterials.set(kind, m);
  }
  return m;
}
const earMaterial = new THREE.MeshStandardMaterial({ color: "#2b3036", metalness: 0.7, roughness: 0.5 });
/**
 * The port band.
 *
 * On a real UniFi switch the jacks do not sit on the white face. They sit
 * in a dark inset panel that runs the height of the port block, and that
 * band is most of what makes the product recognisable at a glance. Drawn
 * as a pale milled pocket, which is what it was, the ports read as loose
 * holes punched in a blank plate and the whole face looked like a mockup.
 */
const recessMaterial = new THREE.MeshStandardMaterial({
  color: "#1e2126",
  metalness: 0.3,
  roughness: 0.66,
  envMapIntensity: 0.45,
});

const ledMaterials = new Map<string, THREE.MeshBasicMaterial>();
function ledMaterial(state: string): THREE.MeshBasicMaterial {
  let m = ledMaterials.get(state);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: LED_HEX[state] ?? LED_HEX.off });
    ledMaterials.set(state, m);
  }
  return m;
}

interface Props {
  device: RackDevice;
  /** Front plane of the rack this device is mounted in. */
  faceZ: number;
  /** Deterministic per-device offset so indicators do not blink in lockstep. */
  seed: number;
}

export function BrandedChassis({ device, faceZ, seed }: Props) {
  const h = device.u * U;
  const depth = deviceDepth(device);
  const finish = device.finish ?? "dark";
  const body = chassisMaterial(finish);
  const blinkRef = useRef<THREE.Group>(null);

  const layout = useMemo(() => chassisLayout(device), [device]);

  /*
    The silkscreen. Drawn to a canvas once per device and laid on the face
    as a thin plane, with the port block punched transparent so the
    modelled jacks show through rather than being painted over.
  */
  const silkscreen = useMemo(() => faceplateTexture(device), [device]);
  const silkMaterial = useMemo(() => {
    if (!silkscreen) return null;
    const spec = MATERIALS[finish] ?? MATERIALS.dark;
    return new THREE.MeshStandardMaterial({
      map: silkscreen,
      transparent: true,
      metalness: spec.pale ? 0.5 : 0.42,
      roughness: spec.pale ? 0.34 : 0.46,
      roughnessMap: surfaceGrain(),
      envMapIntensity: spec.pale ? 1.1 : 1.45,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }, [silkscreen, finish]);

  // Indicators flicker rather than pulse in unison, which is what a live
  // switch actually looks like across a room.
  useFrame(({ clock }) => {
    const g = blinkRef.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, i) => {
      const phase = (i * 0.37 + seed * 0.61) % 1;
      const rate = 1.4 + ((i + seed) % 5) * 0.34;
      child.visible = Math.sin((t + phase * 10) * rate) > -0.35;
    });
  });

  const bays = device.bays;
  const look = device.family === "blank" ? device.look ?? "solid" : null;

  return (
    <group>
      {/* Chassis body, in the vendor's own finish, as deep as the real
          hardware rather than as deep as the rack, with the chamfered edges
          every folded steel case has. */}
      <mesh
        position={[0, 0, faceZ]}
        material={body}
        geometry={chassisShell(CHASSIS_WIDTH, h - 0.0012, depth)}
      />
      {silkMaterial && (
        <mesh position={[0, 0, faceZ + 0.0003]} material={silkMaterial}>
          <planeGeometry args={[CHASSIS_WIDTH - 0.003, h - 0.004]} />
        </mesh>
      )}
      {/* Mounting ears, always steel regardless of the chassis finish. */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * (CHASSIS_WIDTH / 2 + (RACK_INNER_WIDTH - CHASSIS_WIDTH) / 4), 0, faceZ - 0.0025]}
          material={earMaterial}
        >
          <boxGeometry args={[(RACK_INNER_WIDTH - CHASSIS_WIDTH) / 2 + 0.006, h - 0.002, 0.0025]} />
        </mesh>
      ))}
      {/* A thin accent inlay, the one marking that is ours and not the
          vendor's, kept to the far left edge as the elevation does. It is
          a hairline here rather than the elevation's bar: at 5mm on a
          photographic render it stopped reading as an index mark and
          started reading as a sticker somebody put on the hardware. */}
      {device.accent && (
        <mesh position={[-CHASSIS_WIDTH / 2 + 0.0035, 0, faceZ + 0.0006]}>
          <boxGeometry args={[0.0022, h * 0.6, 0.001]} />
          <meshBasicMaterial color={device.accent} />
        </mesh>
      )}

      {/* The little front panel screen the UniFi and UPS faces carry. In the
          reference renders it is the one bright square on an otherwise
          featureless white face, and leaving it off made them read blank. */}
      {device.display && (
        <group position={[-CHASSIS_WIDTH / 2 + h * 0.42, 0, faceZ]}>
          <mesh position={[0, 0, -0.001]} material={shellMaterial}>
            <boxGeometry args={[h * 0.5, h * 0.5, 0.004]} />
          </mesh>
          <mesh position={[0, 0, 0.0016]} material={screenMaterial(device.display ?? "unifi")}>
            <planeGeometry args={[h * 0.42, h * 0.42]} />
          </mesh>
        </group>
      )}

      {layout && (
        <>
          {/* The port field is milled into the face, not printed on it. On
              the real hardware that recess is a couple of millimetres deep
              and it is what stops a switch front reading as a sticker. */}
          <mesh position={[layout.field.x, layout.field.y, faceZ - 0.0014]} material={recessMaterial}>
            <boxGeometry args={[layout.field.w + 0.006, layout.field.h + 0.004, 0.003]} />
          </mesh>
          {/* Emissive indicators, one per lit port, blinked by the frame
              loop above. Separated into their own group so the loop walks
              only the lights and not the whole chassis. */}
          <group ref={blinkRef}>
            {[...layout.copper, ...layout.cages]
              .filter((it) => it.port.led && it.port.led !== "off")
              .map((it, i) => (
                <mesh
                  key={`l${i}`}
                  position={[it.x - it.w * 0.28, it.y + it.h * 0.42, faceZ + 0.0012]}
                  material={ledMaterial(it.port.led as string)}
                >
                  <boxGeometry args={[it.w * 0.13, it.h * 0.075, 0.001]} />
                </mesh>
              ))}
          </group>
        </>
      )}

      {/* Passive panels. A vented plate, a solid plate and a finger duct are
          three visibly different objects, and drawing all three as a blank
          rectangle threw away a third of the rack. */}
      {look === "fingers" &&
        Array.from({ length: 9 }, (_, i) => (
          <mesh
            key={`f${i}`}
            position={[-CHASSIS_WIDTH * 0.42 + (i * CHASSIS_WIDTH * 0.84) / 8, 0, faceZ + 0.018]}
            material={body}
          >
            <boxGeometry args={[0.012, h * 0.86, 0.04]} />
          </mesh>
        ))}

      {/* Drive sleds, for the storage and compute faces. */}
      {bays && (
        <group>
          {Array.from({ length: bays.count }, (_, i) => {
            const rows = device.u >= 2 ? 2 : 1;
            const cols = Math.ceil(bays.count / rows);
            const bw = (CHASSIS_WIDTH * 0.86) / cols;
            const bh = (h * 0.8) / rows;
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = -CHASSIS_WIDTH * 0.43 + col * bw + bw / 2;
            const y = rows === 2 ? (row === 0 ? bh * 0.52 : -bh * 0.52) : 0;
            const filled = i < bays.occupied;
            return (
              <group key={`b${i}`} position={[x, y, faceZ]}>
                <mesh position={[0, 0, -0.002]}>
                  <boxGeometry args={[bw * 0.92, bh * 0.88, 0.006]} />
                  <meshStandardMaterial color={filled ? "#2b3036" : "#0a0c0f"} metalness={0.6} roughness={0.6} />
                </mesh>
                {filled && (
                  <mesh position={[bw * 0.36, bh * 0.26, 0.002]} material={ledMaterial("green")}>
                    <boxGeometry args={[bw * 0.05, bh * 0.09, 0.001]} />
                  </mesh>
                )}
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
}
