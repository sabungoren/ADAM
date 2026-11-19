import React, { useEffect, useState } from 'react';
import { RobotStatus } from '../types';
import { Navigation, AlertCircle } from 'lucide-react';

interface FleetRobotMarkerProps {
  currentPos: { x: number; y: number };
  nextPos?: { x: number; y: number } | null;
  status: RobotStatus;
  currentNode: string;
  nextNode?: string;
}

export const FleetRobotMarker: React.FC<FleetRobotMarkerProps> = ({
  currentPos,
  nextPos,
  status,
  currentNode,
  nextNode,
}) => {
  const [animProgress, setAnimProgress] = useState(0);

  // Smooth interpolation along the horizontal/vertical line
  useEffect(() => {
    if (status === 'MOVING' && nextPos) {
      setAnimProgress(0);
      const interval = setInterval(() => {
        setAnimProgress(prev => {
          if (prev >= 1) return 1;
          return Math.min(1, prev + 0.04);
        });
      }, 80);
      return () => clearInterval(interval);
    } else {
      setAnimProgress(0);
    }
  }, [status, nextPos, currentNode, nextNode]);

  let x = currentPos.x;
  let y = currentPos.y;

  if (status === 'MOVING' && nextPos) {
    x = currentPos.x + (nextPos.x - currentPos.x) * animProgress;
    y = currentPos.y + (nextPos.y - currentPos.y) * animProgress;
  }

  return (
    <div
      style={{
        transform: `translate(${x - 22}px, ${y - 22}px)`,
        transition: status === 'MOVING' ? 'none' : 'transform 0.4s ease-out',
      }}
      className="absolute pointer-events-none z-30 select-none"
    >
      {/* Outer beacon pulse */}
      {status === 'MOVING' && (
        <span className="absolute inset-0 rounded-full bg-cyan-400/30 animate-ping" />
      )}
      {status === 'DWELL' && (
        <span className="absolute inset-0 rounded-full bg-amber-400/30 animate-pulse" />
      )}

      {/* Main Circular AMR Armada Beacon */}
      <div
        className={`relative w-11 h-11 rounded-full flex flex-col items-center justify-center border-2 shadow-xl ${
          status === 'ERROR'
            ? 'bg-rose-950 border-rose-500 text-rose-300 shadow-rose-500/40'
            : status === 'DWELL'
            ? 'bg-amber-950 border-amber-400 text-amber-300 shadow-amber-500/40'
            : status === 'MOVING'
            ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-cyan-500/50'
            : 'bg-dark-900 border-emerald-400 text-emerald-300 shadow-emerald-500/30'
        }`}
      >
        {status === 'ERROR' ? (
          <AlertCircle className="w-5 h-5 text-rose-400" />
        ) : (
          <Navigation className="w-5 h-5 fill-current" />
        )}

        {/* Small floating label */}
        <div className="absolute -bottom-5 bg-dark-950 border border-dark-700 px-1.5 py-0.5 rounded text-[9px] font-bold text-gray-200 whitespace-nowrap shadow">
          {status === 'MOVING' && nextNode ? `Menuju ${nextNode}` : `Node ${currentNode}`}
        </div>
      </div>
    </div>
  );
};
