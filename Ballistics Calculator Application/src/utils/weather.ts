// src/utils/weather.ts
// Atmospheric conditions calculation utilities
// Provides standard ICAO conditions and air density calculations

export type WeatherResult = {
  temperatureC: number;
  rhPercent: number;
  pressurePa: number;
  rho: number;
  stationName?: string;
  obsTime?: string;
};

// Air density calculation constants
const RD = 287.058;   // J/(kg·K), dry air specific gas constant
const RV = 461.495;   // J/(kg·K), water vapor specific gas constant

// Calculate air density from atmospheric conditions using ideal gas law
export function computeAirDensity(pressurePa: number, temperatureC: number, rhPercent: number): number {
  // Magnus-Tetens saturation vapor pressure over water (hPa)
  const es_hPa = 6.112 * Math.exp((17.62 * temperatureC) / (243.12 + temperatureC));
  const e_hPa  = (Math.max(0, Math.min(100, rhPercent)) / 100) * es_hPa;
  const e_Pa   = e_hPa * 100;
  const T      = (temperatureC + 273.15);
  const pd     = Math.max(0, pressurePa - e_Pa);
  const rho    = pd / (RD * T) + e_Pa / (RV * T);
  return rho;
}

// Get standard ICAO atmospheric conditions at sea level
export function getStandardConditions(): WeatherResult {
  // Standard ICAO atmospheric conditions at sea level
  const standardTemp = 15; // °C
  const standardPressure = 101325; // Pa
  const standardHumidity = 0; // %
  
  const rho = computeAirDensity(standardPressure, standardTemp, standardHumidity);
  
  return {
    temperatureC: standardTemp,
    rhPercent: standardHumidity,
    pressurePa: standardPressure,
    rho,
    stationName: 'Standard Conditions (ICAO)',
    obsTime: new Date().toISOString(),
  };
}