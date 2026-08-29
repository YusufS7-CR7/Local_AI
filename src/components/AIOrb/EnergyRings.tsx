import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CoreMode, MODE_COLORS } from '../../types';

interface EnergyRingsProps {
  coreMode: CoreMode;
}

const EnergyRings: React.FC<EnergyRingsProps> = ({ coreMode }) => {
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);
  const mat1Ref = useRef<THREE.MeshBasicMaterial>(null);
  const mat2Ref = useRef<THREE.MeshBasicMaterial>(null);
  const mat3Ref = useRef<THREE.MeshBasicMaterial>(null);

  const targetColor = useMemo(() => new THREE.Color(), []);

  useFrame((_state, delta) => {
    const colorScheme = MODE_COLORS[coreMode] || MODE_COLORS.idle;
    targetColor.set(colorScheme.emissive);

    const speed = coreMode === 'executing' ? 2.5 : (coreMode === 'thinking' ? 1.8 : 0.6);

    if (ring1Ref.current) {
      ring1Ref.current.rotation.x += delta * 0.4 * speed;
      ring1Ref.current.rotation.y += delta * 0.2 * speed;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.y -= delta * 0.3 * speed;
      ring2Ref.current.rotation.z += delta * 0.2 * speed;
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.x -= delta * 0.2 * speed;
      ring3Ref.current.rotation.z -= delta * 0.4 * speed;
    }

    if (mat1Ref.current) mat1Ref.current.color.lerp(targetColor, delta * 4);
    if (mat2Ref.current) mat2Ref.current.color.lerp(targetColor, delta * 4);
    if (mat3Ref.current) mat3Ref.current.color.lerp(targetColor, delta * 4);
  });

  return (
    <group>
      {/* Optimized Torus Geometries (8x36 segments instead of 16x100 -> 90% lighter) */}
      <mesh ref={ring1Ref}>
        <torusGeometry args={[1.5, 0.015, 8, 36]} />
        <meshBasicMaterial ref={mat1Ref} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={ring2Ref} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[1.7, 0.018, 8, 36]} />
        <meshBasicMaterial ref={mat2Ref} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={ring3Ref} rotation={[0, Math.PI / 3, Math.PI / 4]}>
        <torusGeometry args={[1.9, 0.012, 8, 36]} />
        <meshBasicMaterial ref={mat3Ref} transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
};

export default EnergyRings;
