import { useState, useRef, useEffect, useCallback } from 'react';
import { CoreState, CoreMode, OrbState } from '../types';
import { clamp } from '../utils/smoothing';

const MODE_ORDER: CoreMode[] = [
  'idle', 
  'listening', 
  'thinking', 
  'planning', 
  'executing', 
  'awaiting_confirmation', 
  'speaking', 
  'error'
];

export interface ExtendedOrbPhysics extends OrbState {
  targetMouseX: number;
  targetMouseY: number;
  isDragging: boolean;
  targetScale: number;
}

export function useOrbControls() {
  const [coreState, setCoreState] = useState<CoreState>({
    orb: { position: [0, 0, 0], scale: 1, rotationVelocity: [0, 0, 0] },
    mode: 'idle',
    menuOpen: false,
    activeMenuItem: null,
    hoveredMenuItem: null,
  });

  // Unified physics reference consumed directly by 3D render loop
  const physicsRef = useRef<ExtendedOrbPhysics>({
    position: [0, 0, 0],
    scale: 1,
    rotationVelocity: [0, 0, 0],
    targetMouseX: 0,
    targetMouseY: 0,
    isDragging: false,
    targetScale: 1,
  });

  const lastMousePos = useRef<{ x: number; y: number } | null>(null);

  // ── Mouse events ──────────────────────────────
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -(e.clientY / window.innerHeight) * 2 + 1;
      
      physicsRef.current.targetMouseX = nx;
      physicsRef.current.targetMouseY = ny;

      if (physicsRef.current.isDragging && lastMousePos.current) {
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        
        // Snappy, direct rotation response during drag
        physicsRef.current.rotationVelocity[0] += dy * 0.008;
        physicsRef.current.rotationVelocity[1] += dx * 0.008;
      }
      
      if (physicsRef.current.isDragging) {
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Only drag if not clicking UI buttons
      if ((e.target as HTMLElement)?.closest('button, input, form')) return;
      
      physicsRef.current.isDragging = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      physicsRef.current.isDragging = false;
      lastMousePos.current = null;
    };

    const handleWheel = (e: WheelEvent) => {
      physicsRef.current.targetScale = clamp(
        physicsRef.current.targetScale - e.deltaY * 0.001, 
        0.6, 
        2.0
      );
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // ── Keyboard shortcuts (1-8 for modes, Space for menu) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      if (e.key >= '1' && e.key <= '8') {
        const idx = parseInt(e.key) - 1;
        const mode = MODE_ORDER[idx];
        if (mode) setCoreMode(mode);
      }
      if (e.key === ' ') {
        e.preventDefault();
        setCoreState(prev => ({
          ...prev,
          menuOpen: !prev.menuOpen,
          activeMenuItem: !prev.menuOpen ? null : prev.activeMenuItem,
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Set Core Mode ──
  const setCoreMode = useCallback((mode: CoreMode) => {
    setCoreState(prev => ({ ...prev, mode }));
  }, []);

  // ── Callbacks ──
  const onOrbClick = useCallback(() => {
    setCoreState(prev => ({
      ...prev,
      menuOpen: !prev.menuOpen,
      activeMenuItem: !prev.menuOpen ? null : prev.activeMenuItem,
    }));
  }, []);

  const onMenuSelect = useCallback((id: string) => {
    setCoreState(prev => ({
      ...prev,
      activeMenuItem: id,
      menuOpen: false,
    }));
    setCoreMode('executing');
    setTimeout(() => setCoreMode('idle'), 2000);
  }, [setCoreMode]);

  const onMenuHover = useCallback((id: string | null) => {
    setCoreState(prev => ({ ...prev, hoveredMenuItem: id }));
  }, []);

  return { 
    coreState, 
    physicsRef: physicsRef as unknown as React.MutableRefObject<OrbState>, 
    setCoreMode, 
    onOrbClick, 
    onMenuSelect, 
    onMenuHover 
  };
}
