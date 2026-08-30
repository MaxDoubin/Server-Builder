/**
 * An open-frame rack: four posts, cross rails, depth rails, casters.
 *
 * The hero scene's RackFrame is an enclosed 42U cabinet in dark steel,
 * which is the right object for a datacenter hall and the wrong one for
 * this library. The racks here are the small open frames that studios,
 * offices and homelabs actually use, and vendors photograph in white on
 * white. Drawing them as a black cabinet lost the entire look.
 *
 * The details that make one read as a real frame rather than a box outline
 * are all small: the black corner castings the tube bolts into, the punched
 * mounting strip with its U numbering, the depth rails the equipment
 * actually rests on, and casters with an offset swivel yoke. Leave those
 * off and you have drawn a wireframe cube.
 *
 * Geometry is real: 19 inch mounting width, 44.45mm per unit, posts on the
 * outside of that, and the height driven by the rack's own unit count
 * rather than a fixed 42U.
 */

import { useMemo } from "react";
import * as THREE from "three";
import { RACK_INNER_WIDTH, U } from "@/components/cinematic/rack3d/rackConfig";
import { rackScrew } from "./parts";
import { surfaceGrain } from "./surfaces";

const POST = 0.03;
/** Height of the bottom rail above the floor, which is where U1 starts. */
export const FRAME_FOOT = 0.085;
const FOOT = FRAME_FOOT;
/** Underside of the wheels, which is where the studio floor goes. */
export const FRAME_GROUND = -0.078;
/** Corner castings, as tall and deep as the tube they join. */
const CORNER = POST * 1.28;

export interface FrameStyle {
  /** Powder coat on the posts and rails. */
  metal: string;
  /** How reflective that coat is. White frames are satin, not chrome. */
  metalness: number;
  roughness: number;
}

export const FRAME_STYLES: Record<string, FrameStyle> = {
  // UniFi frames ship in a satin white that photographs almost paper-pale.
  white: { metal: "#eceef1", metalness: 0.22, roughness: 0.44 },
  // Everyone else's open frame is black powder coat.
  black: { metal: "#2a2e34", metalness: 0.52, roughness: 0.44 },
};

