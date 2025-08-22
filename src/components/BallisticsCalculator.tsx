// src/components/BallisticsCalc.tsx
import React, { useEffect, useMemo, useState } from "react";
import { solveNoDragExtended, solveDragExtended } from "../utils/ballistics";

// TODO: Add unit conversion support (metric/imperial)
// TODO: Implement ballistics table/chart generation  
// TODO: Add wind drift calculations (COMPLETED)
// TODO: Support for different projectile types (match, hunting, etc.)
// TODO: Add scope height adjustment calculations
// TODO: Implement trajectory plotting/visualization
// TODO: Add preset configurations for common cartridges
// TODO: Support for G7 drag model (COMPLETED)
// TODO: Add Coriolis effect calculations
// TODO: Implement data export (CSV, PDF)

type Model = "G1" | "G7" | "noDrag";
type WeightUnit = "grains" | "grams";
type WeatherMode = "standard" | "manual";

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm">{children}</span>
);

// Wind direction clock face component
function WindDirectionSelector({ 
  value, 
  onChange, 
  label 
}: { 
  value: number; 
  onChange: (deg: number) => void; 
  label: string;
}) {
  const clockPositions = [
    { deg: 0, label: "12", x: 50, y: 10 },
    { deg: 30, label: "1", x: 75, y: 15 },
    { deg: 60, label: "2", x: 85, y: 35 },
    { deg: 90, label: "3", x: 90, y: 50 },
    { deg: 120, label: "4", x: 85, y: 65 },
    { deg: 150, label: "5", x: 75, y: 85 },
    { deg: 180, label: "6", x: 50, y: 90 },
    { deg: 210, label: "7", x: 25, y: 85 },
    { deg: 240, label: "8", x: 15, y: 65 },
    { deg: 270, label: "9", x: 10, y: 50 },
    { deg: 300, label: "10", x: 15, y: 35 },
    { deg: 330, label: "11", x: 25, y: 15 },
  ];

  const nearestPosition = clockPositions.reduce((prev, curr) => 
    Math.abs(curr.deg - value) < Math.abs(prev.deg - value) ? curr : prev
  );

  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="relative">
        <svg width="100" height="100" className="border rounded-full bg-white">
          {/* Clock face */}
          <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="2" />
          
          {/* Clock positions */}
          {clockPositions.map((pos) => (
            <g key={pos.deg}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r="8"
                fill={pos.deg === nearestPosition.deg ? "#3b82f6" : "#f3f4f6"}
                stroke="#d1d5db"
                strokeWidth="1"
                className="cursor-pointer hover:fill-blue-200"
                onClick={() => onChange(pos.deg)}
              />
              <text
                x={pos.x}
                y={pos.y + 3}
                textAnchor="middle"
                className="text-xs font-medium pointer-events-none select-none"
                fill={pos.deg === nearestPosition.deg ? "white" : "#374151"}
              >
                {pos.label}
              </text>
            </g>
          ))}
          
          {/* Wind arrow */}
          <line
            x1="50"
            y1="50"
            x2={50 + 30 * Math.sin((value * Math.PI) / 180)}
            y2={50 - 30 * Math.cos((value * Math.PI) / 180)}
            stroke="#ef4444"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
          />
          
          {/* Arrow marker */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
            </marker>
          </defs>
        </svg>
        <div className="text-xs text-center mt-1">
          {value}° ({nearestPosition.label} o'clock)
        </div>
      </div>
    </div>
  );
}

// TODO: Add input validation and range checking
// TODO: Implement debounced input updates
// TODO: Add unit display and conversion
function NumberInput({
  label, value, onChange, step = "any", disabled = false,
}: { label: string; value: number; onChange: (n: number) => void; step?: string; disabled?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      <input
        type="number"
        className="px-2 py-1 rounded border disabled:bg-gray-50 disabled:text-gray-500"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        disabled={disabled}
      />
    </label>
  );
}

// Weight input with unit selection
function WeightInput({
  label, value, onChange, unit, onUnitChange
}: { 
  label: string; 
  value: number; 
  onChange: (n: number) => void; 
  unit: WeightUnit;
  onUnitChange: (unit: WeightUnit) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input
          type="number"
          className="px-2 py-1 rounded border flex-1"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          step="0.1"
        />
        <div className="flex rounded border overflow-hidden">
          <button
            type="button"
            className={`px-2 py-1 text-xs ${unit === 'grains' ? 'bg-primary text-primary-foreground' : 'bg-gray-100'}`}
            onClick={() => onUnitChange('grains')}
          >
            gr
          </button>
          <button
            type="button"
            className={`px-2 py-1 text-xs ${unit === 'grams' ? 'bg-primary text-primary-foreground' : 'bg-gray-100'}`}
            onClick={() => onUnitChange('grams')}
          >
            g
          </button>
        </div>
      </div>
    </div>
  );
}

// TODO: Add color coding for different result types
// TODO: Implement copy-to-clipboard functionality
// TODO: Add unit suffixes and formatting options
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between bg-white rounded px-2 py-1 border">
      <span>{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}

// Helper function to get standard atmospheric conditions
function getStandardConditions() {
  // Standard ICAO atmospheric conditions at sea level
  const standardTemp = 15; // °C
  const standardPressure = 101325; // Pa
  const standardHumidity = 0; // %
  
  const rho = calculateAirDensity(standardPressure / 100, standardTemp, standardHumidity);
  
  return {
    temperatureC: standardTemp,
    rhPercent: standardHumidity,
    pressurePa: standardPressure,
    rho,
    stationName: 'Standard Conditions (ICAO)',
    time: new Date().toISOString(),
  };
}

// Calculate air density from atmospheric conditions
function calculateAirDensity(pressureHpa: number, tempC: number, humidityPercent: number): number {
  const RD = 287.058;   // J/(kg·K), dry air specific gas constant
  const RV = 461.495;   // J/(kg·K), water vapor specific gas constant
  
  // Convert pressure to Pa
  const pressurePa = pressureHpa * 100;
  
  // Magnus-Tetens saturation vapor pressure over water (hPa)
  const es_hPa = 6.112 * Math.exp((17.62 * tempC) / (243.12 + tempC));
  const e_hPa  = (Math.max(0, Math.min(100, humidityPercent)) / 100) * es_hPa;
  const e_Pa   = e_hPa * 100;
  const T      = (tempC + 273.15);
  const pd     = Math.max(0, pressurePa - e_Pa);
  const rho    = pd / (RD * T) + e_Pa / (RV * T);
  return rho;
}

// TODO: Add dark mode support
// TODO: Implement responsive design improvements
// TODO: Add accessibility features (ARIA labels, keyboard navigation)
export function BallisticsCalculator() {
  // TODO: Add input persistence to localStorage
  // TODO: Implement input validation with error states
  // Basic trajectory inputs
  const [V0, setV0] = useState(800);
  const [elevationDeg, setElevationDeg] = useState(0); // Start with 0 elevation since we now have zero distance
  const [X, setX] = useState(300);
  const [hob, setHob] = useState(3.8); // Height over bore in centimeters (typical scope height)
  const [zeroDistance, setZeroDistance] = useState(100); // Zero distance in meters
  
  // Bullet parameters
  const [bulletWeight, setBulletWeight] = useState(175); // Default in grains
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("grains");
  const [bulletDiameter, setBulletDiameter] = useState(7.62); // Bullet diameter in mm
  
  // Fixed gravity constant - no need for user input
  const g = 9.81;

  const [BC, setBC] = useState(0.45);
  const [model, setModel] = useState<Model>("G1");

  // Air density - always calculated from weather data or standard conditions
  const [rho, setRho] = useState(1.225); // Standard air density at sea level, 15°C
  
  // Wind parameters - single source of truth for wind
  const [windSpeedMs, setWindSpeedMs] = useState(0);
  const [windDirectionDeg, setWindDirectionDeg] = useState(0);
  
  // Weather mode and manual inputs
  const [weatherMode, setWeatherMode] = useState<WeatherMode>("standard");
  const [manualTemp, setManualTemp] = useState(15); // °C
  const [manualPressure, setManualPressure] = useState(1013); // hPa
  const [manualHumidity, setManualHumidity] = useState(50); // %
  
  // Weather metadata for display
  const [wxMeta, setWxMeta] = useState<{ 
    station?: string; 
    time?: string; 
    t?: number; 
    rh?: number; 
    pPa?: number; 
    rho?: number;
    source?: string;
  } | null>(null);

  // Convert bullet weight to grams
  const bulletMassGrams = useMemo(() => {
    return weightUnit === "grains" ? bulletWeight * 0.06479891 : bulletWeight;
  }, [bulletWeight, weightUnit]);

  // Function to use standard atmospheric conditions
  const useStandardConditions = () => {
    setWeatherMode("standard");
    const standardWeather = getStandardConditions();
    
    setRho(Number(standardWeather.rho.toFixed(5)));
    setWxMeta({ 
      t: standardWeather.temperatureC, 
      rh: standardWeather.rhPercent, 
      pPa: standardWeather.pressurePa, 
      rho: standardWeather.rho,
      station: standardWeather.stationName,
      time: standardWeather.time,
      source: "standard"
    });
  };

  // Function to use manual weather input
  const useManualConditions = () => {
    setWeatherMode("manual");
    
    const manualRho = calculateAirDensity(manualPressure, manualTemp, manualHumidity);
    
    setRho(Number(manualRho.toFixed(5)));
    setWxMeta({ 
      t: manualTemp, 
      rh: manualHumidity, 
      pPa: manualPressure * 100, 
      rho: manualRho,
      station: "Manual Input",
      time: new Date().toISOString(),
      source: "manual"
    });
  };

  // Update air density when manual values change
  useEffect(() => {
    if (weatherMode === "manual") {
      useManualConditions();
    }
  }, [manualTemp, manualPressure, manualHumidity, weatherMode]);

  // Initialize with standard conditions on first load
  useEffect(() => {
    useStandardConditions();
  }, []);

  // TODO: Add memoization optimization
  // TODO: Include error handling for edge cases
  // TODO: Add intermediate calculation steps for debugging
  const res = useMemo(() => {
    // Convert height over bore from centimeters to meters for calculations
    const hobMeters = hob / 100;
    
    // Create base parameters using new interface
    const baseParams = { 
      V0, 
      elevationDeg, 
      X, 
      g, 
      hob: hobMeters, 
      zeroDistance,
      windSpeedMs, 
      windDirectionDeg 
    };
    
    if (model === "noDrag") {
      return solveNoDragExtended(baseParams);
    }
    
    // Use the unified drag calculation function with model selection
    return solveDragExtended({ 
      ...baseParams, 
      rho, 
      BC,
      bulletMassGrams,
      bulletDiameterMm: bulletDiameter,
      dragModel: model as 'G1' | 'G7'
    });
  }, [V0, elevationDeg, X, g, hob, zeroDistance, rho, BC, model, bulletMassGrams, bulletDiameter, windSpeedMs, windDirectionDeg]);

  // TODO: Add configurable precision settings
  // TODO: Implement scientific notation for very small/large values
  const fmt = (n: number) => (isFinite(n) ? n.toFixed(4) : "—");

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Ballistics Calculator</h1>

      {/* Basic trajectory parameters */}
      <section className="p-3 rounded-lg border">
        <h3 className="font-medium mb-3">Trajectory Parameters</h3>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Muzzle velocity (m/s)" value={V0} onChange={setV0} />
          <NumberInput label="Target distance (m)" value={X} onChange={setX} />
          <NumberInput label="Zero distance (m)" value={zeroDistance} onChange={setZeroDistance} />
          <NumberInput label="Height over bore (cm)" value={hob} onChange={setHob} />
        </div>
        <div className="mt-3">
          <NumberInput label="Elevation adjustment (deg)" value={elevationDeg} onChange={setElevationDeg} />
          <p className="text-xs text-muted-foreground mt-1">
            Additional elevation beyond what's needed for zero distance (typically 0° for normal shooting)
          </p>
        </div>
      </section>

      {/* Bullet parameters */}
      <section className="p-3 rounded-lg border">
        <h3 className="font-medium mb-3">Bullet Parameters</h3>
        <div className="grid grid-cols-2 gap-3">
          <WeightInput 
            label="Bullet weight" 
            value={bulletWeight} 
            onChange={setBulletWeight}
            unit={weightUnit}
            onUnitChange={setWeightUnit}
          />
          <NumberInput 
            label="Bullet diameter (mm)" 
            value={bulletDiameter} 
            onChange={setBulletDiameter} 
          />
        </div>
        <div className="mt-3 pt-3 border-t">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Bullet mass (calculated)</span>
            <span className="font-mono">{bulletMassGrams.toFixed(3)} g</span>
          </div>
        </div>
      </section>

      {/* TODO: Add tooltips explaining ballistics concepts */}
      {/* Drag model controls - always visible for better UX */}
      <section className="p-3 rounded-lg border">
        <h3 className="font-medium mb-3">Drag Model</h3>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput 
            label={`Ballistic Coefficient BC (${model === 'G7' ? 'G7' : model === 'G1' ? 'G1' : 'N/A'})`} 
            value={BC} 
            onChange={setBC} 
          />
          <div className="flex items-center gap-3">
            <Label>Model</Label>
            <select
              className="px-2 py-1 rounded border"
              value={model}
              onChange={(e) => setModel(e.target.value as Model)}
            >
              <option value="G1">G1 (standard projectile)</option>
              <option value="G7">G7 (boat-tail match)</option>
              <option value="noDrag">No drag (basic)</option>
            </select>
          </div>
        </div>
        
        {/* Drag model information */}
        {model !== "noDrag" && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-muted-foreground space-y-1">
              {model === "G1" && (
                <div>G1 Standard: Best for flat-base bullets, hunting ammunition, and most commercial projectiles</div>
              )}
              {model === "G7" && (
                <div>G7 Standard: Best for boat-tail match bullets, long-range precision ammunition, and modern match projectiles</div>
              )}
            </div>
          </div>
        )}
        
        {/* Air density display - calculated from weather or standard conditions */}
        <div className="mt-3 pt-3 border-t">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Air density ρ (calculated)</span>
            <span className="font-mono">{rho.toFixed(5)} kg/m³</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {wxMeta ? 
              `From ${weatherMode}: ${wxMeta.t?.toFixed(1)}°C, ${((wxMeta.pPa ?? 0) / 100).toFixed(0)} hPa, ${wxMeta.rh?.toFixed(0)}% RH` :
              "Standard conditions: 15°C, 1013 hPa, 0% RH"
            }
          </p>
        </div>
      </section>

      {/* Wind parameters section */}
      <section className="p-3 rounded-lg border">
        <h3 className="font-medium mb-3">Wind</h3>
        <div className="grid grid-cols-2 gap-3">
          <WindDirectionSelector 
            label="Wind direction" 
            value={windDirectionDeg} 
            onChange={setWindDirectionDeg} 
          />
          <NumberInput 
            label="Wind speed (m/s)" 
            value={windSpeedMs} 
            onChange={setWindSpeedMs}
          />
        </div>
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground">
            Wind direction: 0° = 12 o'clock (North), 90° = 3 o'clock (East), etc.
          </p>
        </div>
      </section>

      {/* Weather information section - simplified to manual/standard only */}
      <section className="p-3 rounded-lg border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Atmospheric Conditions</h3>
          <div className="flex gap-2">
            <button
              onClick={useStandardConditions}
              className={`px-3 py-1 rounded text-sm hover:bg-secondary/80 ${
                weatherMode === "standard" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              Standard
            </button>
            <button
              onClick={() => setWeatherMode("manual")}
              className={`px-3 py-1 rounded text-sm hover:bg-secondary/80 ${
                weatherMode === "manual" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              Manual
            </button>
          </div>
        </div>

        {/* Manual weather input section */}
        {weatherMode === "manual" && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
            <h4 className="font-medium mb-3 text-sm">Manual Atmospheric Input</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput 
                label="Temperature (°C)" 
                value={manualTemp} 
                onChange={setManualTemp}
                step="0.1"
              />
              <NumberInput 
                label="Air Pressure (hPa)" 
                value={manualPressure} 
                onChange={setManualPressure}
                step="0.1"
              />
              <NumberInput 
                label="Humidity (%)" 
                value={manualHumidity} 
                onChange={setManualHumidity}
                step="1"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Air density is automatically calculated from temperature, pressure, and humidity.
            </p>
          </div>
        )}
        
        {wxMeta && (
          <div className="space-y-3">
            {/* Key weather parameters */}
            <div className="grid grid-cols-3 gap-2 text-sm">
              <KV k="Temperature" v={`${wxMeta.t?.toFixed(1) || "—"}°C`} />
              <KV k="Air Pressure" v={`${((wxMeta.pPa ?? 0) / 100).toFixed(0)} hPa`} />
              <KV k="Humidity" v={`${wxMeta.rh?.toFixed(0) || "—"}% RH`} />
            </div>
            
            {/* Additional details */}
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              <div>Source: <span className="font-medium">{wxMeta.station || "—"}</span></div>
              <div>Air Density: <span className="font-mono">{wxMeta.rho?.toFixed(5)} kg/m³</span></div>
              <div className="pt-1">
                <span className={`px-2 py-1 rounded text-xs ${
                  weatherMode === "standard" 
                    ? "bg-gray-100 text-gray-700" 
                    : "bg-blue-100 text-blue-700"
                }`}>
                  {weatherMode === "standard" 
                    ? "Using Standard Conditions" 
                    : "Using Manual Input"}
                </span>
              </div>
            </div>
          </div>
        )}
        
        <p className="text-xs text-muted-foreground mt-2">
          Air density is calculated from atmospheric conditions using the ideal gas law and Magnus-Tetens formula.
          Standard conditions: 15°C, 1013 hPa, 0% relative humidity (ICAO sea level).
        </p>
      </section>

      {/* TODO: Add trajectory visualization chart */}
      {/* TODO: Include energy calculations display */}
      {/* TODO: Add range card generation */}
      {/* TODO: Implement result comparison with previous calculations */}
      <section className="p-3 rounded-lg bg-gray-50 border">
        <h2 className="font-medium mb-2">Results</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <KV k="Time of flight (s)" v={fmt(res.t)} />
          <KV k="Impact velocity (m/s)" v={fmt(res.vImpact)} />
          <KV k="Drop from zero (m)" v={fmt(res.drop)} />
          <KV k="Adjusted drop (m)" v={fmt(res.adjustedDrop || res.drop)} />
          <KV k="Hold (mil)" v={fmt(res.mil)} />
          <KV k="Hold (MOA)" v={fmt(res.moa)} />
          <KV k="Wind drift (m)" v={fmt(res.windDrift || 0)} />
          <KV k="Wind hold (mil)" v={fmt(res.windDriftMil || 0)} />
          <KV k="Wind hold (MOA)" v={fmt(res.windDriftMoa || 0)} />
        </div>
        <div className="mt-3 pt-3 border-t text-xs text-gray-500 space-y-1">
          <div>Zero: {zeroDistance}m • Bullet: {bulletMassGrams.toFixed(1)}g, {bulletDiameter}mm • Model: {model}</div>
          <div>Conditions: {weatherMode} • Wind: {windSpeedMs}m/s @ {windDirectionDeg}° • Using gravity: 9.81 m/s² • Full industry-standard {model === 'noDrag' ? 'no-drag' : `${model} drag coefficient`} tables for maximum accuracy.</div>
        </div>
      </section>

      {/* Sanity check information for verification */}
      <section className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
        <h3 className="font-medium mb-2 text-sm">Sanity Check Reference</h3>
        <div className="text-xs text-yellow-800 space-y-1">
          <div><strong>No Drag, HOB=0:</strong></div>
          <div>• V₀=800 m/s, X=300 m, elevation=0° → TOF ≈ 0.375 s, drop ≈ −0.690 m (~−2.30 mil)</div>
          <div>• V₀=800 m/s, X=300 m → elevation for zero ≈ 0.132° (not 2°!)</div>
          <div>• V₀=800 m/s, X=300 m, elevation=2° → drop ≈ +9.79 m (~+32.6 mil)</div>
          <div className="mt-2">
            <strong>Current calculation:</strong> {model === "noDrag" ? "✓ Using no-drag model" : `Using ${model} drag model`}
          </div>
        </div>
      </section>
    </div>
  );
}
