
## Why I Built This

I wanted to build something that felt like walking through a real datacenter, not a simplified dashboard or an abstract visualization. The idea was straightforward: what if you could design, build, and operate a server room entirely from your browser?

The project started because I was spending a lot of time working with real rack hardware, cabling, and airflow planning. I wanted a way to prototype datacenter layouts and test ideas visually before committing to physical changes.

## Tech Stack

The foundation is **React Three Fiber**, which gives you the rendering power of Three.js with the component model of React. Every rack, server, and cable is a React component with its own state and lifecycle.

```typescript
function Rack3D({ rack, position, isSelected, onSelect }) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (groupRef.current) {
      const targetY = hovered || isSelected ? 0.05 : 0;
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y, targetY, 0.15
      );
    }
  });

  return <group ref={groupRef} position={position}>
    {/* Rack contents */}
  </group>;
}
```

The important thing in that snippet is what it does not do. The hover animation writes directly to `groupRef.current.position.y` instead of calling `setState`. Calling `setState` inside `useFrame` triggers a React reconciliation on every frame, and at 60 fps you have a 16.67 millisecond budget for everything: animation, physics, and the actual draw. React's diffing is fast, but not "run it sixty times a second across a scene graph of a thousand nodes" fast. The rule I follow is that anything changing every frame is a ref mutation, and anything changing when a user does something is state.

## The Bug in That Lerp

That code has a subtle defect I did not notice for weeks, and almost every Three.js tutorial contains it.

`lerp(current, target, 0.15)` moves 15 percent of the remaining distance per *frame*. On a 60 Hz display the rack settles in about a fifth of a second. On a 144 Hz monitor it settles more than twice as fast, and on a laptop dropping to 30 fps it crawls. The animation speed is a function of the user's refresh rate, which is not a thing you want in your physics.

`useFrame` hands you the delta time in seconds for exactly this reason. The frame-rate independent form of an exponential ease is:

```typescript
useFrame((_, delta) => {
  if (!groupRef.current) return;
  const targetY = hovered || isSelected ? 0.05 : 0;
  const t = 1 - Math.pow(1 - 0.15, delta * 60);  // 0.15 per 60fps frame
  groupRef.current.position.y = THREE.MathUtils.lerp(
    groupRef.current.position.y, targetY, t
  );
});
```

One more `useFrame` rule: never allocate inside it. A `new THREE.Vector3()` in a callback that runs sixty times a second across two hundred components is 12,000 objects per second handed to the garbage collector, and the symptom is a periodic frame hitch rather than a steady slowdown. Hoist scratch vectors to module scope and reuse them.

## Draw Calls Are the Budget

The first version of this project rendered every 1U device as its own mesh. Twenty racks of 42U each is 840 meshes before you add rack frames, PDUs, cable runs, and floor tiles. Each unique geometry and material pair is a separate draw call, each draw call is a round trip to the GPU driver, and a browser starts visibly stuttering in the low thousands. The scene looked fine and ran at 20 fps.

The fix is `THREE.InstancedMesh`. One geometry, one material, N transform matrices, one draw call. Every 1U server chassis in the room is the same box, so they all become instances, and per-unit variation lives in an instance color attribute rather than a separate material. Going from a mesh per device to an instanced mesh per device *type* took the scene from hundreds of draw calls to a handful.

Selection needs care once you do this, because instances are not scene graph objects and do not raycast individually. Three's `Raycaster` also tests every object you hand it, so pointer events over a dense scene get expensive fast. The approach that worked was two-stage: raycast against one invisible bounding box per rack, and only when that hits, resolve which U slot the intersection point falls into with arithmetic. That turns a thousand intersection tests into twenty.

## Procedural Generation

The most interesting challenge was procedural generation. Each rack needs realistic equipment (servers, switches, storage arrays) placed in valid U-slots with realistic power and thermal profiles.

I used seeded randomization so the same seed always produces the same datacenter layout. The scene is deterministic but still feels organic and varied.

Getting there required writing my own generator, because JavaScript's `Math.random()` cannot be seeded. The specification leaves the algorithm implementation-defined and exposes no seed parameter, so "same seed, same layout" is impossible with the built-in. Any small pure-function PRNG solves it. A 32-bit xorshift or mulberry32 is about six lines, produces the same sequence in every browser, and gives you a property that turns out to matter more than determinism itself: a layout becomes a short string you can put in a URL.

The constraint solver on top is the part that makes the output look real rather than random. Equipment has a height in U and cannot straddle another device, heavy storage arrays belong low in the rack, switches belong at the top or in the middle where cable runs are shortest, and the total draw of a rack cannot exceed its circuit. Random placement without those rules produces layouts that are obviously wrong to anyone who has racked hardware.

