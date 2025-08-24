// src/pages/CalculatorPage.tsx
import React, { useMemo, useState } from "react";
import { useApp } from "../contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import type { Environment } from "../lib/appState";
import { buildDopeTable } from "../lib/calcEngine";
import { Button } from "../components/ui/button";
import { toast } from "sonner@2.0.3";

export function CalculatorPage() {
  const { state } = useApp();

  // Selected equipment
  const weapon = state.weapons.find((w) => w.id === state.selectedWeaponId);
  const ammo   = weapon?.ammo.find((a) => a.id === state.selectedAmmoId);

  // Sensible defaults if nothing selected yet
  const defaultEnv: Environment = { temperatureC: 20, pressurehPa: 1013, humidityPct: 50, altitudeM: 0 };
  const [env, setEnv] = useState<Environment>(ammo?.zeroEnv ?? defaultEnv);

  const [windSpeed, setWindSpeed] = useState(0);
  const [windAngle, setWindAngle] = useState(90); // 90 = left→right
  const [rangesText, setRangesText] = useState("100,200,300,400,500,600");

  // Click size (per detent) derived from weapon + units with safe fallback
  const scopeUnits = weapon?.scopeUnits ?? "MIL";
  const scopeClick = useMemo(() => {
    if (typeof (weapon as any)?.scopeClick === "number" && isFinite((weapon as any).scopeClick)) {
      return (weapon as any).scopeClick as number;
    }
    return scopeUnits === "MIL" ? 0.1 : 0.25;
  }, [weapon, scopeUnits]);

  if (!ammo) {
    return (
      <div className="container max-w-3xl mx-auto p-4">
        <p className="mb-2">No ammo selected. Please configure equipment first.</p>
        <p className="text-sm text-muted-foreground">Tip: Add a rifle & load in Equipment, then come back here.</p>
      </div>
    );
  }

  const ranges = rangesText
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  // Core ballistic results (no Coriolis here; keep that for a later pass if you like)
  // buildDopeTable(ammo, env, ranges, windSpeed, windAngle)
  const base = buildDopeTable(ammo, env, ranges, windSpeed, windAngle);

  // Click helper
  const formatClicks = (holdMil: number, holdMoa: number) => {
    if (scopeUnits === "MIL") {
      const clicks = Math.round((Math.abs(holdMil) / scopeClick) * 10) / 10;
      return `≈ ${clicks} clicks`;
    } else {
      const clicks = Math.round((Math.abs(holdMoa) / scopeClick) * 10) / 10;
      return `≈ ${clicks} clicks`;
    }
  };

  const useAmmoZeroEnv = () => {
    if (!ammo?.zeroEnv) {
      toast.error("Selected ammo has no zero environment.");
      return;
    }
    setEnv(ammo.zeroEnv);
    toast.success("Loaded zero environment from ammo");
  };

  return (
    <div className="container max-w-5xl mx-auto p-4 space-y-4">
      {/* Equipment summary */}
      <Card>
        <CardHeader>
          <CardTitle>Selected Equipment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div><span className="text-muted-foreground">Rifle: </span>{weapon?.name || "—"}</div>
          <div><span className="text-muted-foreground">Ammo: </span>{ammo.name || ammo.ammoName || "—"}</div>
          <div>
            <span className="text-muted-foreground">Scope Units: </span>
            {scopeUnits} <span className="text-muted-foreground">• Click: </span>{scopeClick} {scopeUnits}
          </div>
        </CardContent>
      </Card>

      {/* Environment & Wind */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Environment & Wind</CardTitle>
          <Button variant="outline" size="sm" onClick={useAmmoZeroEnv}>
            Use Ammo Zero Env
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label>Temperature (°C)</Label>
            <Input
              type="number"
              value={env.temperatureC}
              onChange={(e) => setEnv({ ...env, temperatureC: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Pressure (hPa)</Label>
            <Input
              type="number"
              value={env.pressurehPa}
              onChange={(e) => setEnv({ ...env, pressurehPa: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Humidity (%)</Label>
            <Input
              type="number"
              value={env.humidityPct}
              onChange={(e) => setEnv({ ...env, humidityPct: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Altitude (m)</Label>
            <Input
              type="number"
              value={env.altitudeM ?? 0}
              onChange={(e) => setEnv({ ...env, altitudeM: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Wind Speed (m/s)</Label>
            <Input
              type="number"
              value={windSpeed}
              onChange={(e) => setWindSpeed(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Wind Angle (°)</Label>
            <Input
              type="number"
              value={windAngle}
              onChange={(e) => setWindAngle(Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      {/* DOPE table */}
      <Card>
        <CardHeader>
          <CardTitle>DOPE Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2">
            <Label>Ranges (comma separated, m)</Label>
            <Input value={rangesText} onChange={(e) => setRangesText(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full mt-3 text-sm border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-1 text-left">Range (m)</th>
                  <th className="px-2 py-1 text-center">TOF (s)</th>
                  <th className="px-2 py-1 text-center">Impact Vel (m/s)</th>
                  <th className="px-2 py-1 text-center">Drop (m)</th>
                  <th className="px-2 py-1 text-center">Hold (MIL)</th>
                  <th className="px-2 py-1 text-center">Hold (MOA)</th>
                  <th className="px-2 py-1 text-center">Clicks ({scopeUnits})</th>
                  <th className="px-2 py-1 text-center">Wind Drift (m)</th>
                </tr>
              </thead>
              <tbody>
                {base.map((res, i) => {
                  const holdMil = res.holdMil ?? 0;
                  const holdMoa = res.holdMoa ?? (holdMil * 3.437746);
                  return (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{ranges[i]}</td>
                      <td className="px-2 py-1 text-center">{(res.tof ?? 0).toFixed(2)}</td>
                      <td className="px-2 py-1 text-center">{(res.impactVel ?? 0).toFixed(1)}</td>
                      <td className="px-2 py-1 text-center">{(res.dropM ?? 0).toFixed(2)}</td>
                      <td className="px-2 py-1 text-center">{holdMil.toFixed(2)}</td>
                      <td className="px-2 py-1 text-center">{holdMoa.toFixed(2)}</td>
                      <td className="px-2 py-1 text-center">{formatClicks(holdMil, holdMoa)}</td>
                      <td className="px-2 py-1 text-center">{(res.driftM ?? 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Clicks are computed from your rifle’s scope click value ({scopeClick} {scopeUnits}/click).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
