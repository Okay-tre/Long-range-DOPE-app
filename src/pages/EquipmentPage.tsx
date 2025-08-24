import React from "react";
import { useApp } from "../contexts/AppContext";
import type { Weapon, AmmoProfile } from "../lib/appState";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner@2.0.3";

function NumberInput({
  id, label, value, onChange, step = "any", className = "", help,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  className?: string;
  help?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
      />
      {help && <div className="text-xs text-muted-foreground mt-1">{help}</div>}
    </div>
  );
}

export function EquipmentPage() {
  const { state, setState } = useApp();
  const { weapons, selectedWeaponId, selectedAmmoId } = state;

  /* ---------------- helpers ---------------- */

  const selectWeapon = (id: string | undefined) =>
    setState({ ...state, selectedWeaponId: id });

  const selectAmmo = (id: string | undefined) =>
    setState({ ...state, selectedAmmoId: id });

  const addWeapon = () => {
    const w: Weapon = {
      id: crypto.randomUUID(),
      name: "New Rifle",
      scopeUnits: "MIL",
      scopeClick: 0.1,          // default per-detent (MIL)
      scopeHeightMm: 35,        // 🔴 moved to Weapon
      barrelLengthIn: 20,
      twistRateIn: 8,
      ammo: [],
    };
    setState({
      ...state,
      weapons: [...weapons, w],
      selectedWeaponId: w.id,
      selectedAmmoId: undefined,
    });
    toast.success("Rifle added");
  };

  const removeWeapon = (id: string) => {
    const next = weapons.filter((w) => w.id !== id);
    setState({
      ...state,
      weapons: next,
      selectedWeaponId: next[0]?.id,
      selectedAmmoId: undefined,
    });
    toast.success("Rifle removed");
  };

  const patchWeapon = (id: string, patch: Partial<Weapon>) => {
    setState({
      ...state,
      weapons: weapons.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    });
  };

  const addAmmo = (weaponId: string) => {
    const a: AmmoProfile = {
      id: crypto.randomUUID(),
      name: "New Load",
      ammoName: "",
      bulletWeightGr: 140,
      bc: 0.25,
      model: "G7",
      V0: 800,
      zeroDistanceM: 100,
      // ⛔️ scopeHeightMm removed from AmmoProfile
      zeroEnv: { temperatureC: 15, pressurehPa: 1013, humidityPct: 50, altitudeM: 0 },
    };
    setState({
      ...state,
      weapons: weapons.map((w) =>
        w.id === weaponId ? { ...w, ammo: [...w.ammo, a] } : w
      ),
      selectedWeaponId: weaponId,
      selectedAmmoId: a.id,
    });
    toast.success("Ammo added");
  };

  const removeAmmo = (weaponId: string, ammoId: string) => {
    const w = weapons.find((x) => x.id === weaponId);
    if (!w) return;
    const nextAmmo = w.ammo.filter((a) => a.id !== ammoId);
    patchWeapon(weaponId, { ammo: nextAmmo });
    setState({ ...state, selectedAmmoId: nextAmmo[0]?.id });
    toast.success("Ammo removed");
  };

  const patchAmmo = (weaponId: string, ammoId: string, patch: Partial<AmmoProfile>) => {
    const w = weapons.find((x) => x.id === weaponId);
    if (!w) return;
    const nextAmmo = w.ammo.map((a) => (a.id === ammoId ? { ...a, ...patch } : a));
    patchWeapon(weaponId, { ammo: nextAmmo });
  };

  const saveAll = () => {
    setState({ ...state }); // AppContext persistence effect handles writing
    toast.success("Equipment saved");
  };

  /* ---------------- render ---------------- */

  return (
    <div className="container max-w-6xl mx-auto p-3 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">Equipment & Ammunition</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={addWeapon} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Rifle
          </Button>
          <Button variant="outline" size="sm" onClick={saveAll}>
            Save All Changes
          </Button>
        </div>
      </div>

      {/* Weapon list */}
      <div className="grid gap-3">
        {weapons.map((w) => {
          const isSelected = selectedWeaponId === w.id;
          const clickHelp =
            w.scopeUnits === "MIL"
              ? "Typical: 0.1 MIL per click"
              : "Typical: 0.25 MOA per click";

          return (
            <Card
              key={w.id}
              className={`transition-colors ${isSelected ? "ring-2 ring-primary" : ""}`}
              onClick={() => selectWeapon(w.id)}
            >
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base truncate">{w.name || "Unnamed Rifle"}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeWeapon(w.id);
                    }}
                    aria-label="Delete rifle"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              {/* Weapon body */}
              <CardContent onClick={(e) => e.stopPropagation()}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`name-${w.id}`}>Rifle Name</Label>
                    <Input
                      id={`name-${w.id}`}
                      value={w.name}
                      onChange={(e) => patchWeapon(w.id, { name: e.target.value })}
                      placeholder="e.g., Remington 700"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <NumberInput
                      id={`barrel-${w.id}`}
                      label="Barrel Length (in)"
                      value={w.barrelLengthIn}
                      onChange={(v) => patchWeapon(w.id, { barrelLengthIn: v })}
                      step="0.5"
                    />
                    <NumberInput
                      id={`twist-${w.id}`}
                      label="Twist Rate (in)"
                      value={w.twistRateIn}
                      onChange={(v) => patchWeapon(w.id, { twistRateIn: v })}
                      step="0.5"
                    />
                  </div>

                  {/* Scope geometry + turret */}
                  <div className="grid grid-cols-2 gap-3">
                    <NumberInput
                      id={`sh-${w.id}`}
                      label="Scope Height (mm)"
                      value={w.scopeHeightMm ?? 35}
                      onChange={(v) => patchWeapon(w.id, { scopeHeightMm: v })}
                      step="1"
                      help="Center of bore to center of scope"
                    />

                    <div>
                      <Label>Scope Units</Label>
                      <Select
                        value={w.scopeUnits}
                        onValueChange={(val) => {
                          const units = val as Weapon["scopeUnits"];
                          const autoClick = units === "MIL" ? 0.1 : 0.25;
                          patchWeapon(w.id, {
                            scopeUnits: units,
                            scopeClick:
                              (w.scopeClick ?? autoClick) === (units === "MIL" ? 0.25 : 0.1)
                                ? autoClick
                                : (w.scopeClick ?? autoClick),
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MIL">MIL</SelectItem>
                          <SelectItem value="MOA">MOA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <NumberInput
                      id={`click-${w.id}`}
                      label={`Scope Click (${w.scopeUnits})`}
                      value={
                        Number.isFinite(w.scopeClick as number)
                          ? (w.scopeClick as number)
                          : (w.scopeUnits === "MIL" ? 0.1 : 0.25)
                      }
                      onChange={(v) => patchWeapon(w.id, { scopeClick: v })}
                      step={w.scopeUnits === "MIL" ? "0.01" : "0.125"}
                      help={clickHelp}
                    />
                  </div>
                </div>

                {/* Ammo list */}
                <div className="mt-4">
                  <h3 className="font-medium text-sm mb-2">Ammunition</h3>
                  {w.ammo.length === 0 && (
                    <div className="text-xs text-muted-foreground">No ammo yet.</div>
                  )}
                  <div className="grid gap-2">
                    {w.ammo.map((a) => {
                      const open = selectedAmmoId === a.id;
                      return (
                        <Card
                          key={a.id}
                          className={`border ${open ? "ring-1 ring-primary" : ""}`}
                          onClick={() => selectAmmo(a.id)}
                        >
                          <CardHeader className="flex flex-row items-center justify-between py-2">
                            <CardTitle className="text-sm truncate">
                              {a.name || a.ammoName || "Load"}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeAmmo(w.id, a.id);
                                }}
                                aria-label="Delete ammo"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardHeader>

                          {open && (
                            <CardContent onClick={(e) => e.stopPropagation()} className="space-y-3">
                              <Input
                                value={a.name}
                                onChange={(e) => patchAmmo(w.id, a.id, { name: e.target.value })}
                                placeholder="Load name (optional)"
                              />

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <NumberInput
                                  id={`bw-${a.id}`}
                                  label="Bullet Weight (gr)"
                                  value={a.bulletWeightGr}
                                  onChange={(v) => patchAmmo(w.id, a.id, { bulletWeightGr: v })}
                                />
                                <NumberInput
                                  id={`mv-${a.id}`}
                                  label="Muzzle Velocity (m/s)"
                                  value={a.V0}
                                  onChange={(v) => patchAmmo(w.id, a.id, { V0: v })}
                                />
                                <div>
                                  <Label>Drag Model</Label>
                                  <Select
                                    value={a.model}
                                    onValueChange={(val) => patchAmmo(w.id, a.id, { model: val as any })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="G1">G1</SelectItem>
                                      <SelectItem value="G7">G7</SelectItem>
                                      <SelectItem value="noDrag">No Drag</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <NumberInput
                                  id={`bc-${a.id}`}
                                  label={`BC (${a.model})`}
                                  value={a.bc}
                                  step="0.001"
                                  onChange={(v) => patchAmmo(w.id, a.id, { bc: v })}
                                />
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <NumberInput
                                  id={`zero-${a.id}`}
                                  label="Zero Distance (m)"
                                  value={a.zeroDistanceM}
                                  onChange={(v) => patchAmmo(w.id, a.id, { zeroDistanceM: v })}
                                />
                                {/* ⛔️ Removed ammo-level Scope Height */}
                                <NumberInput
                                  id={`zt-${a.id}`}
                                  label="Zero Temp (°C)"
                                  value={a.zeroEnv.temperatureC}
                                  onChange={(v) =>
                                    patchAmmo(w.id, a.id, { zeroEnv: { ...a.zeroEnv, temperatureC: v } })
                                  }
                                />
                                <NumberInput
                                  id={`zp-${a.id}`}
                                  label="Zero Pressure (hPa)"
                                  value={a.zeroEnv.pressurehPa}
                                  onChange={(v) =>
                                    patchAmmo(w.id, a.id, { zeroEnv: { ...a.zeroEnv, pressurehPa: v } })
                                  }
                                />
                                <NumberInput
                                  id={`zh-${a.id}`}
                                  label="Zero Humidity (%)"
                                  value={a.zeroEnv.humidityPct}
                                  onChange={(v) =>
                                    patchAmmo(w.id, a.id, { zeroEnv: { ...a.zeroEnv, humidityPct: v } })
                                  }
                                />
                                <NumberInput
                                  id={`za-${a.id}`}
                                  label="Zero Altitude (m)"
                                  value={a.zeroEnv.altitudeM ?? 0}
                                  onChange={(v) =>
                                    patchAmmo(w.id, a.id, { zeroEnv: { ...a.zeroEnv, altitudeM: v } })
                                  }
                                />
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </CardContent>

              {/* Card footer: Add Ammo bottom-left */}
              <div className="px-6 pb-4 pt-3 border-t bg-muted/30 flex items-center justify-start">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    addAmmo(w.id);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Ammo
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
