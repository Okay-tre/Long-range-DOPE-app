// src/utils/fmi.ts
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

const RD = 287.058; // J/(kg·K)
const RV = 461.495; // J/(kg·K)

function computeRho(pressurePa: number, temperatureC: number, rhPercent: number): number {
  const es_hPa = 6.112 * Math.exp((17.62 * temperatureC) / (243.12 + temperatureC));
  const e_hPa  = (Math.max(0, Math.min(100, rhPercent)) / 100) * es_hPa;
  const e_Pa   = e_hPa * 100;
  const T      = temperatureC + 273.15;
  const pd     = Math.max(0, pressurePa - e_Pa);
  return pd / (RD * T) + e_Pa / (RV * T);
}

function num(x?: string | null) { const n = Number(x); return Number.isFinite(n) ? n : undefined; }

/* ---------- FMI SIMPLE (wider window + timestep + CRS) ---------- */
async function tryFMISimpleQuery(lat: number, lon: number): Promise<FMIResult> {
  const base = "https://opendata.fmi.fi/wfs";
  const qs = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    storedquery_id: "fmi::observations::weather::simple",
    latlon: `${lat.toFixed(6)},${lon.toFixed(6)}`,
    maxlocations: "1",
    crs: "EPSG:4326",
    timestep: "10", // minutes
  });
  const now = new Date();
  const start = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12h window
  qs.append("starttime", start.toISOString());
  qs.append("endtime", now.toISOString());

  const res = await fetch(`${base}?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  const members = Array.from(doc.getElementsByTagNameNS("*", "member"));
  if (members.length === 0) throw new Error("No members in simple response");

  // pick most recent
  let latest: Element | null = null;
  let latestTime = "";
  for (const m of members) {
    const t = m.getElementsByTagNameNS("*", "time")[0]?.textContent ?? "";
    if (t > latestTime) { latestTime = t; latest = m; }
  }
  if (!latest) throw new Error("No latest observation");

  const name = latest.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim() ?? "FMI Station";
  const pNames  = Array.from(latest.getElementsByTagNameNS("*", "ParameterName"));
  const pValues = Array.from(latest.getElementsByTagNameNS("*", "ParameterValue"));
  const map: Record<string, number> = {};
  for (let i = 0; i < pNames.length && i < pValues.length; i++) {
    const key = pNames[i].textContent?.trim().toLowerCase();
    const val = num(pValues[i].textContent);
    if (key && val !== undefined) map[key] = val;
  }

  const temperature = map["temperature"] ?? map["t2m"] ?? map["air temperature"];
  const humidity    = map["humidity"] ?? map["rh"] ?? map["relative humidity"];
  let pressure      = map["pressure"] ?? map["p_sea"] ?? map["sea level pressure"] ?? map["mean sea level pressure"];
  const windSpeed   = map["wind speed"] ?? map["ws_10min"] ?? map["windspeedms"];
  const windDir     = map["wind direction"] ?? map["wd_10min"] ?? map["winddirection"];

  if (temperature == null || humidity == null || pressure == null) {
    throw new Error("Required parameters missing");
  }
  if (pressure < 2000) pressure *= 100; // hPa -> Pa

  return {
    temperatureC: temperature,
    rhPercent: humidity,
    pressurePa: pressure,
    rho: computeRho(pressure, temperature, humidity),
    windSpeedMs: windSpeed,
    windDirectionDeg: windDir,
    stationName: name,
    obsTime: latestTime,
  };
}

/* ---------- FMI MULTIPOINT (wider window) ---------- */
async function tryFMIMultipointQuery(lat: number, lon: number): Promise<FMIResult> {
  const base = "https://opendata.fmi.fi/wfs";
  const qs = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    storedquery_id: "fmi::observations::weather::multipointcoverage",
    parameters: "temperature,humidity,pressure,windspeedms,winddirection",
    latlon: `${lat.toFixed(6)},${lon.toFixed(6)}`,
    crs: "EPSG:4326",
  });
  const now = new Date();
  const start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  qs.append("starttime", start.toISOString());
  qs.append("endtime", now.toISOString());

  const res = await fetch(`${base}?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  const tuples = doc.getElementsByTagNameNS("*", "doubleOrNilReasonTupleList")[0]?.textContent?.trim();
  if (!tuples) throw new Error("No tuple data");

  const lines = tuples.split("\n").map(s => s.trim()).filter(Boolean);
  const last  = lines[lines.length - 1];
  const [temperature, humidity, pressure, windSpeed, windDir] =
    last.split(/\s+/).map(v => (v === "NaN" ? null : Number(v)));

  if (temperature == null || humidity == null || pressure == null) {
    throw new Error("Missing multipoint parameters");
  }
  let pressurePa = pressure;
  if (pressurePa < 2000) pressurePa *= 100;

  return {
    temperatureC: temperature,
    rhPercent: humidity,
    pressurePa,
    rho: computeRho(pressurePa, temperature, humidity),
    windSpeedMs: windSpeed ?? undefined,
    windDirectionDeg: windDir ?? undefined,
    stationName: "FMI Station",
    obsTime: now.toISOString(),
  };
}

/* ---------- OPEN-METEO (free, no key) FALLBACK ---------- */
async function tryOpenMeteo(lat: number, lon: number): Promise<FMIResult> {
  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${qs.toString()}`);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const j = await res.json();

  const T  = Number(j?.current?.temperature_2m);
  const RH = Number(j?.current?.relative_humidity_2m);
  const P  = Number(j?.current?.surface_pressure);
  if (!Number.isFinite(T) || !Number.isFinite(RH) || !Number.isFinite(P)) {
    throw new Error("Open-Meteo missing fields");
  }
  return {
    temperatureC: T,
    rhPercent: RH,
    pressurePa: P * 100, // hPa -> Pa
    rho: computeRho(P * 100, T, RH),
    windSpeedMs: Number(j?.current?.wind_speed_10m) || undefined,
    windDirectionDeg: Number(j?.current?.wind_direction_10m) || undefined,
    stationName: "Open-Meteo",
    obsTime: j?.current?.time ?? new Date().toISOString(),
  };
}

export async function fetchFMIWeather(lat: number, lon: number): Promise<FMIResult> {
  const errs: string[] = [];
  try { return await tryFMISimpleQuery(lat, lon); } catch (e: any) { errs.push(`FMI simple failed: ${e.message}`); }
  try { return await tryFMIMultipointQuery(lat, lon); } catch (e: any) { errs.push(`FMI multipoint failed: ${e.message}`); }
  try { return await tryOpenMeteo(lat, lon); } catch (e: any) { errs.push(`Open-Meteo failed: ${e.message}`); }
  throw new Error(errs.join(" | "));
}
