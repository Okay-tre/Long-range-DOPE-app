// src/pages/CalculatorPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../contexts/AppContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner@2.0.3";

import { buildDopeTable } from "../lib/calcEngine";
import type { Environment, AmmoProfile, Weapon } from "../lib/appState";
import { fetchFMIWeather } from "../utils/fmi";

function toNumbersList(s: string): number[] {
  return s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function CalculatorPage() {
  const { state } = useApp();

  // ---- pick selected weapon + ammo safely, with simple fallbacks
  const weapon: Weapon | undefined = useMemo(() => {
    const byId = state.weapons.find((w) => w.id === state.selectedWeaponId);
    if (byId) return byId;
    return state.weapons[0];
  }, [state.weapons, state.selectedWeaponId]);

  const ammo: AmmoProfile | undefined = useMemo(() => {
    if (!weapon) return undefined;
    const byId = weapon.ammo?.find((a) => a.id === state.selectedAmmoId);
    if (byId) return byId;
    return weapon.ammo?.[0];
  }, [weapon, state.selectedAmmoId]);

  // ---- environment (seed from ammo.zeroEnv when available)
  const seedEnv: Environment = {
    temperatureC: ammo?.zeroEnv?.temperatureC ?? 20,
    pressurehPa:  ammo?.zeroEnv?.pressurehPa  ?? 1013,
    humidityPct:  ammo?.zeroEnv?.humidityPct  ?? 50,
    altitudeM:    ammo?.zeroEnv?.altitudeM    ?? 0,
  };

  const [env, setEnv] = useState<Environment>(seedEnv);

  // keep env in sync if user changes ammo
  useEffect(() => {
    setEnv({
      temperatureC: ammo?.zeroEnv?.temperatureC ?? 20,
      pressurehPa:  ammo?.zeroEnv?.pressurehPa  ?? 1013,
      humidityPct:  ammo?.zeroEnv?.humidityPct  ?? 50,
      altitudeM:    ammo?.zeroEnv?.altitudeM    ?? 0,
    });
  }, [ammo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- wind
  const [windSpeed, setWindSpeed] = useState<number>(0); // m/s
  const [windAngle, setWindAngle] = useState<number>(90); // deg, 90 = L→R full value

  // ---- ranges
  const [ranges, setRanges] = useState<string>("100,200,300,400,500,600");
  const rangeList = useMemo(() => {
    const xs = toNumbersList(ranges);
    // de-dup + sort to keep it clean
    return Array.from(new Set(xs)).sort((a, b) => a - b);
  }, [ranges]);

  // ---- FMI integration
  const [loadingFMI, setLoadingFMI] = useState(false);
  async function handleUseFMI() {
    try {
      setLoadingFMI(true);

      // Ask for user location
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!("geolocation" in navigator)) {
          reject(new Error("Geolocation not available in this browser"));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000,
        });
      });

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      const data = await fetchFMIWeather(lat, lon);
      // Update environment fields we care about. Pressure from FMI is sea-level; that’s OK for density.
      setEnv((prev) => ({
        ...prev,
        temperatureC: data.temperatureC,
        humidityPct: data.rhPercent,
        // If your engine uses pressure: set it; otherwise it’s harmless
        pressurehPa: Math.round((data.pressurePa ?? 101325) / 100),
      }));

      // Wind (optional—only set if FMI returned them)
      if (typeof data.windSpeedMs === "number") setWindSpeed(data.windSpeedMs);
      if (typeof data.windDirectionDeg === "number") setWindAngle(data.windDirectionDeg);

      toast.success(
        `Weather loaded from FMI${data.stationName ? ` (${data.stationName})` : ""}`
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to fetch FMI weather");
    } finally {
      setLoadingFMI(false);
    }
  }

  // ---- guard: no ammo selected yet
  if (!ammo) {
    return (
      <div className="container max-w-3xl mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Ballistic Calculator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              No ammunition selected. Please add equipment & ammo on the{" "}
              <a href="#/equipment" className="text-primary underline">Equipment</a> page and select it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- compute DOPE safely
  let dopeRows:
    | Array<{
        rangeM: number;
        tof: number;
        impactVel: number;
        dropM: number;
        holdMil: number;
        holdMoa: number;
        driftM: number;
      }>
    | null = null;

  try {
    const results = buildDopeTable(ammo, env, rangeList, windSpeed, windAngle);
    // Pair with ranges defensively
    dopeRows = results.map((r, i) => ({
      rangeM: rangeList[i] ?? 0,
      tof: r.tof ?? 0,
      impactVel: r.impactVel ?? 0,
      dropM: r.dropM ?? 0,
      holdMil: r.holdMil ?? 0,
      holdMoa: r.holdMoa ?? 0,
      driftM: r.driftM ?? 0,
    }));
  } catch (e) {
    // If your engine throws, keep the page alive and show an empty state
    dopeRows = null;
  }

  return (
    <div className="container max-w-5xl mx-auto p-4 space-y-4">
      {/* Equipment summary */}
      <Card>
        <CardHeader>
          <CardTitle>Selected Equipment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Rifle</div>
            <div className="font-medium">{weapon?.name || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Ammunition</div>
            <div className="font-medium">{ammo.name || ammo.ammoName || "—"}</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">V₀</div>
              <div className="font-medium">{Math.round(ammo.V0)} m/s</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">BC ({ammo.model})</div>
              <div className="font-medium">{ammo.bc}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Zero</div>
              <div className="font-medium">{ammo.zeroDistanceM} m</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Environment & Wind */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Environment &amp; Wind</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUseFMI}
            disabled={loadingFMI}
            title="Use current weather from FMI (needs location permission)"
          >
            {loadingFMI ? "Getting FMI…" : "Use FMI Weather"}
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <Label>Temperature (°C)</Label>
            <Input
              type="number"
              value={env.temperatureC}
              onChange={(e) =>
                setEnv((p) => ({ ...p, temperatureC: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div>
            <Label>Pressure (hPa)</Label>
            <Input
              type="number"
              value={env.pressurehPa}
              onChange={(e) =>
                setEnv((p) => ({ ...p, pressurehPa: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div>
            <Label>Humidity (%)</Label>
            <Input
              type="number"
              value={env.humidityPct}
              onChange={(e) =>
                setEnv((p) => ({ ...p, humidityPct: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div>
            <Label>Altitude (m)</Label>
            <Input
              type="number"
              value={env.altitudeM ?? 0}
              onChange={(e) =>
                setEnv((p) => ({ ...p, altitudeM: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div>
            <Label>Wind Speed (m/s)</Label>
            <Input
              type="number"
              value={windSpeed}
              onChange={(e) => setWindSpeed(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Wind Angle (°)</Label>
            <Input
              type="number"
              value={windAngle}
              onChange={(e) => setWindAngle(Number(e.target.value) || 0)}
            />
          </div>
        </CardContent>
      </Card>

      {/* DOPE Table */}
      <Card>
        <CardHeader>
          <CardTitle>DOPE Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xl">
            <Label>Ranges (comma separated, meters)</Label>
            <Input
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
              placeholder="e.g., 100,200,300,400,500,600"
            />
          </div>

          {(!dopeRows || dopeRows.length === 0) ? (
            <div className="text-sm text-muted-foreground mt-3">
              Enter at least one valid range to compute the table.
            </div>
          ) : (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">Range (m)</th>
                    <th className="px-2 py-1 text-left">TOF (s)</th>
                    <th className="px-2 py-1 text-left">Impact Vel (m/s)</th>
                    <th className="px-2 py-1 text-left">Drop (m)</th>
                    <th className="px-2 py-1 text-left">Hold (MIL)</th>
                    <th className="px-2 py-1 text-left">Hold (MOA)</th>
                    <th className="px-2 py-1 text-left">Wind Drift (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {dopeRows.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{row.rangeM}</td>
                      <td className="px-2 py-1">{row.tof.toFixed(2)}</td>
                      <td className="px-2 py-1">{row.impactVel.toFixed(1)}</td>
                      <td className="px-2 py-1">{row.dropM.toFixed(2)}</td>
                      <td className="px-2 py-1">{row.holdMil.toFixed(2)}</td>
                      <td className="px-2 py-1">{row.holdMoa.toFixed(2)}</td>
                      <td className="px-2 py-1">{row.driftM.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
