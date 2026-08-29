import React from 'react';
import { Canvas } from '@react-three/fiber';
import AIOrb from '../AIOrb';
import HolographicHUD from '../HolographicHUD';
import { useOrbControls } from '../../hooks/useOrbControls';

export interface Scene3DProps {
  controls: ReturnType<typeof useOrbControls>;
}

export const Scene3D: React.FC<Scene3DProps> = ({ controls }) => {
  const { coreState, physicsRef, onOrbClick, onMenuSelect, onMenuHover } = controls;

  return (
    <div className="absolute inset-0 z-10">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        dpr={1.0}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: 'default',
          stencil: false,
          depth: true,
        }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.35} />
        <pointLight position={[6, 6, 6]} intensity={0.5} color="#00d4ff" />
        <pointLight position={[-6, -6, -4]} intensity={0.3} color="#8b5cf6" />
        
        {/* Central 3D AI Orb */}
        <AIOrb coreState={coreState} physicsRef={physicsRef} onOrbClick={onOrbClick} />
        
        {/* 3D Holographic Menu */}
        <HolographicHUD 
          coreState={coreState} 
          physicsRef={physicsRef}
          onMenuSelect={onMenuSelect}
          onMenuHover={onMenuHover}
        />
      </Canvas>
    </div>
  );
};

export default Scene3D;
