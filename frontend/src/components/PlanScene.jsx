import React, { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PresentationControls } from '@react-three/drei'

function planColor(trafficGb) {
  const gb = trafficGb || 0
  if (gb <= 10)  return '#10b981' // emerald green
  if (gb <= 30)  return '#3b82f6' // bright blue
  if (gb <= 60)  return '#6366f1' // indigo
  if (gb <= 120) return '#8b5cf6' // royal purple
  if (gb <= 200) return '#ec4899' // hot pink
  return '#f43f5e' // rose red
}

/* ─── Individual Volumetric Canister 3D Model ─────────────────── */
function PlanCanister({ plan, i, total, maxTrafficGb, selectedPlan, onSelect }) {
  const meshRef = useRef()
  const coreRef = useRef()
  const [hovered, setHovered] = useState(false)

  const gb = plan.traffic_gb || 0
  const color = planColor(gb)
  const isSelected = selectedPlan?.plan_name === plan.plan_name

  // Scale height: minimum 1.0, maximum 2.5
  const max = maxTrafficGb || 1
  const height = 1.0 + (gb / max) * 1.5

  // Sizing & opacity transitions based on selection state
  const targetScale = isSelected ? 1.35 : hovered ? 1.05 : 0.85
  const opacity = isSelected ? 0.8 : hovered ? 0.6 : 0.3

  // Spacing along X-axis
  const spacing = 1.8
  const posX = (i - (total - 1) / 2) * spacing

  // Dynamic animation loop for rotation and soft floating
  useFrame((state) => {
    const time = state.clock.getElapsedTime()
    if (meshRef.current) {
      // Rotate selected canister faster to denote activation
      meshRef.current.rotation.y = time * (isSelected ? 0.9 : 0.3) + i * 0.5
      // Gentle floating up and down
      meshRef.current.position.y = Math.sin(time * 1.5 + i) * (isSelected ? 0.12 : 0.05)
    }
    if (coreRef.current) {
      coreRef.current.rotation.y = -time * 1.2
    }
  })

  return (
    <group position={[posX, -0.3, 0]} scale={[targetScale, targetScale, targetScale]}>
      {/* 3D Canister Structure */}
      <group
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={() => onSelect(plan)}
        style={{ cursor: 'pointer' }}
      >
        {/* Outer glass cylinder */}
        <mesh position={[0, height / 2, 0]}>
          <cylinderGeometry args={[0.55, 0.55, height, 32]} />
          <meshStandardMaterial
            roughness={0.15}
            metalness={0.2}
            color={color}
            transparent
            opacity={opacity}
          />
        </mesh>

        {/* Inner glowing power core */}
        <mesh ref={coreRef} position={[0, height / 2, 0]}>
          <cylinderGeometry args={[0.18, 0.18, height * 0.76, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isSelected ? 2.5 : hovered ? 1.6 : 0.6}
            transparent
            opacity={isSelected ? 1.0 : 0.7}
          />
        </mesh>

        {/* Metal top cap */}
        <mesh position={[0, height + 0.03, 0]}>
          <cylinderGeometry args={[0.57, 0.57, 0.06, 32]} />
          <meshStandardMaterial
            metalness={0.9}
            roughness={0.2}
            color="#475569"
            transparent
            opacity={isSelected ? 1.0 : 0.5}
          />
        </mesh>

        {/* Metal bottom cap */}
        <mesh position={[0, -0.03, 0]}>
          <cylinderGeometry args={[0.57, 0.57, 0.06, 32]} />
          <meshStandardMaterial
            metalness={0.9}
            roughness={0.2}
            color="#475569"
            transparent
            opacity={isSelected ? 1.0 : 0.5}
          />
        </mesh>

        {/* Spotlight basic circle projected underneath */}
        <mesh position={[0, -0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.2, 1.2]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={isSelected ? 0.45 : hovered ? 0.25 : 0.08}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  )
}

/* ─── Main 3D Volume Visualizer Header Component ─────────────────── */
export default function PlanScene({ plans, selectedPlan, onSelectPlan, maxTrafficGb }) {
  const sorted = [...plans].sort((a, b) => (a.traffic_gb || 0) - (b.traffic_gb || 0))
  const n = sorted.length

  return (
    <div className="w-full relative h-[180px] bg-slate-950/40 rounded-3xl border border-slate-800/60 overflow-hidden flex flex-col justify-between">
      {/* Ambient background radial glow centered around selected element */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900/30 via-slate-950/15 to-transparent pointer-events-none" />

      {/* Swipe guide helper */}
      <div className="absolute top-3 left-4 flex items-center gap-1.5 pointer-events-none select-none z-10">
        <div className="w-1 h-1 bg-emerald-500 rounded-full animate-ping" />
        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
          3D Interactive Visualizer
        </span>
      </div>

      {/* Canvas Element */}
      <Canvas
        camera={{ position: [0, 0.8, 4.5], fov: 38 }}
        className="w-full h-full"
      >
        <ambientLight intensity={0.7} />
        <pointLight position={[4, 4, 4]} intensity={1.2} />
        <pointLight position={[-4, -4, -4]} intensity={0.3} />
        <directionalLight position={[0, 6, 1]} intensity={1.0} />

        {/* Drag-to-rotate interaction controls */}
        <PresentationControls
          global
          config={{ mass: 1, tension: 180, friction: 22 }}
          snap={{ mass: 1.5, tension: 150, friction: 28 }}
          rotation={[0, 0, 0]}
          polar={[-Math.PI / 18, Math.PI / 15]} // Lock vertical tilt
          azimuth={[-Math.PI / 5, Math.PI / 4]}   // Lock horizontal rotation to stay centered
        >
          {/* Base docking platform station */}
          <group position={[0, -0.6, 0]}>
            <mesh position={[0, -0.06, 0]}>
              <cylinderGeometry args={[n * 0.95 + 0.2, n * 0.95 + 0.3, 0.1, 32]} />
              <meshStandardMaterial metalness={0.8} roughness={0.3} color="#1e293b" />
            </mesh>

            {/* Individual active cylinders */}
            {sorted.map((plan, i) => (
              <PlanCanister
                key={plan.plan_name}
                plan={plan}
                i={i}
                total={n}
                maxTrafficGb={maxTrafficGb}
                selectedPlan={selectedPlan}
                onSelect={onSelectPlan}
              />
            ))}
          </group>
        </PresentationControls>
      </Canvas>
    </div>
  )
}
