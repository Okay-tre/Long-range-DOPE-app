// src/utils/fmi.ts
// Robust browser-friendly FMI fetch with graceful fallbacks.
// Returns: temperatureC, rhPercent, pressurePa, rho, windSpeedMs?, windDirectionDeg?, stationName?, obsTime?

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

const RD = 287.058;
const RV = 461.495;

function toNumber(t: string | null | undefined): number | undefined {
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function computeRho(pressurePa: number, temperatureC: number, rhPercent: number): number {
  const es_hPa = 6.112 * Math.exp((17.62 * temperatureC) / (243.12 + temperatureC));
  const e_hPa  = (Math.max(0, Math.min(100, rhPercent)) / 100) * es_hPa;
  const e_Pa   = e_hPa * 100;
  const T      = (temperatureC + 273.15);
  const pd     = Math.max(0, pressurePa - e_Pa);
  return pd / (RD * T) + e_Pa / (RV * T);
}

function standardAtmosphere(): FMIResult {
  const temperatureC = 15;
  const rhPercent = 50;
  const pressurePa = 1013 * 100;
  const rho = computeRho(pressurePa, temperatureC, rhPercent);
  return { temperatureC, rhPercent, pressurePa, rho, stationName: "Std Atmos", obsTime: new Date().toISOString() };
}

// Normalize a map of "parameter name" -> number to standard keys
function normalizeParamsMap(params_map: Record<string, number>) {
  // Lowercase, strip spaces/slashes/units-ish for matching
  const keys = Object.keys(params_map);
  const get = (...cands: string[]) => {
    for (const k of keys) {
      const norm = k.toLowerCase().replace(/[^\w]+/g, "");
      if (cands.some(c => norm.includes(c))) return params_map[k];
    }
    return undefined;
  };

  // Temperature
  const temperature =
    get("temperature", "airtemperature", "t2m", "temp") ??
    get("ilmanlampotila"); // Finnish sometimes

  // Relative humidity
  const humidity =
    get("humidity", "relativehumidity", "rh") ??
    get("kosteus");

  // Pressure (sea-level or station); prefer sea level if present
  const pressure =
    get("sealevelpressure", "meansealevelpressure", "mslpressure", "pmsl", "p_sea") ??
    get("pressure", "airpressure", "stationpressure");

  // Wind speed / direction
  const windSpeed =
    get("windspeed", "windspeedms", "ws10min", "ws") ??
    undefined;
  const windDir =
    get("winddirection", "wd10min", "wd") ??
    undefined;

  return { temperature, humidity, pressure, windSpeed, windDir };
}

async function tryFMISimpleQuery(lat: number, lon: number): Promise<FMIResult> {
  const base = "https://opendata.fmi.fi/wfs";
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "getFeature",
    storedquery_id: "fmi::observations::weather::simple",
    latlon: `${lat.toFixed(6)},${lon.toFixed(6)}`,
    maxlocations: "1",
    // Language helps keep parameter labels in English
    language: "en",
  });

  const now = new Date();
  const start = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  params.append("starttime", start.toISOString());
  params.append("endtime", now.toISOString());

  const url = `${base}?${params.toString()}`;
  // console.log("FMI simple URL:", url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMI simple ${res.status} ${res.statusText}`);

  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) throw new Error("XML parse error");

  const members = Array.from(doc.getElementsByTagNameNS("*", "member"));
  if (!members.length) throw new Error("No members in simple response");

  // pick latest
  let latest = members[0];
  let latestTime = "";
  for (const m of members) {
    const t = m.getElementsByTagNameNS("*", "time")[0]?.textContent || "";
    if (t > latestTime) { latest = m; latestTime = t; }
  }

  const name = latest.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim() || "FMI Station";
  const pNames = latest.getElementsByTagNameNS("*", "ParameterName");
  const pVals  = latest.getElementsByTagNameNS("*", "ParameterValue");

  const params_map: Record<string, number> = {};
  const n = Math.min(pNames.length, pVals.length);
  for (let i = 0; i < n; i++) {
    const k = pNames[i]?.textContent?.trim() || `param_${i}`;
    const v = toNumber(pVals[i]?.textContent);
    if (k && v !== undefined) params_map[k] = v;
  }

  const { temperature, humidity, pressure, windSpeed, windDir } = normalizeParamsMap(params_map);
  if (temperature == null || humidity == null || pressure == null) {
    throw new Error("Missing temp/rh/pressure in simple response");
  }

  let pressurePa = pressure;
  if (pressurePa < 2000) pressurePa *= 100;

  const rho = computeRho(pressurePa, temperature, humidity);
  return {
    temperatureC: temperature,
    rhPercent: humidity,
    pressurePa,
    rho,
    windSpeedMs: windSpeed,
    windDirectionDeg: windDir,
    stationName: name,
    obsTime: latestTime || now.toISOString(),
  };
}

async function tryFMIMultipointQuery(lat: number, lon: number): Promise<FMIResult> {
  const base = "https://opendata.fmi.fi/wfs";
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "getFeature",
    storedquery_id: "fmi::observations::weather::multipointcoverage",
    latlon: `${lat.toFixed(6)},${lon.toFixed(6)}`,
    parameters: "temperature,humidity,pressure,windspeedms,winddirection",
    language: "en",
  });

  const now = new Date();
  const start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  params.append("starttime", start.toISOString());
  params.append("endtime", now.toISOString());

  const url = `${base}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMI multipoint ${res.status} ${res.statusText}`);

  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  // Try the tuple list first
  const dataEl = doc.getElementsByTagNameNS("*", "doubleOrNilReasonTupleList")[0];
  if (!dataEl || !dataEl.textContent) throw new Error("No tuple data");

  const lines = dataEl.textContent.split("\n").map(s => s.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Empty tuple data");

  const last = lines[lines.length - 1];
  const vals = last.split(/\s+/).map(v => v === "NaN" ? null : Number(v));

  // Expected order: temp, humidity, pressure, windspeed, winddir
  const [temperature, humidity, pressure, windSpeed, windDir] = vals;

  if (temperature == null || humidity == null || pressure == null) {
    throw new Error("Tuple missing essentials");
  }

  let pressurePa = pressure!;
  if (pressurePa < 2000) pressurePa *= 100;

  const rho = computeRho(pressurePa, temperature!, humidity!);

  return {
    temperatureC: temperature!,
    rhPercent: humidity!,
    pressurePa,
    rho,
    windSpeedMs: windSpeed ?? undefined,
    windDirectionDeg: windDir ?? undefined,
    stationName: "FMI Station",
    obsTime: now.toISOString(),
  };
}

// No-key fallback: just return standard atmosphere (don’t throw)
async function tryOpenWeatherMapFallback(): Promise<FMIResult> {
  return standardAtmosphere();
}

// Public API
export async function fetchFMIWeather(lat: number, lon: number): Promise<FMIResult> {
  // Basic validation
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    console.warn("FMI: invalid coordinates", lat, lon);
    return standardAtmosphere();
  }

  // Simple first
  try {
    return await tryFMISimpleQuery(lat, lon);
  } catch (e: any) {
    console.warn("FMI simple failed:", e?.message || e);
  }

  // Multipoint next
  try {
    return await tryFMIMultipointQuery(lat, lon);
  } catch (e: any) {
    console.warn("FMI multipoint failed:", e?.message || e);
  }

  // Final fallback: standard atmosphere (or OWM if you wire a key)
  try {
    return await tryOpenWeatherMapFallback();
  } catch (e: any) {
    console.warn("Fallback failed:", e?.message || e);
    return standardAtmosphere();
  }
}
