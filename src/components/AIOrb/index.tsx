import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CoreState, CoreMode } from '../../types';
import { vertexShader, fragmentShader, AIOrbUniforms } from './shaders';
import Particles from './Particles';
import EnergyRings from './EnergyRings';

interface AIOrbProps {
  coreState: CoreState;
  physicsRef: React.MutableRefObject<any>;
  onOrbClick: () => void;
}

const getModeValue = (mode: CoreMode): number => {
  switch (mode) {
    case 'idle': return 0;
    case 'listening': return 1;
    case 'thinking': return 2;
    case 'planning': return 3;
    case 'executing': return 4;
    case 'awaiting_confirmation': return 5;
    case 'speaking': return 6;
    case 'error': return 7;
    default: return 0;
  }
};

const AIOrb: React.FC<AIOrbProps> = ({ coreState, physicsRef, onOrbClick }) => {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  const mode = coreState.mode;
  
  const uniforms = useMemo<AIOrbUniforms>(() => ({
    uTime: { value: 0 },
    uIntensity: { value: 1.0 },
    uColorShift: { value: 0 },
    uMode: { value: 0 },
  }), []);

  const targetModeRef = useRef(0);

  useFrame((_state, delta) => {
    targetModeRef.current = getModeValue(mode);

    // ── Unified 60fps Physics & Smooth Parallax ──
    if (groupRef.current && physicsRef.current) {
      const phys = physicsRef.current;

      // Snappy parallax: follows mouse quickly with crisp responsive lerp (0.15)
      const targetX = (phys.targetMouseX || 0) * 0.6;
      const targetY = (phys.targetMouseY || 0) * 0.6;
      
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, delta * 8);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, delta * 8);
      
      // Update shared state position
      phys.position[0] = groupRef.current.position.x;
      phys.position[1] = groupRef.current.position.y;

      // Scale smoothly
      const targetScale = phys.targetScale || 1.0;
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(groupRef.current.scale.x, targetScale, delta * 6));

      // Apply drag inertia
      if (phys.rotationVelocity) {
        groupRef.current.rotation.x += phys.rotationVelocity[0];
        groupRef.current.rotation.y += phys.rotationVelocity[1];

        // Crisp damping when user releases mouse
        phys.rotationVelocity[0] *= 0.88;
        phys.rotationVelocity[1] *= 0.88;
      }
    }

    // Lively idle rotation so the sphere never feels frozen/sluggish
    if (meshRef.current) {
      const idleSpeed = mode === 'executing' ? 1.2 : (mode === 'thinking' ? 0.8 : 0.45);
      meshRef.current.rotation.y += delta * idleSpeed;
      meshRef.current.rotation.x += delta * (idleSpeed * 0.3);
    }

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
      materialRef.current.uniforms.uColorShift.value += delta * 0.5;
      
      materialRef.current.uniforms.uMode.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uMode.value,
        targetModeRef.current,
        delta * 8
      );
    }
  });

  return (
    <group ref={groupRef}>
      <mesh
        ref={meshRef}
        onClick={onOrbClick}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[1, 32, 32]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent={true}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Particles coreMode={mode} />
      <EnergyRings coreMode={mode} />
    </group>
  );
};

export default AIOrb;
