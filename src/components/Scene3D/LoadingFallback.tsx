import React from 'react';

export const LoadingFallback: React.FC = () => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-20">
      {/* Outer spinning ring */}
      <div className="relative w-32 h-32 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-[#00d4ff]/30 animate-spin [animation-duration:8s]" />
        <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-[#00e5ff] border-b-[#00e5ff] animate-spin [animation-duration:3s]" />
        <div className="absolute inset-6 rounded-full border border-dashed border-[#8b5cf6]/60 animate-spin [animation-direction:reverse] [animation-duration:5s]" />
        
        {/* Core glowing dot */}
        <div className="w-4 h-4 rounded-full bg-[#00d4ff] animate-ping opacity-75" />
        <div className="absolute w-3 h-3 rounded-full bg-[#00e5ff] shadow-[0_0_15px_#00e5ff]" />
      </div>

      {/* Futuristic status label */}
      <div className="mt-6 flex flex-col items-center space-y-1 font-mono uppercase">
        <div className="text-xs text-[#00d4ff] font-bold tracking-[0.25em] animate-pulse">
          INITIALIZING HOLOGRAPHIC CORE...
        </div>
        <div className="text-[10px] text-[#00d4ff]/60 tracking-[0.15em]">
          LOADING 3D SHADERS & MESHES
        </div>
      </div>
    </div>
  );
};

export default LoadingFallback;
