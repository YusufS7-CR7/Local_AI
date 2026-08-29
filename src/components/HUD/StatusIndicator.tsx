import React from 'react';

interface StatusIndicatorProps {
  label: string;
  value: string;
  active?: boolean;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ label, value, active = false }) => {
  return (
    <div className="flex items-center space-x-2 font-mono text-xs uppercase text-[#00d4ff]">
      <span className="font-bold opacity-80">{label}:</span>
      <span className="opacity-100">{value}</span>
      <span
        className={`ml-1 text-[10px] ${
          active
            ? 'text-green-400 drop-shadow-[0_0_3px_rgba(74,222,128,0.8)] animate-[pulse-dot_2s_ease-in-out_infinite]'
            : 'text-gray-500'
        }`}
      >
        {active ? '●' : '○'}
      </span>
    </div>
  );
};
