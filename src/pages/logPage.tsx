import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../contexts/AppContext";
import { SessionManager } from "../components/SessionManager";
import { PresetSelectors } from "../components/PresetSelectors";
import { EquipmentManager } from "../components/EquipmentManager";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Collapsible, CollapsibleContent } from "../components/ui/collapsible";
import { toast } from "sonner@2.0.3";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

// keep your existing handlers/types
import { makeSnapshotFromCalculator, saveEntryHandler, type LogForm, type CalcSnapshot } from "./log.handlers";

import type { Weapon, AmmoProfile } from "../lib/appState";
import { calculateAirDensity } from "../utils/ballistics";

/* ---------- small presentational bits ---------- */

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm">{children}</span>
);

// Quick equipment selectors use global state so the calculator + snapshot stay in sync
const weaponsList = state.weapons;

const handleSelectWeapon = (weaponId: string) => {
  const w = weaponsList.find(w => w.id === weaponId);
  setState({
    ...state,
    selectedWeaponId: weaponId,
    // default to first ammo on weapon (or keep current if it belongs to this weapon)
    selectedAmmoId: w?.ammo?.length ? (w.ammo.find(a => a.id === state.selectedAmmoId)?.id ?? w.ammo[0].id) : undefined,
  });
};

const handleSelectAmmo = (ammoId: string) => {
  setState({ ...state, selectedAmmoId: ammoId });
};

function NumberInput({
  label, value, onChange, step = "any", placeholder,
}: { label: string; value: number | null | undefined; onChange: (n: number | null) => void; step?: string; placeholder?: string }) {
  const displayValue = value !== null && value !== undefined ? value.toString() : "";
  return (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      <input
        type="number"
        className="px-2 py-1 border"
        value={displayValue}
        onChange={(e) => {
          const inputValue = e.target.value;
          if (inputValue === "") onChange(null);
          else {
            const num = Number(inputValue);
            onChange(isNaN(num) ? null : num);
          }
        }}
        step={step}
        placeholder={placeholder}
      />
    </label>
  );
}

