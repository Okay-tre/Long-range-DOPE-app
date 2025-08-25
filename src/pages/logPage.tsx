// src/pages/logPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../contexts/AppContext";
import { SessionManager } from "../components/SessionManager";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { toast } from "sonner@2.0.3";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

import { saveEntryHandler, type LogForm, type CalcSnapshot } from "./log.handlers";
import type { Weapon, AmmoProfile } from "../lib/appState";
import { calculateAirDensity } from "../utils/ballistics";

/* ---------- small presentational bits ---------- */

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm">{children}</span>
);

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

  // selections
  const selectedWeapon: Weapon | undefined = useMemo(() => {
    const byId = state.weapons.find((w) => w.id === state.selectedWeaponId);
    if (byId && byId.ammo?.length) return byId;
    return state.weapons.find((w) => w.ammo?.length) ?? state.weapons[0];
  }, [state.weapons, state.selectedWeaponId]);

  const selectedAmmo: AmmoProfile | undefined = useMemo(() => {
    if (!selectedWeapon) return undefined;
    const byId = selectedWeapon.ammo.find((a) => a.id === state.selectedAmmoId);
    return byId ?? selectedWeapon.ammo[0];
  }, [selectedWeapon, state.selectedAmmoId]);

  // scope display & click value (defaults if missing)
  const scopeUnits: "MIL" | "MOA" =
    (selectedWeapon?.scopeUnits as "MIL" | "MOA") ?? calculator.scopeUnits ?? "MIL";
  const scopeClick: number =
    (selectedWeapon as any)?.scopeClick ??
    (scopeUnits === "MIL" ? 0.1 : 0.25);

  // form state
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

  const [scopeElevation, setScopeElevation] = useState<string>("");
  const [scopeWindage, setScopeWindage] = useState<string>("");

  const [snapshot, setSnapshot] = useState<CalcSnapshot | null>(null);

  // Directional text fields for group placement (U/D and L/R)
  const [upField, setUpField] = useState<string>("");
  const [lrField, setLrField] = useState<string>("");

  // new session dialog
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionPlace, setNewSessionPlace] = useState("");

  // averages
  const sessionEntries = entries.filter((e) => e.sessionId === session?.id);
  const validGroups = sessionEntries.filter((e) => e.groupSizeCm && e.groupSizeCm > 0);
  const avgGroupSize = validGroups.length
    ? (validGroups.reduce((s, e) => s + (e.groupSizeCm as number), 0) / validGroups.length).toFixed(1)
    : null;

  // equipment pickers
  const handleSelectWeapon = (weaponId: string) => {
    const w = state.weapons.find((x) => x.id === weaponId);
    setState({
      ...state,
      selectedWeaponId: weaponId,
      selectedAmmoId: w?.ammo?.length
        ? (w.ammo.find((a) => a.id === state.selectedAmmoId)?.id ?? w.ammo[0].id)
        : undefined,
    });
  };
  const handleSelectAmmo = (ammoId: string) => setState({ ...state, selectedAmmoId: ammoId });

  // parse current scope reading
  const parseScopeReading = (reading: string) => {
    if (!reading.trim()) return null;
    const m = reading.trim().match(/^([UDLR])(\d*\.?\d*)$/i);
    if (!m) return null;
    const dir = m[1].toUpperCase();
    const val = parseFloat(m[2]);
    if (isNaN(val)) return null;
    return { direction: dir as "U" | "D" | "L" | "R", value: val };
  };

  useEffect(() => {
    const elev = parseScopeReading(scopeElevation);
    const wind = parseScopeReading(scopeWindage);

    if (calculator.scopeUnits === "MIL") {
      const up = elev ? (elev.direction === "U" ? elev.value : -elev.value) : null;
      const right = wind ? (wind.direction === "R" ? wind.value : -wind.value) : null;
      setLogForm((prev) => ({ ...prev, actualAdjMil: { up, right }, actualAdjMoa: { up: null, right: null } }));
    } else {
      const up = elev ? (elev.direction === "U" ? elev.value : -elev.value) : null;
      const right = wind ? (wind.direction === "R" ? wind.value : -wind.value) : null;
      setLogForm((prev) => ({ ...prev, actualAdjMoa: { up, right }, actualAdjMil: { up: null, right: null } }));
    }
  }, [scopeElevation, scopeWindage, calculator.scopeUnits]);

  // ensure session
  useEffect(() => {
    if (!session) {
      const s = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), title: "Default Session", place: "" };
      setState({ ...state, session: s });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // snapshot builder from current selection
  const buildSnapshotFromSelection = (): CalcSnapshot => {
    const w = selectedWeapon;
    const a = selectedAmmo;

    const V0 = a?.V0 ?? 800;
    const model = (a?.model ?? "G7") as "G1" | "G7" | "noDrag";
    const bcUsed = a?.bc ?? 0.25;
    const bulletWeightGr = a?.bulletWeightGr ?? 140;
    const scopeHeightMm = a?.scopeHeightMm ?? 35; // (still coming from ammo for now)
    const zeroDistanceM = a?.zeroDistanceM ?? 100;

    const temperature = (state.calculator as any)?.temperatureC ?? a?.zeroEnv?.temperatureC ?? 15;
    const humidity = (state.calculator as any)?.humidityPct ?? a?.zeroEnv?.humidityPct ?? 50;
    const windSpeed = (state.calculator as any)?.windSpeed ?? 0;
    const windDirection = (state.calculator as any)?.windDirection ?? 0;

    const rhoUsed = calculateAirDensity(temperature, humidity);

    return {
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
  };

  const handleUseCurrentSnapshot = () => {
    const snap = buildSnapshotFromSelection();
    setSnapshot(snap);
    setLogForm((prev) => ({ ...prev, rangeM: calculator?.X ?? prev.rangeM ?? snap.zeroDistanceM ?? 100 }));
    toast.success("Used current equipment & ammo");
  };

  // auto snapshot on selection change
  useEffect(() => {
    if (!selectedWeapon || !selectedAmmo) return;
    const snap = buildSnapshotFromSelection();
    setSnapshot(snap);
    setLogForm((prev) => ({ ...prev, rangeM: calculator?.X ?? prev.rangeM ?? snap.zeroDistanceM ?? 100 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.weapons, state.selectedWeaponId, state.selectedAmmoId]);

  // save entry
  const handleSaveEntry = () => {
    if (!session) return toast.error("No active session.");
    if (!snapshot) return toast.error("Please use current calculator snapshot first");
    try {
      saveEntryHandler(state, setState, session.id, logForm, snapshot);
      toast.success("Entry saved");
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
      setUpField("");
      setLrField("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save entry");
    }
  };

  const updateLogForm = <K extends keyof LogForm>(field: K, value: LogForm[K]) =>
    setLogForm((prev) => ({ ...prev, [field]: value }));

  // NEW: create-session handler (was missing)
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

  // helpers
  const formatCalculatedHold = (value: number) => {
    if (Math.abs(value) < 0.05) return "0.0";
    const dir = value > 0 ? "U" : "D";
    return `${dir}${Math.abs(value).toFixed(1)}`;
  };
  const formatCalculatedWindage = (value: number) => {
    if (Math.abs(value) < 0.05) return "0.0";
    const dir = value > 0 ? "L" : "R";
    return `${dir}${Math.abs(value).toFixed(1)}`;
  };

  // === Suggested Dial Strings (clicks) for the Scope Adjustment Calculator ===
  const computeDial = (unitsValue: number, axis: "elev" | "wind") => {
    const dirLetter =
      axis === "elev"
        ? unitsValue < 0 ? "D" : "U"
        : unitsValue < 0 ? "L" : "R";

    const clicks = Math.round(Math.abs(unitsValue) / Math.max(scopeClick, 1e-9));
    const human =
      axis === "elev"
        ? (dirLetter === "U" ? "UP" : "DOWN")
        : (dirLetter === "L" ? "LEFT" : "RIGHT");

    return {
      dirLetter,
      absUnits: Math.abs(unitsValue),
      clicks,
      dialStr: `${human} ${clicks} clicks`,
    };
  };

  // Precompute MIL/MOA values from offsets (same math you had before)
  const elevUnits =
    scopeUnits === "MIL"
      ? (-logForm.offsetUpCm * 10) / Math.max(logForm.rangeM || 0, 1)
      : (-logForm.offsetUpCm * 34.38) / Math.max(logForm.rangeM || 0, 1);

  const windUnits =
    scopeUnits === "MIL"
      ? (-logForm.offsetRightCm * 10) / Math.max(logForm.rangeM || 0, 1)
      : (-logForm.offsetRightCm * 34.38) / Math.max(logForm.rangeM || 0, 1);

  const elevDial = computeDial(elevUnits, "elev");
  const windDial = computeDial(windUnits, "wind");

  // ---------- Directional (U/D/L/R) parsing for group placement ----------
  const parseElevCm = (s: string): number | null => {
    const t = s.trim().toUpperCase();
    if (!t) return null;
    // Accept U/D prefixes or +/- sign or plain number
    let sign = 1;
    let rest = t;

    if (t[0] === "U") { sign = +1; rest = t.slice(1); }
    else if (t[0] === "D") { sign = -1; rest = t.slice(1); }
    else if (t[0] === "+") { sign = +1; rest = t.slice(1); }
    else if (t[0] === "-") { sign = -1; rest = t.slice(1); }

    const val = parseFloat(rest);
    if (!isFinite(val)) return null;
    return sign * val; // +up, -down (cm)
  };

  const parseWindCm = (s: string): number | null => {
    const t = s.trim().toUpperCase();
    if (!t) return null;
    let sign = 1;
    let rest = t;

    if (t[0] === "R") { sign = +1; rest = t.slice(1); }
    else if (t[0] === "L") { sign = -1; rest = t.slice(1); }
    else if (t[0] === "+") { sign = +1; rest = t.slice(1); }
    else if (t[0] === "-") { sign = -1; rest = t.slice(1); }

    const val = parseFloat(rest);
    if (!isFinite(val)) return null;
    return sign * val; // +right, -left (cm)
  };

  // Keep the directional text fields in sync with numeric state on mount/changes
  useEffect(() => {
    // Elevation label form: U5 / D3.2
    const up = logForm.offsetUpCm || 0;
    setUpField(up === 0 ? "" : `${up > 0 ? "U" : "D"}${Math.abs(up).toString()}`);
    // Windage label form: R4 / L1.5
    const lr = logForm.offsetRightCm || 0;
    setLrField(lr === 0 ? "" : `${lr > 0 ? "R" : "L"}${Math.abs(lr).toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on first mount so we don't fight user typing

  // Update numeric cm offsets when user types in U/D/L/R fields
  const onChangeUpField = (s: string) => {
    setUpField(s);
    const parsed = parseElevCm(s);
    if (parsed !== null) {
      updateLogForm("offsetUpCm", parsed);
    }
  };
  const onChangeLrField = (s: string) => {
    setLrField(s);
    const parsed = parseWindCm(s);
    if (parsed !== null) {
      updateLogForm("offsetRightCm", parsed);
    }
  };

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
            {avgGroupSize && <div className="text-xs">Avg Group: {avgGroupSize}cm ({validGroups.length} groups)</div>}
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
              <Button variant="outline" size="sm" className="text-xs px-2 py-1 ml-2">New Session</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Session</DialogTitle>
                <DialogDescription>Name and location (optional).</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Session Name</label>
                  <input className="w-full px-2 py-1 mt-1 border" value={newSessionTitle}
                         onChange={(e) => setNewSessionTitle(e.target.value)} placeholder="Enter session name" />
                </div>
                <div>
                  <label className="text-sm font-medium">Location/Place</label>
                  <input className="w-full px-2 py-1 mt-1 border" value={newSessionPlace}
                         onChange={(e) => setNewSessionPlace(e.target.value)} placeholder="e.g., Local Range" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateNewSession}>Create Session</Button>
                  <Button variant="outline" onClick={() => setShowNewSession(false)}>Cancel</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Equipment Quick Picker */}
      <section className="p-3 border bg-card">
        <h3 className="font-bold mb-3">Equipment</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Rifle</Label>
            <Select value={selectedWeapon?.id ?? ""} onValueChange={(val) => handleSelectWeapon(val)}>
              <SelectTrigger>
                <SelectValue placeholder={state.weapons.length ? "Select rifle..." : "No rifles saved"} />
              </SelectTrigger>
              <SelectContent>
                {state.weapons.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name || "Unnamed Rifle"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ammo / Load</Label>
            <Select
              value={selectedAmmo?.id ?? ""}
              onValueChange={(val) => handleSelectAmmo(val)}
              disabled={!selectedWeapon || !(selectedWeapon.ammo?.length)}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !selectedWeapon ? "Select a rifle first" :
                    (selectedWeapon.ammo?.length ? "Select ammo..." : "No ammo on this rifle")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {selectedWeapon?.ammo?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name || a.ammoName || "Load"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={handleUseCurrentSnapshot}>
            Use This Equipment Now
          </Button>
        </div>
      </section>

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
                <div className="text-xs font-medium mb-1 text-muted-foreground">Calculated Holds ({calculator.scopeUnits})</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <KV
                    k="Elevation"
                    v={formatCalculatedHold(
                      calculator.scopeUnits === "MIL" ? calculator.lastResult.holdMil : calculator.lastResult.holdMoa
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

      {/* Scope Adjustment Calculator (static) */}
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
                  {scopeUnits} Adjustments ({scopeClick} {scopeUnits}/click)
                </div>
                {/* Elevation */}
                <KVDark
                  k="Elevation"
                  v={`${elevUnits < 0 ? "D" : "U"}${Math.abs(elevUnits).toFixed(2)} • ${elevDial.dialStr}`}
                />
                {/* Windage */}
                <KVDark
                  k="Windage"
                  v={`${windUnits < 0 ? "L" : "R"}${Math.abs(windUnits).toFixed(2)} • ${windDial.dialStr}`}
                />
              </div>
            </div>
            <div className="mt-3 pt-2 px-3 py-2 bg-slate-700/50 border-t border-slate-600">
              <p className="text-sm text-slate-200 flex items-center gap-2">
                <span className="text-lg">💡</span>
                <span>
                  Adjustments based on group center offset at {logForm.rangeM}m range. Enter offsets like U5 or L4 to auto-parse.
                </span>
              </p>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <p className="text-slate-300 text-sm">Enter range and offset values in the form below to calculate scope adjustments</p>
            <p className="text-slate-400 text-xs mt-2">This calculator will show the exact {scopeUnits} adjustments and the dial in clicks</p>
          </div>
        )}
      </section>

      {/* Group form */}
      <section className="p-3 border bg-card">
        <h3 className="font-bold mb-3">Group Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <NumberInput label="Range (m)" value={logForm.rangeM} onChange={(rangeM) => updateLogForm("rangeM", rangeM || 0)} step="1" />
          <NumberInput label="Number of shots" value={logForm.shots} onChange={(shots) => updateLogForm("shots", shots || 5)} step="1" />

          {/* Updated to accept U/D */}
          <label className="flex flex-col gap-1">
            <Label>Offset up/down (cm)</Label>
            <input
              type="text"
              className="px-2 py-1 border"
              value={upField}
              onChange={(e) => onChangeUpField(e.target.value)}
              placeholder="e.g., U5.5 or D4 (cm)"
            />
          </label>

          {/* Updated to accept L/R */}
          <label className="flex flex-col gap-1">
            <Label>Offset left/right (cm)</Label>
            <input
              type="text"
              className="px-2 py-1 border"
              value={lrField}
              onChange={(e) => onChangeLrField(e.target.value)}
              placeholder="e.g., R4 or L2.5 (cm)"
            />
          </label>

          <NumberInput label="Group size (cm)" value={logForm.groupSizeCm} onChange={(v) => updateLogForm("groupSizeCm", v)} step="0.1" placeholder="Optional" />
        </div>

        <div className="mb-3 pt-3 border-t">
          <h4 className="font-medium mb-2">Current scope reading ({calculator.scopeUnits})</h4>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Elevation" value={scopeElevation} onChange={setScopeElevation} placeholder="e.g., U2.5 or D1.2" />
            <TextInput label="Windage" value={scopeWindage} onChange={setScopeWindage} placeholder="e.g., R0.8 or L3.1" />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            You can enter offsets with direction letters too: U/D for elevation, L/R for windage (e.g., U5, D3.2, R4, L0.6).
          </p>
        </div>

        <div className="mb-3">
          <TextAreaInput label="Notes" value={logForm.notes} onChange={(notes) => updateLogForm("notes", notes)} placeholder="Wind conditions, rifle position, etc..." />
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

        <button onClick={() => navigate("/calc")} className="px-6 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80">
          ← Back to Calculator
        </button>

        <button onClick={() => navigate("/dope")} className="px-6 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80">
          View DOPE →
        </button>
      </section>
    </div>
  );
}
