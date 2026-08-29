import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { HudMenuItem } from '../../types';

interface MenuItem3DProps {
  item: HudMenuItem;
  position: [number, number, number];
  visible: boolean;
  isHovered: boolean;
  isActive: boolean;
  color: string;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}

const MenuItem3D: React.FC<MenuItem3DProps> = ({
  item,
  position,
  visible,
  isHovered,
  isActive,
  color,
  onHover,
  onClick,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const nodeRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const scaleRef = useRef(0);

  // Create sprite texture
  const spriteMaterial = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillRect(0, 0, 256, 64);
      
      ctx.font = 'bold 32px monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Glow effect
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      
      ctx.fillText(item.label, 128, 32);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    
    return new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0xffffff,
    });
  }, [item.label, color]);

  useEffect(() => {
    return () => {
      spriteMaterial.map?.dispose();
      spriteMaterial.dispose();
    };
  }, [spriteMaterial]);

  useFrame((state) => {
    if (!groupRef.current || !nodeRef.current || !ringRef.current || !glowRef.current) return;
    
    const delta = state.clock.getDelta();
    const time = state.clock.getElapsedTime();
    
    // Scale animation
    const targetScale = visible ? 1 : 0;
    scaleRef.current += (targetScale - scaleRef.current) * 0.1;
    groupRef.current.scale.setScalar(scaleRef.current);
    
    // Floating animation
    const floatOffset = Math.sin(time * 2 + item.angle) * 0.1;
    groupRef.current.position.set(position[0], position[1] + floatOffset, position[2]);
    
    // Node hover scale
    const targetNodeScale = isHovered ? (0.14 / 0.08) : 1;
    nodeRef.current.scale.setScalar(nodeRef.current.scale.x + (targetNodeScale - nodeRef.current.scale.x) * 0.2);
    
    // Ring rotation
    const rotationSpeed = isHovered ? 2.5 : 0.5;
    ringRef.current.rotation.z += delta * rotationSpeed;
    ringRef.current.rotation.x += delta * (rotationSpeed * 0.5);
    
    // Glow pulse
    const baseGlowOpacity = isHovered ? 0.2 : 0.08;
    const activePulse = isActive ? 0.3 : 0;
    const targetGlowOpacity = baseGlowOpacity + activePulse + (Math.sin(time * 4) * 0.02);
    const glowMat = glowRef.current.material as THREE.MeshBasicMaterial;
    glowMat.opacity += (targetGlowOpacity - glowMat.opacity) * 0.15;
    
    // Update colors smoothly
    const targetColor = new THREE.Color(color);
    (nodeRef.current.material as THREE.MeshBasicMaterial).color.lerp(targetColor, 0.1);
    (ringRef.current.material as THREE.MeshBasicMaterial).color.lerp(targetColor, 0.1);
    glowMat.color.lerp(targetColor, 0.1);
  });

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
    onHover(item.id);
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = 'default';
    onHover(null);
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick(item.id);
  };

  return (
    <group ref={groupRef}>
      {/* Node Dot */}
      <mesh
        ref={nodeRef}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[0.08, 32, 32]} />
        <meshBasicMaterial 
          color={color} 
          blending={THREE.AdditiveBlending}
          transparent={true}
          depthWrite={false}
        />
      </mesh>

      {/* Outer Ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[0.22, 0.008, 16, 64]} />
        <meshBasicMaterial 
          color={color} 
          transparent={true}
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Glow Halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshBasicMaterial 
          color={color}
          transparent={true}
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Label Sprite */}
      <sprite material={spriteMaterial} position={[0, 0.4, 0]} scale={[1.0, 0.25, 1]} />
    </group>
  );
};

export default MenuItem3D;
