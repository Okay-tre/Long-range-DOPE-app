// src/utils/fmi.ts
// Fetch latest FMI observations near lat/lon and compute air density ρ (kg/m^3).
// Uses WFS stored query: fmi::observations::weather::simple
// Returns: temperatureC, rhPercent, pressurePa, rho, stationName, obsTime

// TODO: Add caching mechanism to reduce API calls
// TODO: Implement retry logic with exponential backoff
// TODO: Add support for forecast data in addition to observations
// TODO: Include additional atmospheric parameters (wind speed, direction)
// TODO: Add validation for coordinate bounds (ensure lat/lon are valid)

export type FMIResult = {
  temperatureC: number;
  rhPercent: number;
  pressurePa: number;
  rho: number;
  windSpeedMs?: number;
  windDirectionDeg?: number;
  stationName?: string;
  obsTime?: string;
};

// TODO: Consider adding support for different gas constants for different altitudes
const RD = 287.058;   // J/(kg·K), dry air specific gas constant
const RV = 461.495;   // J/(kg·K), water vapor specific gas constant

// TODO: Add input validation for text parsing
function toNumber(t: string | null | undefined): number | undefined {
  if (!t) return undefined;
  const n = Number(t);
  return isFinite(n) ? n : undefined;
}

// TODO: Add altitude correction for pressure
// TODO: Implement more sophisticated humidity models
// TODO: Add temperature range validation
function computeRho(pressurePa: number, temperatureC: number, rhPercent: number): number {
  // Magnus-Tetens saturation vapor pressure over water (hPa)
  const es_hPa = 6.112 * Math.exp((17.62 * temperatureC) / (243.12 + temperatureC));
  const e_hPa  = (Math.max(0, Math.min(100, rhPercent)) / 100) * es_hPa;
  const e_Pa   = e_hPa * 100;
  const T      = (temperatureC + 273.15);
  const pd     = Math.max(0, pressurePa - e_Pa);
  const rho    = pd / (RD * T) + e_Pa / (RV * T);
  return rho;
}

