import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../contexts/AppContext";

// keep your existing handlers for session + saving
import { makeSnapshotFromCalculator, saveEntryHandler, type LogForm, type CalcSnapshot } from "./log.handlers";
import { newSession } from "./dope.handlers";

// UI bits you already use
import { SessionManager } from "../components/SessionManager";
import { PresetSelectors } from "../components/PresetSelectors";
import { EquipmentManager } from "../components/EquipmentManager";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Collapsible, CollapsibleContent } from "../components/ui/collapsible";
import { toast } from "sonner@2.0.3";

// 🆕 physics-based corrections (uses calcEngine + drag tables)
import { suggestScopeCorrection } from "../lib/corrections";

// simple label helper
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
          if (inputValue === "") {
            onChange(null);
          } else {
            const numValue = Number(inputValue);
            onChange(isNaN(numValue) ? null : numValue);
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

export function LogPage() {
  const { state, setState, navigate } = useApp();
  const { session, calculator, entries } = state;

  // 🔗 Selected weapon + ammo (needed for real solver)
  const weapon = state.weapons?.find((w) => w.id === state.selectedWeaponId);
  const ammo = weapon?.ammo?.find((a) => a.id === state.selectedAmmoId);

  // Form state
  const [logForm, setLogForm] = useState<LogForm>({
    rangeM: 300,
    offsetUpCm: 0,
    offsetRightCm: 0,
    groupSizeCm: null,
    shots: 5,
    notes: "",
    actualAdjMil: { up: null, right: null },
    actualAdjMoa: { up: null, right: null },
  });

  // Scope readings (U/D/L/R strings)
  const [scopeElevation, setScopeElevation] = useState<string>("");
  const [scopeWindage, setScopeWindage] = useState<string>("");

  const [snapshot, setSnapshot] = useState<CalcSnapshot | null>(null);

  // Preset manager state
  const [showPresetManager, setShowPresetManager] = useState(false);

  // New session modal
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionPlace, setNewSessionPlace] = useState("");

  // Session stats
  const sessionEntries = entries.filter((e) => e.sessionId === session?.id);
  const validGroups = sessionEntries.filter((e) => e.groupSizeCm && e.groupSizeCm > 0);
  const avgGroupSize =
    validGroups.length > 0
      ? (validGroups.reduce((sum, e) => sum + (e.groupSizeCm || 0), 0) / validGroups.length).toFixed(1)
      : null;

  // Parse "U2.5" style input
  const parseScopeReading = (reading: string) => {
    if (!reading.trim()) return null;
    const match = reading.trim().match(/^([UDLR])(\d*\.?\d*)$/i);
    if (!match) return null;
    const direction = match[1].toUpperCase();
    const value = parseFloat(match[2]);
    if (isNaN(value)) return null;
    return { direction, value };
  };

  // Convert scope readings → form values (actualAdj*)
  useEffect(() => {
    const elevationReading = parseScopeReading(scopeElevation);
    const windageReading = parseScopeReading(scopeWindage);

    if (calculator.scopeUnits === "MIL") {
      const elev = elevationReading ? (elevationReading.direction === "U" ? elevationReading.value : -elevationReading.value) : null;
      const wind = windageReading ? (windageReading.direction === "R" ? windageReading.value : -windageReading.value) : null;
      setLogForm((prev) => ({ ...prev, actualAdjMil: { up: elev, right: wind }, actualAdjMoa: { up: null, right: null } }));
    } else {
      const elev = elevationReading ? (elevationReading.direction === "U" ? elevationReading.value : -elevationReading.value) : null;
      const wind = windageReading ? (windageReading.direction === "R" ? windageReading.value : -windageReading.value) : null;
      setLogForm((prev) => ({ ...prev, actualAdjMoa: { up: elev, right: wind }, actualAdjMil: { up: null, right: null } }));
    }
  }, [scopeElevation, scopeWindage, calculator.scopeUnits]);

  // Ensure a session exists
  useEffect(() => {
    if (!session) {
      const s = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), title: "Default Session", place: "" };
      setState({ ...state, session: s });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Take a calculator snapshot
  const handleUseCurrentSnapshot = () => {
    const newSnapshot = makeSnapshotFromCalculator(state);
    setSnapshot(newSnapshot);
    setLogForm((prev) => ({ ...prev, rangeM: calculator.X }));
    toast.success("Used current calculator settings");
  };

  useEffect(() => {
    if (!snapshot) handleUseCurrentSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateLogForm = (field: keyof LogForm, value: any) => setLogForm((p) => ({ ...p, [field]: value }));

  const handleNewSession = () => {
    newSession(state, setState, newSessionTitle.trim() || undefined, newSessionPlace.trim() || undefined);
    setNewSessionTitle("");
    setNewSessionPlace("");
    toast.success("New session created");
  };

  // ==== 🧠 Physics-based suggestion (memoized) ====
  // Build "current environment" from snapshot if available; fall back to reasonable defaults.
  const envNow = useMemo(() => {
    const t = snapshot?.temperature ?? 20;
    const h = snapshot?.humidity ?? 50;
    // If you store pressure/altitude elsewhere, wire them here. Defaults are fine if not present.
    const pressure = 1013;
    const altitude = 0;
    return { temperatureC: t, humidityPct: h, pressurehPa: pressure, altitudeM: altitude };
  }, [snapshot]);

  const windSpeed = snapshot?.windSpeed ?? 0;
  const windAngle = snapshot?.windDirection ?? 90;

  const suggestion = useMemo(() => {
    if (!weapon || !ammo || !logForm.rangeM || logForm.rangeM <= 0) return null;
    try {
      return suggestScopeCorrection({
        ammo,
        env: envNow,
        rangeM: logForm.rangeM,
        windSpeed,
        windAngle,
        offsetUpCm: logForm.offsetUpCm || 0,
        offsetRightCm: logForm.offsetRightCm || 0,
        scopeUnits: weapon.scopeUnits,
      });
    } catch (e) {
      console.warn("suggestScopeCorrection failed:", e);
      return null;
    }
  }, [weapon, ammo, envNow, windSpeed, windAngle, logForm.rangeM, logForm.offsetUpCm, logForm.offsetRightCm]);

  // Display helpers for old snapshot holds (legacy)
  const formatCalculatedHold = (value: number, units: "MIL" | "MOA"): string => {
    if (Math.abs(value) < 0.05) return `0.0`;
    const direction = value > 0 ? "U" : "D";
    return `${direction}${Math.abs(value).toFixed(1)}`;
    // (windage uses L/R; this was only for the legacy snapshot block)
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

      {/* Session Management */}
      <div className="p-2 border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <SessionManager compact={true} showNewSession={false} />
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs px-2 py-1 ml-2">
                New Session
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Session</DialogTitle>
                <DialogDescription>Create a new shooting session with a name and location.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label htmlFor="new-title" className="text-sm font-medium">Session Name</label>
                  <input
                    id="new-title"
                    className="w-full px-2 py-1 mt-1 border"
                    value={newSessionTitle}
                    onChange={(e) => setNewSessionTitle(e.target.value)}
                    placeholder="Enter session name"
                  />
                </div>
                <div>
                  <label htmlFor="new-place" className="text-sm font-medium">Location/Place</label>
                  <input
                    id="new-place"
                    className="w-full px-2 py-1 mt-1 border"
                    value={newSessionPlace}
                    onChange={(e) => setNewSessionPlace(e.target.value)}
                    placeholder="e.g., Local Range, Camp Perry, etc."
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleNewSession}>Create Session</Button>
                  <Button variant="outline">Cancel</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="p-3 border bg-card">
        <PresetSelectors onManagePresets={() => setShowPresetManager((s) => !s)} />
      </div>

      {/* Equipment Manager (Collapsible) */}
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
              <KV k="V₀" v={`${snapshot.V0} m/s`} />
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
                      calculator.scopeUnits === "MIL" ? calculator.lastResult.holdMil : calculator.lastResult.holdMoa,
                      calculator.scopeUnits
                    )}
                  />
                  <KV
                    k="Windage"
                    v={
                      calculator.lastResult.windDrift
                        ? (() => {
                            const base = calculator.lastResult.windDrift / calculator.X; // radians approx
                            const mil = base * 1000;
                            const moa = mil * 3.438;
                            return calculator.scopeUnits === "MIL"
                              ? `${mil >= 0 ? "L" : "R"}${Math.abs(mil).toFixed(1)}`
                              : `${moa >= 0 ? "L" : "R"}${Math.abs(moa).toFixed(1)}`;
                          })()
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

      {/* 🔥 Physics-based Scope Adjustment (replaces old arithmetic) */}
      <section className="p-4 bg-slate-800 text-white border border-slate-600">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xl">🎯</span>
          <h3 className="font-bold text-white text-lg">Scope Adjustment (Ballistics Engine)</h3>
        </div>

        {!weapon || !ammo ? (
          <div className="text-slate-300 text-sm">Select a rifle and ammo on the Equipment page.</div>
        ) : !suggestion ? (
          <div className="text-slate-300 text-sm">Enter range and offsets to get a suggestion.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-white mb-1 uppercase tracking-wide">
                  {suggestion.units} Adjustments
                </div>
                <KVDark
                  k="Predicted from zero (elev)"
                  v={`${suggestion.predictedDial.up >= 0 ? "U" : "D"}${Math.abs(suggestion.predictedDial.up).toFixed(2)}`}
                />
                <KVDark
                  k="Extra from group offset (elev)"
                  v={`${suggestion.correctionFromOffset.up >= 0 ? "U" : "D"}${Math.abs(suggestion.correctionFromOffset.up).toFixed(2)}`}
                />
                <KVDark
                  k="Final dial (elev)"
                  v={`${suggestion.finalDial.up >= 0 ? "U" : "D"}${Math.abs(suggestion.finalDial.up).toFixed(2)}`}
                />
                <div className="h-2" />
                <KVDark
                  k="Extra from group offset (wind)"
                  v={`${suggestion.correctionFromOffset.right >= 0 ? "R" : "L"}${Math.abs(suggestion.correctionFromOffset.right).toFixed(2)}`}
                />
                <KVDark
                  k="Final dial (wind)"
                  v={`${suggestion.finalDial.right >= 0 ? "R" : "L"}${Math.abs(suggestion.finalDial.right).toFixed(2)}`}
                />
              </div>
            </div>

            <div className="mt-3 pt-2 px-3 py-2 bg-slate-700/50 border-t border-slate-600 text-xs">
              <div>
                TOF {suggestion.raw.tof.toFixed(2)} s • Impact {suggestion.raw.impactVel.toFixed(0)} m/s • Drop{" "}
                {suggestion.raw.dropM.toFixed(2)} m • Drift {suggestion.raw.driftM.toFixed(2)} m
              </div>
              <div className="text-slate-300 mt-1">
                Predicted dial uses your zero distance & scope height, drag model (G1/G7), BC, MV, and zero-vs-current environment.
              </div>
            </div>
          </>
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
            onChange={(shots) => updateLogForm("shots", shots)}
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

        {/* Current Scope Reading */}
        <div className="mb-3 pt-3 border-t">
          <h4 className="font-medium mb-2">Current scope reading ({calculator.scopeUnits})</h4>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Elevation" value={scopeElevation} onChange={setScopeElevation} placeholder="e.g., U2.5 or D1.2" />
            <TextInput label="Windage" value={scopeWindage} onChange={setScopeWindage} placeholder="e.g., R0.8 or L3.1" />
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

      {/* Save/Navigation */}
      <section className="flex gap-3">
        <button
          onClick={() => {
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
              setLogForm({
                rangeM: calculator.X,
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
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to save entry");
            }
          }}
          disabled={!snapshot || !logForm.rangeM || logForm.rangeM <= 0}
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
