import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CoreMode, MODE_COLORS } from '../../types';

interface ParticlesProps {
  coreMode: CoreMode;
}

// Optimized particle count for smooth 60fps on all GPUs
const PARTICLE_COUNT = 80;

const Particles: React.FC<ParticlesProps> = ({ coreMode }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const radius = 1.3 + Math.random() * 0.7;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);
      
      temp.push({
        origX: x,
        origY: y,
        origZ: z,
        speed: 0.3 + Math.random() * 0.4,
        offset: Math.random() * Math.PI * 2,
      });
    }
    return temp;
  }, []);

  const currentColor = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const colorConfig = MODE_COLORS[coreMode] || MODE_COLORS.idle;
    currentColor.lerp(new THREE.Color(colorConfig.emissive), delta * 4);

    const time = state.clock.elapsedTime;
    const speedMult = coreMode === 'executing' ? 2.5 : (coreMode === 'thinking' ? 1.8 : 0.8);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      const t = time * p.speed * speedMult + p.offset;
      
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      
      const x = p.origX * cosT - p.origZ * sinT;
      const z = p.origX * sinT + p.origZ * cosT;
      const y = p.origY + Math.sin(t * 2.0) * 0.15;
      
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.025);
      dummy.updateMatrix();
      
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, currentColor);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]}>
      <planeGeometry args={[0.8, 0.8]} />
      <meshBasicMaterial 
        transparent={true} 
        opacity={0.6} 
        side={THREE.DoubleSide} 
        depthWrite={false} 
        blending={THREE.AdditiveBlending} 
      />
    </instancedMesh>
  );
};

export default Particles;