## Rack Geometry Has Real Numbers

If the U grid is not exact, nothing lines up and every rack looks subtly wrong. The standard numbers are worth hardcoding correctly once.

A rack unit is exactly 1.75 inches, which is 44.45 mm. The 19 inches in "19-inch rack" is the width of the mounting flanges, 482.6 mm, and the usable equipment width is narrower at about 450 mm. Mounting holes within each U repeat in a 0.5 in, 0.625 in, 0.625 in pattern rather than being evenly spaced, which is why a badly measured rack rail is off by a few millimeters and will not seat. A full-height 42U rack gives 73.5 inches, or 1867 mm, of usable vertical space.

Build everything as a multiple of 44.45 mm and a 2U server is exactly 88.9 mm, with no fudge factors.

## Thermal Simulation

Every piece of equipment generates heat based on its power draw. Racks accumulate inlet and exhaust temperatures. The visual representation changes accordingly: racks shift from green (cool) through yellow and orange to red (critical).

This ties directly into real datacenter concepts like hot aisle/cold aisle containment and cooling capacity planning.

The model is a bulk energy balance: every watt drawn by IT equipment becomes a watt of heat, so a rack's heat output is its power draw. From there the airflow needed to carry that heat away at a given temperature rise falls out of the specific heat of air. Air is about 1.005 kJ per kg per kelvin at room temperature and about 1.2 kg per cubic meter at sea level, so roughly 1206 joules per cubic meter per kelvin. A 5 kW rack with an 11 K rise across it needs 5000 / (1206 * 11) = 0.38 cubic meters per second, which is about 800 CFM.

The target range comes from the ASHRAE recommended envelope for datacenter inlet air, 18 to 27 degrees Celsius, so a rack whose modelled inlet climbs past 27 turns orange and one past 32 turns red.

Blanking panels earn their place in the model too. An empty U with no panel is a hole between the hot aisle and the cold aisle, and exhaust air recirculates straight back to the inlet of the device above it. In the simulation, unblanked slots add a recirculation term to the rack's inlet temperature, which is the fastest way I know to make the point that the cheapest cooling upgrade in most rooms costs about two dollars a slot.

## Power Is the Other Constraint

Racks fill up on amps long before they fill up on U. A 30 A 208 V single-phase circuit is 6.24 kVA nameplate, but the continuous-load rule in the National Electrical Code means you size a circuit at 125 percent of a continuous load, so you plan against 80 percent of the breaker: 4.99 kVA usable. Twenty 250 W servers reach that before the rack is half full.

The simulation tracks per-PDU load against that derated limit and refuses placements that exceed it, and it computes a rough PUE, the ratio of total facility energy to IT equipment energy. A perfect facility is 1.0, meaning every watt goes to compute. Typical enterprise rooms land well above that, and the gap is cooling.

## What the Simulation Cannot Do

This is not computational fluid dynamics, and it would be dishonest to imply otherwise. A bulk energy balance with a per-rack mixing term assumes air goes where the arrows say. Real airflow does not. It recirculates over the top of a short row, bypasses through gaps in a containment aisle, and forms pressure differences under a raised floor that starve the tiles at the end of a run. Predicting any of that requires meshing the room and solving Navier-Stokes, which is hours of compute in a real CFD package.

The model is also steady-state. Real rooms have thermal mass, so a cooling failure gives you minutes of ride-through, not instant redline, and that ride-through window is exactly the number an operator wants during an outage. It ignores humidity, and it ignores altitude, where thinner air means the same CFM removes less heat and server vendors publish derating curves above roughly 900 meters.

So the honest description is that this is a tool for layout, capacity arithmetic, and intuition. It will tell you that you cannot fit 12 kW in a rack fed by a 30 A circuit, and it will show you what a row looks like with the aisles reversed. It will not tell you your containment design is sound. Nothing that runs at 60 fps in a browser will.

## What I Learned

Building this project taught me a lot about the relationship between software and physical infrastructure. Datacenter design is not just about putting servers in a room. It is about airflow, power distribution, redundancy, and monitoring. Translating those real constraints into a simulation forced me to understand them deeply.

The specific thing simulation forces on you is precision. You cannot write "racks get hot" in code. You have to decide how hot, from what, in what units, and then watch the result be visibly wrong until the physics is right.

## References

- https://threejs.org/docs/index.html#api/en/objects/InstancedMesh
- https://r3f.docs.pmnd.rs/getting-started/introduction
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
- https://en.wikipedia.org/wiki/Rack_unit
- https://en.wikipedia.org/wiki/Power_usage_effectiveness
- https://en.wikipedia.org/wiki/Table_of_specific_heat_capacities