function TextInput({
  label, value, onChange, placeholder,
}: { label: string; value: string | undefined; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      <input
        type="text"
        className="px-2 py-1 border"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function TextAreaInput({
  label, value, onChange, placeholder,
}: { label: string; value: string | undefined; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      <textarea
        className="px-2 py-1 border resize-none"
        rows={3}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between bg-card px-2 py-1 border">
      <span className="text-xs">{k}</span>
      <span className="font-mono text-xs">{v}</span>
    </div>
  );
}

function KVDark({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between px-3 py-2 bg-slate-700">
      <span className="text-sm font-medium text-white">{k}</span>
      <span className="font-mono text-sm text-white">{v}</span>
    </div>
  );
}

/* ---------- page ---------- */

export function LogPage() {
  const { state, setState, navigate } = useApp();
  const { session, calculator, entries } = state;

  // ---------------- selection helpers (robust, with fallbacks) ----------------
  const selectedWeapon: Weapon | undefined = useMemo(() => {
    const byId = state.weapons.find(w => w.id === state.selectedWeaponId);
    if (byId && byId.ammo?.length) return byId;
    // fallback: first weapon with ammo, or first weapon
    return state.weapons.find(w => w.ammo?.length) ?? state.weapons[0];
  }, [state.weapons, state.selectedWeaponId]);

  const selectedAmmo: AmmoProfile | undefined = useMemo(() => {
    if (!selectedWeapon) return undefined;
    const byId = selectedWeapon.ammo.find(a => a.id === state.selectedAmmoId);
    return byId ?? selectedWeapon.ammo[0];
  }, [selectedWeapon, state.selectedAmmoId]);

  // ---------------- form state ----------------
  const [logForm, setLogForm] = useState<LogForm>({
    rangeM: calculator?.X ?? 300,
    offsetUpCm: 0,
    offsetRightCm: 0,
    groupSizeCm: null,
    shots: 5,
    notes: "",
    actualAdjMil: { up: null, right: null },
    actualAdjMoa: { up: null, right: null },
  });

  // Simple scope reading strings (e.g., "U2.5", "D1.2", "L0.8", "R3.1")
  const [scopeElevation, setScopeElevation] = useState<string>("");
  const [scopeWindage, setScopeWindage] = useState<string>("");
  
      {/* Equipment Quick Picker */}
      <section className="p-3 border bg-card">
        <h3 className="font-bold mb-3">Equipment</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Rifle select */}
          <div>
            <Label>Rifle</Label>
            <Select
              value={selectedWeapon?.id ?? ""}
              onValueChange={(val) => handleSelectWeapon(val)}
            >
              <SelectTrigger>
                <SelectValue placeholder={weaponsList.length ? "Select rifle..." : "No rifles saved"} />
              </SelectTrigger>
              <SelectContent>
                {weaponsList.map(w => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name || "Unnamed Rifle"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
      
          {/* Ammo select (depends on selected rifle) */}
          <div>
            <Label>Ammo / Load</Label>
            <Select
              value={selectedAmmo?.id ?? ""}
              onValueChange={(val) => handleSelectAmmo(val)}
              disabled={!selectedWeapon || !(selectedWeapon.ammo?.length)}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={!selectedWeapon
                    ? "Select a rifle first"
                    : (selectedWeapon.ammo?.length ? "Select ammo..." : "No ammo on this rifle")}
                />
              </SelectTrigger>
              <SelectContent>
                {selectedWeapon?.ammo?.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name || a.ammoName || "Load"}{/* show friendly name */}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      
        {/* Optional: button to force-refresh snapshot immediately */}
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={handleUseCurrentSnapshot}>
            Use This Equipment Now
          </Button>
        </div>
      </section>
  // snapshot we render in the “Calculator Snapshot” card
  const [snapshot, setSnapshot] = useState<CalcSnapshot | null>(null);

  // new session dialog
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionPlace, setNewSessionPlace] = useState("");

  // presets panel toggle
  const [showPresetManager, setShowPresetManager] = useState(false);

  // ---------------- averages for header ----------------
  const sessionEntries = entries.filter(e => e.sessionId === session?.id);
  const validGroups = sessionEntries.filter(e => e.groupSizeCm && e.groupSizeCm > 0);
  const avgGroupSize = validGroups.length
    ? (validGroups.reduce((s, e) => s + (e.groupSizeCm as number), 0) / validGroups.length).toFixed(1)
    : null;

  // ---------------- scope reading parsing ----------------
  const parseScopeReading = (reading: string) => {
    if (!reading.trim()) return null;
    const m = reading.trim().match(/^([UDLR])(\d*\.?\d*)$/i);
    if (!m) return null;
    const dir = m[1].toUpperCase();
    const val = parseFloat(m[2]);
    if (isNaN(val)) return null;
    return { direction: dir as "U"|"D"|"L"|"R", value: val };
  };

  useEffect(() => {
    const elev = parseScopeReading(scopeElevation);
    const wind = parseScopeReading(scopeWindage);

    if (calculator.scopeUnits === "MIL") {
      const up = elev ? (elev.direction === "U" ? elev.value : -elev.value) : null;
      const right = wind ? (wind.direction === "R" ? wind.value : -wind.value) : null;
      setLogForm(prev => ({ ...prev, actualAdjMil: { up, right }, actualAdjMoa: { up: null, right: null } }));
    } else {
      const up = elev ? (elev.direction === "U" ? elev.value : -elev.value) : null;
      const right = wind ? (wind.direction === "R" ? wind.value : -wind.value) : null;
      setLogForm(prev => ({ ...prev, actualAdjMoa: { up, right }, actualAdjMil: { up: null, right: null } }));
    }
  }, [scopeElevation, scopeWindage, calculator.scopeUnits]);

  // ---------------- ensure we have a session ----------------
  useEffect(() => {
    if (!session) {
      const s = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        title: "Default Session",
        place: ""
      };
      setState({ ...state, session: s });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ---------------- robust snapshot builder (uses selection + safe fallbacks) ----------------
  const buildSnapshotFromSelection = (): CalcSnapshot => {
    const w = selectedWeapon;
    const a = selectedAmmo;

    const V0 = a?.V0 ?? 800;
    const model = (a?.model ?? "G7") as "G1" | "G7" | "noDrag";
    const bcUsed = a?.bc ?? 0.25;
    const bulletWeightGr = a?.bulletWeightGr ?? 140;
    const scopeHeightMm = a?.scopeHeightMm ?? 35;
    const zeroDistanceM = a?.zeroDistanceM ?? 100;

    // Prefer calculator live env if present; fallback to ammo zero env; else constants
    const temperature = (state.calculator as any)?.temperatureC ?? a?.zeroEnv?.temperatureC ?? 15;
    const humidity = (state.calculator as any)?.humidityPct ?? a?.zeroEnv?.humidityPct ?? 50;
    const windSpeed = (state.calculator as any)?.windSpeed ?? 0;
    const windDirection = (state.calculator as any)?.windDirection ?? 0;

    const rhoUsed = calculateAirDensity(temperature, humidity);

    const snap: CalcSnapshot = {
      firearmName: w?.name ?? "—",
      ammoName: a?.name || a?.ammoName || "—",
      V0,
      model,
      bcUsed,
      bulletWeightGr,
      y0Cm: scopeHeightMm / 10,
      zeroDistanceM,
      temperature,
      humidity,
      windSpeed,
      windDirection,
      barrelLengthIn: w?.barrelLengthIn ?? 20,
      twistRateIn: w?.twistRateIn ?? 8,
      rhoUsed,
    };
    return snap;
  };

  // “Use current settings” button
  const handleUseCurrentSnapshot = () => {
    const snap = buildSnapshotFromSelection();
    setSnapshot(snap);
    setLogForm(prev => ({
      ...prev,
      rangeM: calculator?.X ?? prev.rangeM ?? snap.zeroDistanceM ?? 100,
    }));
    toast.success("Used current equipment & ammo");
  };

  // auto-load snapshot on first render and whenever selection/equipment changes
  useEffect(() => {
    const hasSomething = !!selectedWeapon && !!selectedAmmo;
    if (!hasSomething) return;
    setSnapshot(buildSnapshotFromSelection());
    // also default the range to calculator X if present
    setLogForm(prev => ({ ...prev, rangeM: calculator?.X ?? prev.rangeM ?? (snapshot?.zeroDistanceM ?? 100) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.weapons, state.selectedWeaponId, state.selectedAmmoId]);

  // ---------------- save entry ----------------
  const handleSaveEntry = () => {
    if (!session) {
      toast.error("No active session. Please wait for session to be created.");
      return;
    }
    if (!snapshot) {
      toast.error("Please use current calculator snapshot first");
      return;
    }
    try {
      saveEntryHandler(state, setState, session.id, logForm, snapshot);
      toast.success("Entry saved successfully");

      // reset user inputs but keep range (nice UX)
      setLogForm({
        rangeM: calculator?.X ?? logForm.rangeM ?? snapshot.zeroDistanceM ?? 100,
        offsetUpCm: 0,
        offsetRightCm: 0,
        groupSizeCm: null,
        shots: 5,
        notes: "",
        actualAdjMil: { up: null, right: null },
        actualAdjMoa: { up: null, right: null },
      });
      setScopeElevation("");
      setScopeWindage("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save entry");
    }
  };

  const updateLogForm = <K extends keyof LogForm>(field: K, value: LogForm[K]) => {
    setLogForm(prev => ({ ...prev, [field]: value }));
  };

  // ---------------- new session dialog ----------------
  const handleCreateNewSession = () => {
    const s = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      title: newSessionTitle.trim() || "New Session",
      place: newSessionPlace.trim() || "",
    };
    setState({ ...state, session: s });
    setNewSessionTitle("");
    setNewSessionPlace("");
    setShowNewSession(false);
    toast.success("New session created");
  };

  // ---------------- display helpers ----------------
  const formatCalculatedHold = (value: number, units: 'MIL' | 'MOA') => {
    if (Math.abs(value) < 0.05) return "0.0";
    const dir = value > 0 ? 'U' : 'D';
    return `${dir}${Math.abs(value).toFixed(1)}`;
  };
  const formatCalculatedWindage = (value: number) => {
    if (Math.abs(value) < 0.05) return "0.0";
    const dir = value > 0 ? 'L' : 'R';
    return `${dir}${Math.abs(value).toFixed(1)}`;
  };

  // ---------------- loading state ----------------
  if (!session) {
    return (
      <div className="container max-w-3xl mx-auto p-4">
        <div className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">Initializing session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl mx-auto p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Add Group</h2>
        <div className="text-sm text-muted-foreground">
          <div className="flex flex-col items-end gap-1">
            <div>{session.place ? `${session.title} @ ${session.place}` : session.title}</div>
            {avgGroupSize && (
              <div className="text-xs">Avg Group: {avgGroupSize}cm ({validGroups.length} groups)</div>
            )}
          </div>
        </div>
      </div>

      {/* Session management */}
      <div className="p-2 border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <SessionManager compact={true} showNewSession={false} />
          </div>
          <Dialog open={showNewSession} onOpenChange={setShowNewSession}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs px-2 py-1 ml-2">
                New Session
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Session</DialogTitle>
                <DialogDescription>Name and location (optional).</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Session Name</label>
                  <input
                    className="w-full px-2 py-1 mt-1 border"
                    value={newSessionTitle}
                    onChange={(e) => setNewSessionTitle(e.target.value)}
                    placeholder="Enter session name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Location/Place</label>
                  <input
                    className="w-full px-2 py-1 mt-1 border"
                    value={newSessionPlace}
                    onChange={(e) => setNewSessionPlace(e.target.value)}
                    placeholder="e.g., Local Range"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateNewSession}>Create Session</Button>
                  <Button variant="outline" onClick={() => setShowNewSession(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick presets */}
      <div className="p-3 border bg-card">
        <PresetSelectors onManagePresets={() => setShowPresetManager(s => !s)} />
      </div>

      {/* Equipment manager (collapsible) */}
      <Collapsible open={showPresetManager} onOpenChange={setShowPresetManager}>
        <CollapsibleContent>
          <div className="p-3 border bg-card">
            <EquipmentManager showInCalculator={true} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Calculator Snapshot */}
      <section className="p-3 border bg-muted">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">Calculator Snapshot</h3>
          <button
            onClick={handleUseCurrentSnapshot}
            className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80"
          >
            Use Current Settings
          </button>
        </div>

        {snapshot && (
          <>
            {(snapshot.firearmName || snapshot.ammoName) && (
              <div className="mb-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {snapshot.firearmName && <KV k="Firearm" v={snapshot.firearmName} />}
                  {snapshot.ammoName && <KV k="Ammunition" v={snapshot.ammoName} />}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-2">
              <KV k="V₀" v={`${Math.round(snapshot.V0)} m/s`} />
              <KV k="Model" v={snapshot.model} />
              <KV k="BC" v={snapshot.bcUsed.toString()} />
              <KV k="Bullet Weight" v={`${snapshot.bulletWeightGr}gr`} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-2 gap-2 text-sm mb-2">
              <KV k="Air density" v={`${snapshot.rhoUsed.toFixed(3)} kg/m³`} />
              <KV k="Height over bore" v={`${snapshot.y0Cm}cm`} />
            </div>

            {calculator.lastResult && (
              <div className="mb-2 pt-2 border-t">
                <div className="text-xs font-medium mb-1 text-muted-foreground">
                  Calculated Holds ({calculator.scopeUnits})
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <KV
                    k="Elevation"
                    v={formatCalculatedHold(
                      calculator.scopeUnits === "MIL" ? calculator.lastResult.holdMil : calculator.lastResult.holdMoa,
                      calculator.scopeUnits
                    )}
                  />
                  <KV
                    k="Windage"
                    v={
                      calculator.lastResult.windDrift
                        ? formatCalculatedWindage(
                            calculator.scopeUnits === "MIL"
                              ? (calculator.lastResult.windDrift / calculator.X) * 1000
                              : (calculator.lastResult.windDrift / calculator.X) * 3438
                          )
                        : "0.0"
                    }
                  />
                </div>
              </div>
            )}

            <div className="mb-2 pt-2 border-t">
              <div className="text-xs font-medium mb-1 text-muted-foreground">Weather Conditions</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <KV k="Temperature" v={`${snapshot.temperature}°C`} />
                <KV k="Humidity" v={`${snapshot.humidity}%`} />
                <KV k="Wind Speed" v={`${snapshot.windSpeed} m/s`} />
                <KV k="Wind Direction" v={`${snapshot.windDirection}°`} />
              </div>
            </div>

            <div className="pt-2 border-t">
              <div className="grid grid-cols-2 md:grid-cols-2 gap-2 text-sm">
                <KV k="Barrel" v={`${snapshot.barrelLengthIn}" (${(snapshot.barrelLengthIn * 2.54).toFixed(1)}cm)`} />
                <KV k="Twist rate" v={`1:${snapshot.twistRateIn}"`} />
              </div>
            </div>
          </>
        )}
      </section>

      {/* Static Scope Adjustment Calculator */}
      <section className="p-4 bg-slate-800 text-white border border-slate-600 calculation-results-section">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xl">🎯</span>
          <h3 className="font-bold text-white text-lg">Scope Adjustment Calculator</h3>
        </div>

        {logForm.rangeM > 0 && (logForm.offsetUpCm !== 0 || logForm.offsetRightCm !== 0) ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-white mb-1 uppercase tracking-wide">
                  {calculator.scopeUnits} Adjustments
                </div>
                {/* Elevation */}
                <KVDark
                  k="Elevation"
                  v={
                    calculator.scopeUnits === "MIL"
                      ? `${(-logForm.offsetUpCm * 10) / logForm.rangeM < 0 ? "D" : "U"}${Math.abs(
                          (-logForm.offsetUpCm * 10) / logForm.rangeM
                        ).toFixed(2)}`
                      : `${(-logForm.offsetUpCm * 34.38) / logForm.rangeM < 0 ? "D" : "U"}${Math.abs(
                          (-logForm.offsetUpCm * 34.38) / logForm.rangeM
                        ).toFixed(2)}`
                  }
                />
                {/* Windage */}
                <KVDark
                  k="Windage"
                  v={
                    calculator.scopeUnits === "MIL"
                      ? `${(-logForm.offsetRightCm * 10) / logForm.rangeM < 0 ? "L" : "R"}${Math.abs(
                          (-logForm.offsetRightCm * 10) / logForm.rangeM
                        ).toFixed(2)}`
                      : `${(-logForm.offsetRightCm * 34.38) / logForm.rangeM < 0 ? "L" : "R"}${Math.abs(
                          (-logForm.offsetRightCm * 34.38) / logForm.rangeM
                        ).toFixed(2)}`
                  }
                />
              </div>
            </div>
            <div className="mt-3 pt-2 px-3 py-2 bg-slate-700/50 border-t border-slate-600">
              <p className="text-sm text-slate-200 flex items-center gap-2">
                <span className="text-lg">💡</span>
                <span>
                  Adjustments based on group center offset at {logForm.rangeM}m range. Positive values indicate upward/rightward
                  corrections needed.
                </span>
              </p>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <p className="text-slate-300 text-sm">
              Enter range and offset values in the form below to calculate scope adjustments
            </p>
            <p className="text-slate-400 text-xs mt-2">
              This calculator will show you the exact {calculator.scopeUnits} adjustments needed for your scope
            </p>
          </div>
        )}
      </section>

      {/* Group Information Form */}
      <section className="p-3 border bg-card">
        <h3 className="font-bold mb-3">Group Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <NumberInput
            label="Range (m)"
            value={logForm.rangeM}
            onChange={(rangeM) => updateLogForm("rangeM", rangeM || 0)}
            step="1"
          />
          <NumberInput
            label="Number of shots"
            value={logForm.shots}
            onChange={(shots) => updateLogForm("shots", shots || 5)}
            step="1"
          />
          <NumberInput
            label="Offset up/down (cm)"
            value={logForm.offsetUpCm}
            onChange={(offsetUpCm) => updateLogForm("offsetUpCm", offsetUpCm || 0)}
            step="0.1"
            placeholder="+ high, - low"
          />
          <NumberInput
            label="Offset left/right (cm)"
            value={logForm.offsetRightCm}
            onChange={(offsetRightCm) => updateLogForm("offsetRightCm", offsetRightCm || 0)}
            step="0.1"
            placeholder="+ right, - left"
          />
          <NumberInput
            label="Group size (cm)"
            value={logForm.groupSizeCm}
            onChange={(groupSizeCm) => updateLogForm("groupSizeCm", groupSizeCm)}
            step="0.1"
            placeholder="Optional"
          />
        </div>

        {/* current scope reading */}
        <div className="mb-3 pt-3 border-t">
          <h4 className="font-medium mb-2">Current scope reading ({calculator.scopeUnits})</h4>
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              label="Elevation"
              value={scopeElevation}
              onChange={setScopeElevation}
              placeholder="e.g., U2.5 or D1.2"
            />
            <TextInput
              label="Windage"
              value={scopeWindage}
              onChange={setScopeWindage}
              placeholder="e.g., R0.8 or L3.1"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Enter scope adjustments as U/D for elevation and L/R for windage (e.g., "U2.5", "D1.2", "L0.8", "R3.1")
          </p>
        </div>

        <div className="mb-3">
          <TextAreaInput
            label="Notes"
            value={logForm.notes}
            onChange={(notes) => updateLogForm("notes", notes)}
            placeholder="Wind conditions, rifle position, etc..."
          />
        </div>
      </section>

      {/* Actions */}
      <section className="flex gap-3">
        <button
          onClick={handleSaveEntry}
          disabled={!snapshot || logForm.rangeM <= 0}
          className="px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Entry
        </button>

        <button
          onClick={() => navigate("/calc")}
          className="px-6 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          ← Back to Calculator
        </button>

        <button
          onClick={() => navigate("/dope")}
          className="px-6 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          View DOPE →
        </button>
      </section>
    </div>
  );
}
