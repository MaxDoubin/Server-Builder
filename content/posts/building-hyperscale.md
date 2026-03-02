# Building Hyperscale: A 3D Datacenter Simulator

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

## Procedural Generation

The most interesting challenge was procedural generation. Each rack needs realistic equipment (servers, switches, storage arrays) placed in valid U-slots with realistic power and thermal profiles.

I used seeded randomization so the same seed always produces the same datacenter layout. The scene is deterministic but still feels organic and varied.

## Thermal Simulation

Every piece of equipment generates heat based on its power draw. Racks accumulate inlet and exhaust temperatures. The visual representation changes accordingly: racks shift from green (cool) through yellow and orange to red (critical).

This ties directly into real datacenter concepts like hot aisle/cold aisle containment and cooling capacity planning.

## What I Learned

Building this project taught me a lot about the relationship between software and physical infrastructure. Datacenter design is not just about putting servers in a room. It is about airflow, power distribution, redundancy, and monitoring. Translating those real constraints into a simulation forced me to understand them deeply.
