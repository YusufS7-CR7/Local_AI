import React from 'react';

interface BackgroundProps {
  imageUrl?: string;
}

export const Background: React.FC<BackgroundProps> = ({ imageUrl }) => {
  return (
    <div className="fixed inset-0 z-0 bg-black pointer-events-none">
      {imageUrl ? (
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#0a192f_0%,_#000000_100%)]" />
      )}
      
      {/* Subtle tech grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 212, 255, 1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 212, 255, 1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />
    </div>
  );
};
