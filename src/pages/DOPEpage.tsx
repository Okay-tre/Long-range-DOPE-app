import React, { useEffect } from "react";
import { useApp } from "../contexts/AppContext";
import type { Weapon, AmmoProfile } from "../lib/appState";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner@2.0.3";

const DEFAULT_ENV = { temperatureC: 15, pressurehPa: 1013, humidityPct: 50, altitudeM: 0 };

function NumberInput({
  id, label, value, onChange, step = "any", className = ""
}: {
  id: string; label: string; value: number;
  onChange: (v: number) => void; step?: string; className?: string;
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
    </div>
  );
}

export function EquipmentPage() {
  const { state, setState } = useApp();
  const { weapons, selectedWeaponId, selectedAmmoId } = state;

  /* ---------- one-time migration: ensure every ammo has zeroEnv ---------- */
  useEffect(() => {
    let changed = false;
    const fixed = weapons.map((w) => {
      const ammo = w.ammo.map((a) => {
        if (!a.zeroEnv) {
          changed = true;
          return { ...a, zeroEnv: { ...DEFAULT_ENV } };
        }
        // also backfill missing altitudeM
        if (a.zeroEnv.altitudeM === undefined) {
          changed = true;
          return { ...a, zeroEnv: { ...a.zeroEnv, altitudeM: 0 } };
        }
        return a;
      });
      return ammo !== w.ammo ? { ...w, ammo } : w;
    });
    if (changed) setState({ ...state, weapons: fixed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      scopeHeightMm: 35,
      zeroEnv: { ...DEFAULT_ENV },
    };
    setState({
      ...state,
      weapons: weapons.map((w) => (w.id === weaponId ? { ...w, ammo: [...w.ammo, a] } : w)),
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
    const nextAmmo = w.ammo.map((a) => (a.id === ammoId ? { ...a, ...patch, zeroEnv: { ...DEFAULT_ENV, ...(a.zeroEnv || {}), ...(patch.zeroEnv || {}) } } : a));
    patchWeapon(weaponId, { ammo: nextAmmo });
  };

  const saveAll = () => {
    setState({ ...state }); // triggers persistence
    toast.success("Equipment saved");
  };

  /* ---------------- render ---------------- */

  return (
    <div className="container max-w-6xl mx-auto p-3 space-y-4">
      {/* Header toolbar */}
      <div className="flex items-center justify-between">
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
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      addAmmo(w.id);
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Ammo
                  </Button>
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

                  <div>
                    <Label>Scope Units</Label>
                    <Select
                      value={w.scopeUnits}
                      onValueChange={(val) => patchWeapon(w.id, { scopeUnits: val as Weapon["scopeUnits"] })}
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
                </div>

                {/* Ammo list */}
                <div className="mt-4">
                  <h3 className="font-medium text-sm mb-2">Ammunition</h3>
                  {w.ammo.length === 0 && (
                    <div className="text-xs text-muted-foreground">No ammo yet. Click “Add Ammo”.</div>
                  )}
                  <div className="grid gap-2">
                    {w.ammo.map((a) => {
                      const open = selectedAmmoId === a.id;
                      const env = a.zeroEnv || DEFAULT_ENV; // <— guard!
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
                          </CardHeader>

                          {open && (
                            <CardContent onClick={(e) => e.stopPropagation()} className="space-y-3">
                              <Input
                                value={a.name}
                                onChange={(e) => patchAmmo(w.id, a.id, { name: e.target.value })}
                                placeholder="Load name (optional)"
                              />

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <NumberInput id={`bw-${a.id}`} label="Bullet Weight (gr)" value={a.bulletWeightGr}
                                  onChange={(v) => patchAmmo(w.id, a.id, { bulletWeightGr: v })}/>
                                <NumberInput id={`mv-${a.id}`} label="Muzzle Velocity (m/s)" value={a.V0}
                                  onChange={(v) => patchAmmo(w.id, a.id, { V0: v })}/>
                                <div>
                                  <Label>Drag Model</Label>
                                  <Select value={a.model} onValueChange={(val) => patchAmmo(w.id, a.id, { model: val as any })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="G1">G1</SelectItem>
                                      <SelectItem value="G7">G7</SelectItem>
                                      <SelectItem value="noDrag">No Drag</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <NumberInput id={`bc-${a.id}`} label={`BC (${a.model})`} value={a.bc} step="0.001"
                                  onChange={(v) => patchAmmo(w.id, a.id, { bc: v })}/>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <NumberInput id={`zero-${a.id}`} label="Zero Distance (m)" value={a.zeroDistanceM}
                                  onChange={(v) => patchAmmo(w.id, a.id, { zeroDistanceM: v })}/>
                                <NumberInput id={`sh-${a.id}`} label="Scope Height (mm)" value={a.scopeHeightMm}
                                  onChange={(v) => patchAmmo(w.id, a.id, { scopeHeightMm: v })}/>
                                <NumberInput id={`zt-${a.id}`} label="Zero Temp (°C)" value={env.temperatureC}
                                  onChange={(v) => patchAmmo(w.id, a.id, { zeroEnv: { ...env, temperatureC: v } })}/>
                                <NumberInput id={`zp-${a.id}`} label="Zero Pressure (hPa)" value={env.pressurehPa}
                                  onChange={(v) => patchAmmo(w.id, a.id, { zeroEnv: { ...env, pressurehPa: v } })}/>
                                <NumberInput id={`zh-${a.id}`} label="Zero Humidity (%)" value={env.humidityPct}
                                  onChange={(v) => patchAmmo(w.id, a.id, { zeroEnv: { ...env, humidityPct: v } })}/>
                                <NumberInput id={`za-${a.id}`} label="Zero Altitude (m)" value={env.altitudeM ?? 0}
                                  onChange={(v) => patchAmmo(w.id, a.id, { zeroEnv: { ...env, altitudeM: v } })}/>
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
