import { useMemo } from "react";
import { RackFrame } from "./parts/RackFrame";
import { ServerChassis } from "./parts/ServerChassis";
import { PDU } from "./parts/PDU";
import { Cables } from "./parts/Cables";
import { RACK_FEET_HEIGHT, RACK_LAYOUT, U } from "./rackConfig";

/**
 * Populated 42U rack assembled from RACK_LAYOUT.
 *
 * Base is at Y=0. Each slot anchors on the U boundary and extends upward.
 */
export function Rack() {
  const slots = useMemo(() => RACK_LAYOUT, []);

  return (
    <group>
      <RackFrame />

      {slots.map((slot, i) => {
        const centerY =
          RACK_FEET_HEIGHT + (slot.u - 1 + slot.size / 2) * U;
        return (
          <group key={`${slot.u}-${i}`} position={[0, centerY, 0]}>
            <ServerChassis
              kind={slot.kind}
              sizeU={slot.size}
              accent={slot.accent}
              label={slot.label}
              seed={i + 1}
            />
          </group>
        );
      })}

      <PDU side="right" />
      <PDU side="left" />
      <Cables />
    </group>
  );
}
