import React from "react";

interface WindClockProps {
  direction: number; // 0-359 degrees
  speed: number; // m/s
  onChange: (direction: number) => void;
  size?: number;
  className?: string;
}

export function WindClock({ 
  direction = 0, 
  speed = 0, 
  onChange, 
  size = 120,
  className = ""
}: WindClockProps) {
  const handleClick = (event: React.MouseEvent<SVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const x = event.clientX - centerX;
    const y = event.clientY - centerY;
    
    // Calculate angle (0° = North/Up, clockwise)
    let angle = Math.atan2(x, -y) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    
    onChange(Math.round(angle));
  };

  // Convert direction to radians for arrow positioning
  const radians = (direction * Math.PI) / 180;
  const arrowLength = size * 0.38; // Make arrow slightly longer
  const arrowX = Math.sin(radians) * arrowLength;
  const arrowY = -Math.cos(radians) * arrowLength;

  // Generate tick marks for major directions
  const majorTicks = [0, 45, 90, 135, 180, 225, 270, 315];
  const directionLabels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="cursor-pointer border rounded-full bg-card hover:bg-muted/50 transition-colors"
        onClick={handleClick}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 2}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="2"
        />
        
        {/* Inner circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.45}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2,2"
          opacity="0.3"
        />
        
        {/* Major direction ticks and labels */}
        {majorTicks.map((tickDir, index) => {
          const tickRadians = (tickDir * Math.PI) / 180;
          const innerRadius = size * 0.35;
          const outerRadius = size * 0.45;
          const labelRadius = size * 0.32;
          
          const x1 = size / 2 + Math.sin(tickRadians) * innerRadius;
          const y1 = size / 2 - Math.cos(tickRadians) * innerRadius;
          const x2 = size / 2 + Math.sin(tickRadians) * outerRadius;
          const y2 = size / 2 - Math.cos(tickRadians) * outerRadius;
          
          const labelX = size / 2 + Math.sin(tickRadians) * labelRadius;
          const labelY = size / 2 - Math.cos(tickRadians) * labelRadius;
          
          return (
            <g key={tickDir}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth="2"
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="central"
                className="text-xs font-medium fill-current"
              >
                {directionLabels[index]}
              </text>
            </g>
          );
        })}
        
        {/* Minor direction ticks */}
        {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((tickDir) => {
          const tickRadians = (tickDir * Math.PI) / 180;
          const innerRadius = size * 0.4;
          const outerRadius = size * 0.45;
          
          const x1 = size / 2 + Math.sin(tickRadians) * innerRadius;
          const y1 = size / 2 - Math.cos(tickRadians) * innerRadius;
          const x2 = size / 2 + Math.sin(tickRadians) * outerRadius;
          const y2 = size / 2 - Math.cos(tickRadians) * outerRadius;
          
          return (
            <line
              key={tickDir}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.5"
            />
          );
        })}
        
        {/* Center dot */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r="3"
          fill="currentColor"
        />
        
        {/* Wind arrow with background for visibility */}
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          {/* Background arrow for contrast */}
          <line
            x1="0"
            y1="0"
            x2={arrowX}
            y2={arrowY}
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.8"
          />
          {/* Main arrow */}
          <line
            x1="0"
            y1="0"
            x2={arrowX}
            y2={arrowY}
            stroke="#dc2626"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* Background arrow head for contrast */}
          <polygon
            points={`${arrowX},${arrowY} ${arrowX - 7 * Math.cos(radians - Math.PI/6)},${arrowY + 7 * Math.sin(radians - Math.PI/6)} ${arrowX - 7 * Math.cos(radians + Math.PI/6)},${arrowY + 7 * Math.sin(radians + Math.PI/6)}`}
            fill="white"
            opacity="0.8"
          />
          {/* Main arrow head */}
          <polygon
            points={`${arrowX},${arrowY} ${arrowX - 6 * Math.cos(radians - Math.PI/6)},${arrowY + 6 * Math.sin(radians - Math.PI/6)} ${arrowX - 6 * Math.cos(radians + Math.PI/6)},${arrowY + 6 * Math.sin(radians + Math.PI/6)}`}
            fill="#dc2626"
          />
        </g>
      </svg>
      
      <div className="mt-2 text-center">
        <div className="text-sm font-medium">
          {direction}° {speed.toFixed(1)} m/s
        </div>
        <div className="text-xs text-muted-foreground">
          {direction === 0 ? "Headwind" : 
           direction === 180 ? "Tailwind" :
           direction > 0 && direction < 180 ? "Right Wind" : "Left Wind"}
        </div>
      </div>
    </div>
  );
}
