// src/pages/CalculatorPage.tsx
import React, { useEffect, useState } from "react";
import { useApp } from "../contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import type { Environment } from "../lib/appState";
import { buildDopeTable } from "../lib/calcEngine";
import { computeCoriolisHold } from "../utils/coriolis";
import { Button } from "../components/ui/button";
import { toast } from "sonner@2.0.3";

export function CalculatorPage() {
  const { state } = useApp();

  // Selected equipment
  const weapon = state.weapons.find((w) => w.id === state.selectedWeaponId);
  const ammo   = weapon?.ammo.find((a) => a.id === state.selectedAmmoId);

  // Shooter environment
  const [env, setEnv] = useState<Environment>({
    temperatureC: 20, pressurehPa: 1013, humidityPct: 50, altitudeM: 0,
  });

  // Wind
  const [windSpeed, setWindSpeed] = useState(0);
  const [windAngle, setWindAngle] = useState(90); // deg: 0=N, 90=E (left->right)

  // Ranges
  const [rangesText, setRangesText] = useState("100,200,300,400,500,600");

  // Coriolis toggles/inputs
  const [useCoriolis, setUseCoriolis] = useState(true);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [azimuth, setAzimuth]   = useState<number>(0); // user-entered bearing to target
  const [locationNote, setLocationNote] = useState<string>("");

  // Ask for location for latitude (optional)
  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported by this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLocationNote(`Using device location: lat ${pos.coords.latitude.toFixed(4)}`);
        toast.success("Location acquired for Coriolis");
      },
      (err) => {
        toast.error(`Location error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (!ammo) {
    return (
      <div className="container max-w-3xl mx-auto p-4">
        <p>No ammo selected. Please configure equipment first.</p>
      </div>
    );
  }

  const ranges = rangesText
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  // Core ballistic results (without Coriolis)
  // Assumes your buildDopeTable(ammo, env, ranges, windSpeed, windAngle)
  // returns array aligned to 'ranges' with: { tof, impactVel, dropM, holdMil, holdMoa, driftM }
  const base = buildDopeTable(ammo, env, ranges, windSpeed, windAngle);

  // Merge Coriolis if enabled + we have latitude + reasonable solver outputs
  const rows = base.map((row, i) => {
    const rangeM    = ranges[i];
    const tof       = row.tof ?? 0;
    const vImpact   = row.impactVel ?? Math.max(0, ammo.V0 - 300); // fallback-ish
    const vMuzzle   = ammo.V0;

    // Default = no correction
    let cor = { elevMil: 0, elevMoa: 0, windMil: 0, windMoa: 0, eastDriftM: 0, upShiftM: 0 };

    if (useCoriolis && latitude !== null && Number.isFinite(tof) && tof > 0) {
      cor = computeCoriolisHold({
        rangeM, tofSec: tof, vMuzzle, vImpact, latitudeDeg: latitude, azimuthDeg: azimuth,
      });
    }

    // Combined final holds
    const holdMil = (row.holdMil ?? 0) + cor.elevMil;
    const holdMoa = (row.holdMoa ?? 0) + cor.elevMoa;

    // Add the Coriolis lateral drift to wind drift, convert cor.windMil to meters along range line:
    // drift_mils = driftM / rangeM * 1000  => extra drift meters from cor.windMil:
    const corDriftM = (cor.windMil / 1000) * rangeM;
    const driftM    = (row.driftM ?? 0) + corDriftM;

    return {
      ...row,
      // originals
      rangeM,
      // coriolis components
      corElevMil: cor.elevMil,
      corWindMil: cor.windMil,
      // merged
      holdMil, holdMoa, driftM,
    };
  });

  return (
    <div className="container max-w-5xl mx-auto p-4 space-y-4">
      {/* Environment & Wind */}
      <Card>
        <CardHeader><CardTitle>Environment & Wind</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label>Temperature (°C)</Label>
            <Input type="number" value={env.temperatureC}
              onChange={(e) => setEnv({ ...env, temperatureC: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Pressure (hPa)</Label>
            <Input type="number" value={env.pressurehPa}
              onChange={(e) => setEnv({ ...env, pressurehPa: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Humidity (%)</Label>
            <Input type="number" value={env.humidityPct}
              onChange={(e) => setEnv({ ...env, humidityPct: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Altitude (m)</Label>
            <Input type="number" value={env.altitudeM ?? 0}
              onChange={(e) => setEnv({ ...env, altitudeM: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Wind Speed (m/s)</Label>
            <Input type="number" value={windSpeed}
              onChange={(e) => setWindSpeed(Number(e.target.value))} />
          </div>
          <div>
            <Label>Wind Angle (°)</Label>
            <Input type="number" value={windAngle}
              onChange={(e) => setWindAngle(Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      {/* Coriolis (optional) */}
      <Card>
        <CardHeader><CardTitle>Coriolis (Optional)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <input
              id="use-coriolis"
              type="checkbox"
              checked={useCoriolis}
              onChange={(e) => setUseCoriolis(e.target.checked)}
            />
            <Label htmlFor="use-coriolis">Apply Coriolis correction</Label>
          </div>

          <div>
            <Label>Latitude (°)</Label>
            <Input
              type="number"
              value={latitude ?? ""}
              onChange={(e) => setLatitude(e.target.value === "" ? null : Number(e.target.value))}
              placeholder="e.g., 60.17"
              disabled={!useCoriolis}
            />
          </div>

          <div>
            <Label>Firing Azimuth (°)</Label>
            <Input
              type="number"
              value={azimuth}
              onChange={(e) => setAzimuth(Number(e.target.value))}
              placeholder="0=N, 90=E"
              disabled={!useCoriolis}
            />
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <Button type="button" variant="outline" disabled={!useCoriolis} onClick={handleUseLocation}>
              Use my location (latitude)
            </Button>
            {locationNote && <span className="text-xs text-muted-foreground">{locationNote}</span>}
          </div>
        </CardContent>
      </Card>

      {/* DOPE table */}
      <Card>
        <CardHeader><CardTitle>DOPE Table</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-2">
            <Label>Ranges (comma separated, m)</Label>
            <Input value={rangesText} onChange={(e) => setRangesText(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full mt-3 text-sm border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-1">Range (m)</th>
                  <th className="px-2 py-1">TOF (s)</th>
                  <th className="px-2 py-1">Impact Vel (m/s)</th>
                  <th className="px-2 py-1">Drop (m)</th>
                  <th className="px-2 py-1">Ballistic Hold (MIL)</th>
                  <th className="px-2 py-1">Coriolis ΔElev (MIL)</th>
                  <th className="px-2 py-1">Coriolis ΔWind (MIL)</th>
                  <th className="px-2 py-1">Combined Hold (MIL)</th>
                  <th className="px-2 py-1">Wind Drift (m) w/ Coriolis</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1 text-center">{ranges[i]}</td>
                    <td className="px-2 py-1 text-center">{(r.tof ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-center">{(r.impactVel ?? 0).toFixed(1)}</td>
                    <td className="px-2 py-1 text-center">{(r.dropM ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-center">{(r.holdMil - (r.corElevMil ?? 0)).toFixed(2)}</td>
                    <td className="px-2 py-1 text-center">{(r.corElevMil ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-center">{(r.corWindMil ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-center">{(r.holdMil ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-center">{(r.driftM ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {useCoriolis && latitude !== null && (
            <p className="text-xs text-muted-foreground mt-2">
              Coriolis sign convention: +ΔElev (MIL) adds to dial UP, +ΔWind (MIL) adds to dial LEFT.
              In N hemisphere: firing North → right drift (dial LEFT), firing East → higher impact (dial DOWN).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