export function OpenRackFrame({
  units,
  depth,
  style = "black",
}: {
  units: number;
  /** Front to back, in meters. A studio frame is far shallower than a cabinet. */
  depth: number;
  style?: keyof typeof FRAME_STYLES;
}) {
  const s = FRAME_STYLES[style] ?? FRAME_STYLES.black;
  const inner = units * U;
  const halfW = RACK_INNER_WIDTH / 2 + POST / 2;
  const halfD = depth / 2;
  const top = FOOT + inner;

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: s.metal,
        metalness: s.metalness,
        roughness: s.roughness,
        roughnessMap: surfaceGrain(),
      }),
    [s.metal, s.metalness, s.roughness],
  );
  const dark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#14171b", metalness: 0.35, roughness: 0.62 }),
    [],
  );
  const rubber = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#25282d", metalness: 0.05, roughness: 0.88 }),
    [],
  );
  const chrome = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#b9c0c8", metalness: 0.92, roughness: 0.2 }),
    [],
  );

  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx, sz] as const));

  return (
    <group>
      {/* Uprights. */}
      {corners.map(([sx, sz]) => (
        <mesh
          key={`p${sx}${sz}`}
          position={[sx * halfW, FOOT + inner / 2, sz * (halfD - POST / 2)]}
          material={mat}
        >
          <boxGeometry args={[POST, inner, POST]} />
        </mesh>
      ))}

      {/* Corner castings at both ends of every upright. The frames in the
          reference renders are extrusion and casting, not welded tube, and
          the black blocks at the corners are most of why they read that
          way against a white background. */}
      {corners.flatMap(([sx, sz]) =>
        [FOOT, top].map((y) => (
          <mesh
            key={`k${sx}${sz}${y}`}
            position={[sx * halfW, y, sz * (halfD - POST / 2)]}
            material={dark}
          >
            <boxGeometry args={[CORNER, CORNER, CORNER]} />
          </mesh>
        )),
      )}

      {/* Cross rails, front and back, top and bottom, plus the side rails
          that stop the frame racking. */}
      {[FOOT, top].flatMap((y) => [
        ...[-1, 1].map((sz) => (
          <mesh key={`rx${y}${sz}`} position={[0, y, sz * (halfD - POST / 2)]} material={mat}>
            <boxGeometry args={[halfW * 2 - CORNER, POST * 0.78, POST * 0.78]} />
          </mesh>
        )),
        ...[-1, 1].map((sx) => (
          <mesh key={`rz${y}${sx}`} position={[sx * halfW, y, 0]} material={mat}>
            <boxGeometry args={[POST * 0.78, POST * 0.78, halfD * 2 - CORNER]} />
          </mesh>
        )),
      ])}

      {/* Punched mounting strips down the inside of all four posts, with the
          square holes real rails have. Equipment ears bolt to these. */}
      {corners.map(([sx, sz]) => (
        <mesh
          key={`s${sx}${sz}`}
          position={[sx * (RACK_INNER_WIDTH / 2 + 0.005), FOOT + inner / 2, sz * (halfD - POST * 0.95)]}
          material={mat}
        >
          <boxGeometry args={[0.014, inner, 0.01]} />
        </mesh>
      ))}

      {/* U markers: one small notch per rack unit on the front rails, the
          numbering a technician counts against. */}
      {Array.from({ length: units }, (_, i) =>
        [-1, 1].map((sx) => (
          <mesh
            key={`u${i}${sx}`}
            position={[sx * (RACK_INNER_WIDTH / 2 + 0.012), FOOT + (i + 0.5) * U, halfD - POST * 0.42]}
            material={dark}
          >
            <boxGeometry args={[0.007, 0.0035, 0.001]} />
          </mesh>
        )),
      )}

      {/* Depth rails: the L brackets running front to back that the boxes
          actually sit on, one pair every four units. */}
      {Array.from({ length: Math.max(1, Math.floor(units / 4)) }, (_, i) =>
        [-1, 1].map((sx) => (
          <mesh
            key={`d${i}${sx}`}
            position={[sx * (RACK_INNER_WIDTH / 2 + 0.008), FOOT + (i * 4 + 0.06) * U, 0]}
            material={mat}
          >
            <boxGeometry args={[0.018, 0.004, halfD * 1.85]} />
          </mesh>
        )),
      )}

      {/* Carry handles, front and back across the top, as the studio frames
          have. Rotated so the arch opens downward into the top rail. */}
      {[-1, 1].map((sz) => (
        <mesh
          key={`h${sz}`}
          position={[0, top + 0.012, sz * halfD * 0.42]}
          rotation={[Math.PI / 2, 0, 0]}
          material={dark}
        >
          <torusGeometry args={[0.05, 0.006, 10, 24, Math.PI]} />
        </mesh>
      ))}

      {/* Bolts through every corner casting, on both visible faces. The
          castings are what the tube bolts into, and a casting with no
          fastener in it is a moulding, not a joint. */}
      {corners.flatMap(([sx, sz]) =>
        [FOOT, top].flatMap((y) => [
          <mesh
            key={`bz${sx}${sz}${y}`}
            position={[sx * halfW, y, sz * (halfD - POST / 2) + sz * CORNER * 0.5]}
            rotation={[0, sz > 0 ? 0 : Math.PI, 0]}
            geometry={rackScrew()}
            material={chrome}
            scale={0.011}
          />,
          <mesh
            key={`bx${sx}${sz}${y}`}
            position={[sx * halfW + sx * CORNER * 0.5, y, sz * (halfD - POST / 2)]}
            rotation={[0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
            geometry={rackScrew()}
            material={chrome}
            scale={0.011}
          />,
        ]),
      )}

      {/* Casters: a chromed swivel yoke on an offset black rubber wheel,
          which is why a rolled rack tracks rather than shudders. */}
      {corners.map(([sx, sz]) => (
        <group key={`c${sx}${sz}`} position={[sx * (halfW - 0.004), FOOT, sz * (halfD - POST)]}>
          <mesh position={[0, -0.012, 0]} material={dark}>
            <boxGeometry args={[POST * 1.3, 0.024, POST * 1.3]} />
          </mesh>
          <mesh position={[0, -0.03, 0]} material={chrome}>
            <cylinderGeometry args={[0.011, 0.011, 0.016, 12]} />
          </mesh>
          <mesh position={[0, -0.046, -0.008]} rotation={[0, 0, Math.PI / 2]} material={rubber}>
            <cylinderGeometry args={[0.032, 0.032, 0.019, 20]} />
          </mesh>
          <mesh position={[0, -0.046, -0.008]} rotation={[0, 0, Math.PI / 2]} material={chrome}>
            <cylinderGeometry args={[0.011, 0.011, 0.021, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
