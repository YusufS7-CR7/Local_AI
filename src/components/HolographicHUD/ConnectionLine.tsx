import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ConnectionLineProps {
  start: [number, number, number];
  end: [number, number, number];
  visible: boolean;
  progress: number;
  color: string;
  hovered: boolean;
}

const ConnectionLine: React.FC<ConnectionLineProps> = ({
  start,
  end,
  visible,
  progress,
  color,
  hovered,
}) => {
  const lineRef = useRef<THREE.Line>(null);
  
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      start[0], start[1], start[2],
      start[0], start[1], start[2]
    ], 3));
    return geo;
  }, [start]);
  
  const material = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, [color]);

  const lineObj = useMemo(() => new THREE.Line(geometry, material), [geometry, material]);

  useFrame(() => {
    if (!lineRef.current) return;
    
    const positions = lineRef.current.geometry.attributes.position as THREE.BufferAttribute;
    
    // Calculate current end position based on progress
    const currentEndX = start[0] + (end[0] - start[0]) * progress;
    const currentEndY = start[1] + (end[1] - start[1]) * progress;
    const currentEndZ = start[2] + (end[2] - start[2]) * progress;
    
    positions.setXYZ(1, currentEndX, currentEndY, currentEndZ);
    positions.needsUpdate = true;
    
    // Smoothly update material opacity and color
    const targetOpacity = visible ? (hovered ? 0.8 : 0.4) : 0;
    const mat = lineRef.current.material as THREE.LineBasicMaterial;
    
    mat.opacity += (targetOpacity - mat.opacity) * 0.1;
    
    const targetColor = new THREE.Color(color);
    mat.color.lerp(targetColor, 0.1);
  });

  return <primitive object={lineObj} ref={lineRef} />;
};

export default ConnectionLine;
