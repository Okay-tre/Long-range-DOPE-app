import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { solveTrajectory, buildDopeTable } from "../lib/calcEngine";
import type { Environment } from "../lib/appState";

export function CalculatorPage() {
  const { state } = useApp();

  // Grab currently selected weapon + ammo
  const weapon = state.weapons.find((w) => w.id === state.selectedWeaponId);
  const ammo = weapon?.ammo.find((a) => a.id === state.selectedAmmoId);

  // Shooter environment (simple inputs here)
  const [env, setEnv] = useState<Environment>({
    temperatureC: 20,
    pressurehPa: 1013,
    humidityPct: 50,
    altitudeM: 0,
  });

  const [windSpeed, setWindSpeed] = useState(0);
  const [windAngle, setWindAngle] = useState(90); // 90 = left→right

  const [ranges, setRanges] = useState("100,200,300,400,500,600");

  if (!ammo) {
    return (
      <div className="container max-w-3xl mx-auto p-4">
        <p>No ammo selected. Please configure equipment first.</p>
      </div>
    );
  }

  const rangeList = ranges
    .split(",")
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n) && n > 0);

  const dopeTable = buildDopeTable(ammo, env, rangeList, windSpeed, windAngle);

  return (
    <div className="container max-w-5xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Environment & Wind</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
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

      <Card>
        <CardHeader>
          <CardTitle>DOPE Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Label>Ranges (comma separated, m)</Label>
            <Input
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
            />
          </div>
          <table className="w-full mt-3 text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-2">Range (m)</th>
                <th className="px-2">TOF (s)</th>
                <th className="px-2">Impact Vel (m/s)</th>
                <th className="px-2">Drop (m)</th>
                <th className="px-2">Hold (MIL)</th>
                <th className="px-2">Hold (MOA)</th>
                <th className="px-2">Wind Drift (m)</th>
              </tr>
            </thead>
            <tbody>
              {dopeTable.map((res, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 text-center">{rangeList[i]}</td>
                  <td className="px-2 text-center">{res.tof.toFixed(2)}</td>
                  <td className="px-2 text-center">{res.impactVel.toFixed(1)}</td>
                  <td className="px-2 text-center">{res.dropM.toFixed(2)}</td>
                  <td className="px-2 text-center">{res.holdMil.toFixed(2)}</td>
                  <td className="px-2 text-center">{res.holdMoa.toFixed(2)}</td>
                  <td className="px-2 text-center">{res.driftM.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