// Try the simple observations query first
async function tryFMISimpleQuery(lat: number, lon: number): Promise<FMIResult> {
  const base = "https://opendata.fmi.fi/wfs";
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "getFeature",
    storedquery_id: "fmi::observations::weather::simple",
    latlon: `${lat.toFixed(6)},${lon.toFixed(6)}`,
    maxlocations: "1",
  });

  // Get recent observations (last 3 hours)
  const now = new Date();
  const start = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  params.append("starttime", start.toISOString());
  params.append("endtime", now.toISOString());

  const url = `${base}?${params.toString()}`;
  console.log('FMI Simple API URL:', url);
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMI simple request failed: ${res.status} ${res.statusText}`);

  const xml = await res.text();
  console.log('FMI XML response (first 500 chars):', xml.substring(0, 500));
  
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  // Check for parsing errors
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    throw new Error(`XML parsing error: ${parseError.textContent}`);
  }

  // Check for WFS exceptions
  const exceptions = doc.getElementsByTagNameNS("*", "ExceptionText");
  if (exceptions.length > 0) {
    throw new Error(`FMI service error: ${exceptions[0].textContent}`);
  }

  // Parse the simple format response
  const members = Array.from(doc.getElementsByTagNameNS("*", "member"));
  console.log('Found members:', members.length);

  if (members.length === 0) {
    throw new Error("No weather observations found for this location");
  }

  // Get the most recent observation
  let latestTime = "";
  let bestMember = null;
  let stationName = "";

  for (const member of members) {
    const timeElement = member.getElementsByTagNameNS("*", "time")[0];
    const time = timeElement?.textContent || "";
    
    if (!latestTime || time > latestTime) {
      latestTime = time;
      bestMember = member;
    }
  }

  if (!bestMember) {
    throw new Error("No valid weather observations found");
  }

  // Extract station name
  const nameElement = bestMember.getElementsByTagNameNS("*", "name")[0];
  stationName = nameElement?.textContent?.trim() || "Unknown Station";

  // Extract weather parameters from the simple format
  const temperatureElements = bestMember.getElementsByTagNameNS("*", "ParameterName");
  const valueElements = bestMember.getElementsByTagNameNS("*", "ParameterValue");

  const params_map: Record<string, number> = {};
  
  for (let i = 0; i < temperatureElements.length && i < valueElements.length; i++) {
    const paramName = temperatureElements[i]?.textContent?.trim().toLowerCase();
    const paramValue = toNumber(valueElements[i]?.textContent);
    
    if (paramName && paramValue !== undefined) {
      params_map[paramName] = paramValue;
      console.log(`Found parameter: ${paramName} = ${paramValue}`);
    }
  }

  // Try to extract the required parameters with various possible names
  const temperature = params_map['temperature'] || params_map['t2m'] || params_map['air temperature'];
  const humidity = params_map['humidity'] || params_map['rh'] || params_map['relative humidity'];
  const pressure = params_map['pressure'] || params_map['p_sea'] || params_map['sea level pressure'] || params_map['mean sea level pressure'];
  const windSpeed = params_map['wind speed'] || params_map['ws_10min'] || params_map['windspeedms'];
  const windDir = params_map['wind direction'] || params_map['wd_10min'] || params_map['winddirection'];

  console.log('Extracted values:', { temperature, humidity, pressure, windSpeed, windDir });

  if (temperature == null || humidity == null || pressure == null) {
    const available = Object.keys(params_map);
    throw new Error(`Missing required weather parameters. Available: ${available.join(', ')}`);
  }

  // Convert pressure to Pa if needed (FMI usually gives hPa)
  let pressurePa = pressure;
  if (pressurePa < 2000) pressurePa = pressurePa * 100;

  const rho = computeRho(pressurePa, temperature, humidity);

  return {
    temperatureC: temperature,
    rhPercent: humidity,
    pressurePa: pressurePa,
    rho,
    windSpeedMs: windSpeed,
    windDirectionDeg: windDir,
    stationName,
    obsTime: latestTime,
  };
}

// Try the multipointcoverage query as fallback
async function tryFMIMultipointQuery(lat: number, lon: number): Promise<FMIResult> {
  const base = "https://opendata.fmi.fi/wfs";
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "getFeature",
    storedquery_id: "fmi::observations::weather::multipointcoverage",
    latlon: `${lat.toFixed(6)},${lon.toFixed(6)}`,
    parameters: "temperature,humidity,pressure,windspeedms,winddirection",
  });

  const now = new Date();
  const start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  params.append("starttime", start.toISOString());
  params.append("endtime", now.toISOString());

  const url = `${base}?${params.toString()}`;
  console.log('FMI Multipoint API URL:', url);
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMI multipoint request failed: ${res.status} ${res.statusText}`);

  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  // Parse multipoint response format
  const dataElements = Array.from(doc.getElementsByTagNameNS("*", "doubleOrNilReasonTupleList"));
  if (dataElements.length === 0) {
    throw new Error("No data found in multipoint response");
  }

  const dataText = dataElements[0].textContent?.trim();
  if (!dataText) {
    throw new Error("No data values found");
  }

  // Parse the space-separated values
  const lines = dataText.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    throw new Error("No valid data lines found");
  }

  // Get the last (most recent) line of data
  const lastLine = lines[lines.length - 1].trim();
  const values = lastLine.split(/\s+/).map(v => v === 'NaN' ? null : parseFloat(v));

  console.log('Parsed multipoint values:', values);

  // Parameters are typically in order: temperature, humidity, pressure, windspeed, winddirection
  const [temperature, humidity, pressure, windSpeed, windDir] = values;

  if (temperature == null || humidity == null || pressure == null) {
    throw new Error(`Missing required weather parameters from multipoint data`);
  }

  // Convert pressure to Pa if needed
  let pressurePa = pressure;
  if (pressurePa < 2000) pressurePa = pressurePa * 100;

  const rho = computeRho(pressurePa, temperature, humidity);

  return {
    temperatureC: temperature,
    rhPercent: humidity,
    pressurePa: pressurePa,
    rho,
    windSpeedMs: windSpeed || undefined,
    windDirectionDeg: windDir || undefined,
    stationName: "FMI Station",
    obsTime: new Date().toISOString(),
  };
}

// Fallback to OpenWeatherMap API (requires API key but more reliable)
async function tryOpenWeatherMapFallback(lat: number, lon: number): Promise<FMIResult> {
  // This is a demo key - in production, users would need their own API key
  const API_KEY = "demo_key_replace_with_real_key";
  
  // For now, just return standard conditions since we don't have a real API key
  throw new Error("OpenWeatherMap fallback not configured - no API key");
}

export async function fetchFMIWeather(lat: number, lon: number): Promise<FMIResult> {
  const errors: string[] = [];
  
  // Validate coordinates
  if (!lat || !lon || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error(`Invalid coordinates: ${lat}, ${lon}`);
  }
  
  console.log(`Attempting to fetch weather for coordinates: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  
  // Try FMI simple query first
  try {
    return await tryFMISimpleQuery(lat, lon);
  } catch (e: any) {
    errors.push(`FMI simple query: ${e.message}`);
    console.warn('FMI simple query failed:', e.message);
  }
  
  // Try FMI multipoint query
  try {
    return await tryFMIMultipointQuery(lat, lon);
  } catch (e: any) {
    errors.push(`FMI multipoint query: ${e.message}`);
    console.warn('FMI multipoint query failed:', e.message);
  }
  
  // Try OpenWeatherMap fallback (would need API key)
  try {
    return await tryOpenWeatherMapFallback(lat, lon);
  } catch (e: any) {
    errors.push(`OpenWeatherMap fallback: ${e.message}`);
    console.warn('OpenWeatherMap fallback failed:', e.message);
  }
  
  // All approaches failed
  throw new Error(`Unable to fetch weather data. Attempted methods:\n${errors.join('\n')}\n\nThis may be due to:\n1. FMI API temporary unavailability\n2. No recent weather stations near your location\n3. API endpoint changes\n4. Network connectivity issues\n\nThe calculator will use standard atmospheric conditions instead.`);
}