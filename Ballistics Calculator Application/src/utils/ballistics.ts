/**
 * Calculate air density from temperature and humidity
 * Uses the ideal gas law with corrections for water vapor
 * 
 * @param tempC Temperature in Celsius
 * @param humidity Relative humidity as percentage (0-100)
 * @param pressurePa Pressure in Pascals (default: standard atmosphere)
 * @returns Air density in kg/m³
 */
export function calculateAirDensity(
  tempC: number, 
  humidity: number, 
  pressurePa: number = 101325
): number {
  // Convert temperature to Kelvin
  const tempK = tempC + 273.15;
  
  // Saturation vapor pressure (Tetens formula)
  const satVaporPressure = 610.78 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  
  // Actual vapor pressure
  const vaporPressure = (humidity / 100) * satVaporPressure;
  
  // Partial pressure of dry air
  const dryAirPressure = pressurePa - vaporPressure;
  
  // Gas constants
  const R_dry = 287.058; // J/(kg·K) for dry air
  const R_vapor = 461.495; // J/(kg·K) for water vapor
  
  // Calculate density using ideal gas law
  const dryAirDensity = dryAirPressure / (R_dry * tempK);
  const vaporDensity = vaporPressure / (R_vapor * tempK);
  
  return dryAirDensity + vaporDensity;
}

/**
 * Calculate wind effects on projectile trajectory
 * Simplified model for crosswind drift
 * 
 * @param windSpeed Wind speed in m/s
 * @param windDirection Wind direction in degrees (0 = headwind, 90 = right crosswind)
 * @param tof Time of flight in seconds
 * @param velocity Average velocity during flight
 * @returns Wind drift in meters (positive = right drift)
 */
export function calculateWindDrift(
  windSpeed: number,
  windDirection: number,
  tof: number,
  velocity: number
): number {
  // Convert wind direction to radians
  const windRadians = (windDirection * Math.PI) / 180;
  
  // Calculate crosswind component (perpendicular to flight path)
  const crosswind = windSpeed * Math.sin(windRadians);
  
  // Simplified wind drift calculation
  // This is a basic approximation - real ballistics would use more complex models
  const windDrift = (crosswind * tof * tof) / (2 * velocity) * 100; // Scale factor for realistic drift
  
  return windDrift;
}

/**
 * Calculate headwind/tailwind effect on velocity
 * 
 * @param windSpeed Wind speed in m/s
 * @param windDirection Wind direction in degrees (0 = headwind, 180 = tailwind)
 * @returns Velocity adjustment factor (multiply by initial velocity)
 */
export function calculateWindVelocityEffect(
  windSpeed: number,
  windDirection: number
): number {
  // Convert wind direction to radians
  const windRadians = (windDirection * Math.PI) / 180;
  
  // Calculate headwind component (parallel to flight path)
  const headwind = windSpeed * Math.cos(windRadians);
  
  // Simple velocity adjustment (headwind reduces effective velocity, tailwind increases it)
  // This is a simplified model - real effects are more complex
  return 1 - (headwind * 0.001); // Small adjustment factor
}

/**
 * Standard atmospheric conditions
 */
export const STANDARD_CONDITIONS = {
  temperature: 15, // °C
  humidity: 0, // %
  pressure: 101325, // Pa
};

/**
 * Convert height over bore from cm to meters for calculations
 */
export function heightOverBoreCmToM(heightCm: number): number {
  return heightCm / 100;
}

/**
 * Convert height over bore from meters to cm for display
 */
export function heightOverBoreMToCm(heightM: number): number {
  return heightM * 100;
}