import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import type { Weapon, AmmoProfile, Environment } from "../lib/appState";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Wrench, Target, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner@2.0.3";

/** Small helper input */
function NumberInput({
  id, label, value, onChange, step = "any"
}: { id: string; label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function EquipmentPage() {
  const { state, setState } = useApp();

  // ------------------ Weapon helpers ------------------

  const addWeapon = () => {
    const newWeapon: Weapon = {
      id: crypto.randomUUID(),
      name: "New Rifle",
      scopeUnits: "MIL",
      barrelLengthIn: 20,
      twistRateIn: 8,
      ammo: [],
    };
    setState({ ...state, weapons: [...state.weapons, newWeapon], selectedWeaponId: newWeapon.id });
  };

  const removeWeapon = (id: string) => {
    const weapons = state.weapons.filter((w) => w.id !== id);
    setState({
      ...state,
      weapons,
      selectedWeaponId: weapons[0]?.id,
      selectedAmmoId: undefined,
    });
  };

  const updateWeapon = (id: string, patch: Partial<Weapon>) => {
    const weapons = state.weapons.map((w) => (w.id === id ? { ...w, ...patch } : w));
    setState({ ...state, weapons });
  };

  const selectedWeapon = state.weapons.find((w) => w.id === state.selectedWeaponId);

  // ------------------ Ammo helpers ------------------

  const addAmmo = () => {
    if (!selectedWeapon) return;
    const newAmmo: AmmoProfile = {
      id: crypto.randomUUID(),
      name: "New Load",
      ammoName: "",
      bulletWeightGr: 140,
      bc: 0.25,
      model: "G7",
      V0: 800,
      zeroDistanceM: 100,
      scopeHeightMm: 35,
      zeroEnv: { temperatureC: 15, pressurehPa: 1013, humidityPct: 50 },
    };
    const weapons = state.weapons.map((w) =>
      w.id === selectedWeapon.id ? { ...w, ammo: [...w.ammo, newAmmo] } : w
    );
    setState({ ...state, weapons, selectedAmmoId: newAmmo.id });
  };

  const removeAmmo = (ammoId: string) => {
    if (!selectedWeapon) return;
    const updated = selectedWeapon.ammo.filter((a) => a.id !== ammoId);
    updateWeapon(selectedWeapon.id, { ammo: updated });
    setState({ ...state, selectedAmmoId: updated[0]?.id });
  };

  const updateAmmo = (ammoId: string, patch: Partial<AmmoProfile>) => {
    if (!selectedWeapon) return;
    const updated = selectedWeapon.ammo.map((a) => (a.id === ammoId ? { ...a, ...patch } : a));
    updateWeapon(selectedWeapon.id, { ammo: updated });
  };

  const selectedAmmo = selectedWeapon?.ammo.find((a) => a.id === state.selectedAmmoId);

  const updateZeroEnv = (ammoId: string, patch: Partial<Environment>) => {
    if (!selectedAmmo) return;
    updateAmmo(ammoId, { zeroEnv: { ...selectedAmmo.zeroEnv, ...patch } });
  };

  // ------------------ Render ------------------

  return (
    <div className="container max-w-6xl mx-auto p-3 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">Equipment & Ammunition</h1>
        </div>
        <Button onClick={addWeapon} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Rifle
        </Button>
      </div>

      {/* Weapons List */}
      <div className="grid gap-3">
        {state.weapons.map((weapon) => (
          <Card
            key={weapon.id}
            className={`cursor-pointer ${state.selectedWeaponId === weapon.id ? "ring-2 ring-primary" : ""}`}
            onClick={() => setState({ ...state, selectedWeaponId: weapon.id })}
          >
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle className="text-base">{weapon.name}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  removeWeapon(weapon.id);
                  toast.success("Weapon removed");
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardHeader>
            {state.selectedWeaponId === weapon.id && (
              <CardContent className="space-y-3">
                <Input
                  value={weapon.name}
                  onChange={(e) => updateWeapon(weapon.id, { name: e.target.value })}
                  placeholder="Rifle name"
                />
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    id={`barrel-${weapon.id}`}
                    label="Barrel Length (in)"
                    value={weapon.barrelLengthIn}
                    onChange={(v) => updateWeapon(weapon.id, { barrelLengthIn: v })}
                  />
                  <NumberInput
                    id={`twist-${weapon.id}`}
                    label="Twist Rate (in)"
                    value={weapon.twistRateIn}
                    onChange={(v) => updateWeapon(weapon.id, { twistRateIn: v })}
                  />
                </div>
                <div>
                  <Label>Scope Units</Label>
                  <Select
                    value={weapon.scopeUnits}
                    onValueChange={(value) => updateWeapon(weapon.id, { scopeUnits: value as any })}
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

                {/* Ammo List */}
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-sm">Ammunition</h3>
                    <Button onClick={addAmmo} size="xs">
                      <Plus className="h-3 w-3 mr-1" /> Add Ammo
                    </Button>
                  </div>
                  {weapon.ammo.map((ammo) => (
                    <Card
                      key={ammo.id}
                      className={`mb-2 cursor-pointer ${state.selectedAmmoId === ammo.id ? "ring-2 ring-primary" : ""}`}
                      onClick={() => setState({ ...state, selectedAmmoId: ammo.id })}
                    >
                      <CardHeader className="flex flex-row justify-between items-center">
                        <CardTitle className="text-sm">{ammo.name || ammo.ammoName}</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAmmo(ammo.id);
                            toast.success("Ammo removed");
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardHeader>
                      {state.selectedAmmoId === ammo.id && (
                        <CardContent className="space-y-3">
                          <Input
                            value={ammo.name}
                            onChange={(e) => updateAmmo(ammo.id, { name: e.target.value })}
                            placeholder="Load name"
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <NumberInput
                              id={`bw-${ammo.id}`}
                              label="Bullet Weight (gr)"
                              value={ammo.bulletWeightGr}
                              onChange={(v) => updateAmmo(ammo.id, { bulletWeightGr: v })}
                            />
                            <NumberInput
                              id={`mv-${ammo.id}`}
                              label="Muzzle Velocity (m/s)"
                              value={ammo.V0}
                              onChange={(v) => updateAmmo(ammo.id, { V0: v })}
                            />
                          </div>
                          <div>
                            <Label>Drag Model</Label>
                            <Select
                              value={ammo.model}
                              onValueChange={(value) => updateAmmo(ammo.id, { model: value as any })}
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
                            id={`bc-${ammo.id}`}
                            label={`Ballistic Coefficient (${ammo.model})`}
                            value={ammo.bc}
                            onChange={(v) => updateAmmo(ammo.id, { bc: v })}
                            step="0.001"
                          />
                          <NumberInput
                            id={`zr-${ammo.id}`}
                            label="Zero Distance (m)"
                            value={ammo.zeroDistanceM}
                            onChange={(v) => updateAmmo(ammo.id, { zeroDistanceM: v })}
                          />
                          <NumberInput
                            id={`sh-${ammo.id}`}
                            label="Scope Height (mm)"
                            value={ammo.scopeHeightMm}
                            onChange={(v) => updateAmmo(ammo.id, { scopeHeightMm: v })}
                          />

                          {/* Zero Env */}
                          <div className="grid grid-cols-2 gap-3 border-t pt-2">
                            <h4 className="col-span-2 font-medium text-sm">Zero Environment</h4>
                            <NumberInput
                              id={`zt-${ammo.id}`}
                              label="Temp (°C)"
                              value={ammo.zeroEnv.temperatureC}
                              onChange={(v) => updateZeroEnv(ammo.id, { temperatureC: v })}
                            />
                            <NumberInput
                              id={`zp-${ammo.id}`}
                              label="Pressure (hPa)"
                              value={ammo.zeroEnv.pressurehPa}
                              onChange={(v) => updateZeroEnv(ammo.id, { pressurehPa: v })}
                            />
                            <NumberInput
                              id={`zh-${ammo.id}`}
                              label="Humidity (%)"
                              value={ammo.zeroEnv.humidityPct}
                              onChange={(v) => updateZeroEnv(ammo.id, { humidityPct: v })}
                            />
                            <NumberInput
                              id={`za-${ammo.id}`}
                              label="Altitude (m)"
                              value={ammo.zeroEnv.altitudeM ?? 0}
                              onChange={(v) => updateZeroEnv(ammo.id, { altitudeM: v })}
                            />
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
