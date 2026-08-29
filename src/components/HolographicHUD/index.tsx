import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CoreState, HUD_MENU_ITEMS, MODE_COLORS, HudMenuItem, OrbState } from '../../types';
import { clamp } from '../../utils/smoothing';
import ConnectionLine from './ConnectionLine';
import MenuItem3D from './MenuItem3D';

interface HolographicHUDProps {
  coreState: CoreState;
  physicsRef: React.MutableRefObject<OrbState>;
  onMenuSelect: (id: string) => void;
  onMenuHover: (id: string | null) => void;
}

const HUDItemAnimated: React.FC<{
  item: HudMenuItem;
  index: number;
  position: [number, number, number];
  coreState: CoreState;
  color: string;
  onMenuSelect: (id: string) => void;
  onMenuHover: (id: string | null) => void;
}> = ({ item, index, position, coreState, color, onMenuSelect, onMenuHover }) => {
  const [progress, setProgress] = React.useState(0);
  const targetOpenRef = useRef(coreState.menuOpen ? 1 : 0);
  const currentOpenRef = useRef(coreState.menuOpen ? 1 : 0);

  targetOpenRef.current = coreState.menuOpen ? 1 : 0;

  useFrame(() => {
    // Lerp overall menu openness
    currentOpenRef.current += (targetOpenRef.current - currentOpenRef.current) * 0.1;
    
    // Calculate staggered progress for this specific item
    const staggered = clamp((currentOpenRef.current - index * 0.1) / 0.7, 0, 1);
    
    // Only update state if change is significant to avoid excessive re-renders, 
    // or we can use refs inside ConnectionLine and MenuItem3D. 
    // Since props are requested, we'll update state. To avoid excessive renders, we round it slightly.
    if (Math.abs(staggered - progress) > 0.01) {
      setProgress(staggered);
    }
  });

  const isHovered = coreState.hoveredMenuItem === item.id;
  const isActive = coreState.activeMenuItem === item.id;
  const visible = progress > 0.5;

  return (
    <group>
      <ConnectionLine
        start={[0, 0, 0]}
        end={position}
        visible={coreState.menuOpen}
        progress={progress}
        color={color}
        hovered={isHovered}
      />
      <MenuItem3D
        item={item}
        position={position}
        visible={visible}
        isHovered={isHovered}
        isActive={isActive}
        color={color}
        onHover={onMenuHover}
        onClick={onMenuSelect}
      />
    </group>
  );
};

const HolographicHUD: React.FC<HolographicHUDProps> = ({
  coreState,
  physicsRef,
  onMenuSelect,
  onMenuHover,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const currentColor = MODE_COLORS[coreState.mode].emissive;
  
  useFrame((_state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += 0.03 * delta;
    
    if (physicsRef.current) {
      const p = physicsRef.current.position;
      groupRef.current.position.lerp(new THREE.Vector3(p[0], p[1], p[2]), 0.1);
    }
  });

  return (
    <group ref={groupRef}>
      {HUD_MENU_ITEMS.map((item, index) => {
        const x = Math.cos(item.angle) * 2.3;
        const y = Math.sin(item.angle) * 2.3;
        const z = 0;
        return (
          <HUDItemAnimated
            key={item.id}
            item={item}
            index={index}
            position={[x, y, z]}
            coreState={coreState}
            color={currentColor}
            onMenuSelect={onMenuSelect}
            onMenuHover={onMenuHover}
          />
        );
      })}
    </group>
  );
};

export default HolographicHUD;
