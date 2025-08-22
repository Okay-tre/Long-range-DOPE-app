import React, { useState, useEffect } from "react";
import { useApp } from "../contexts/AppContext";
import { makeSnapshotFromCalculator, saveEntryHandler, type LogForm, type CalcSnapshot } from "./log.handlers";
import { newSession } from "./dope.handlers";
import { SessionManager } from "../components/SessionManager";
import { PresetSelectors } from "../components/PresetSelectors";
import { EquipmentManager } from "../components/EquipmentManager";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner@2.0.3";

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm">{children}</span>
);

function NumberInput({
  label, value, onChange, step = "any", placeholder,
}: { label: string; value: number | null | undefined; onChange: (n: number | null) => void; step?: string; placeholder?: string }) {
  // Ensure we always have a string value for the controlled input
  const displayValue = value !== null && value !== undefined ? value.toString() : '';
  
  return (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      <input
        type="number"
        className="px-2 py-1 border"
        value={displayValue}
        onChange={(e) => {
          const inputValue = e.target.value;
          if (inputValue === '') {
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
        value={value || ''}
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
        value={value || ''}
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

  // Form state - simplified scope adjustments
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

  // Simple scope reading strings (e.g., "U2.5", "D1.2", "L0.8", "R3.1")
  const [scopeElevation, setScopeElevation] = useState<string>("");
  const [scopeWindage, setScopeWindage] = useState<string>("");

  const [snapshot, setSnapshot] = useState<CalcSnapshot | null>(null);
  
  // New session state
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionPlace, setNewSessionPlace] = useState("");
  
  // Preset manager state
  const [showPresetManager, setShowPresetManager] = useState(false);

  // Calculate average group size for current session
  const sessionEntries = entries.filter(entry => entry.sessionId === session?.id);
  const validGroups = sessionEntries.filter(entry => entry.groupSizeCm && entry.groupSizeCm > 0);
  const avgGroupSize = validGroups.length > 0 
    ? (validGroups.reduce((sum, entry) => sum + entry.groupSizeCm!, 0) / validGroups.length).toFixed(1)
    : null;

  // Parse scope reading string (e.g., "U2.5" -> { direction: 'U', value: 2.5 })
  const parseScopeReading = (reading: string) => {
    if (!reading.trim()) return null;
    const match = reading.trim().match(/^([UDLR])(\d*\.?\d*)$/i);
    if (!match) return null;
    const direction = match[1].toUpperCase();
    const value = parseFloat(match[2]);
    if (isNaN(value)) return null;
    return { direction, value };
  };

  // Update scope adjustments in form when scope readings change
  useEffect(() => {
    const elevationReading = parseScopeReading(scopeElevation);
    const windageReading = parseScopeReading(scopeWindage);

    // Convert scope readings to form values based on current unit
    if (calculator.scopeUnits === 'MIL') {
      const elevationValue = elevationReading ? 
        (elevationReading.direction === 'U' ? elevationReading.value : -elevationReading.value) : null;
      const windageValue = windageReading ? 
        (windageReading.direction === 'R' ? windageReading.value : -windageReading.value) : null;
      
      setLogForm(prev => ({
        ...prev,
        actualAdjMil: { up: elevationValue, right: windageValue },
        actualAdjMoa: { up: null, right: null }
      }));
    } else {
      const elevationValue = elevationReading ? 
        (elevationReading.direction === 'U' ? elevationReading.value : -elevationReading.value) : null;
      const windageValue = windageReading ? 
        (windageReading.direction === 'R' ? windageReading.value : -windageReading.value) : null;
      
      setLogForm(prev => ({
        ...prev,
        actualAdjMoa: { up: elevationValue, right: windageValue },
        actualAdjMil: { up: null, right: null }
      }));
    }
  }, [scopeElevation, scopeWindage, calculator.scopeUnits]);

  // Ensure we have a session - create one if needed
  useEffect(() => {
    if (!session) {
      const newSession = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        title: "Default Session",
        place: ""
      };
      setState({
        ...state,
        session: newSession
      });
    }
  }, [session, state, setState]);

  // Update snapshot when calculator changes or on first load
  const handleUseCurrentSnapshot = () => {
    const newSnapshot = makeSnapshotFromCalculator(state);
    setSnapshot(newSnapshot);
    setLogForm(prev => ({
      ...prev,
      rangeM: calculator.X, // Set range from calculator
    }));
    toast.success("Used current calculator settings");
  };

  // Auto-load snapshot on page load
  useEffect(() => {
    if (!snapshot) {
      handleUseCurrentSnapshot();
    }
  }, []);

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
      
      // Reset form
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
  };

  const updateLogForm = (field: keyof LogForm, value: any) => {
    setLogForm(prev => ({ ...prev, [field]: value }));
  };

  const handleNewSession = () => {
    newSession(state, setState, newSessionTitle.trim() || undefined, newSessionPlace.trim() || undefined);
    setNewSessionTitle("");
    setNewSessionPlace("");
    setShowNewSession(false);
    toast.success("New session created");
  };

  // Format calculated holds for display
  const formatCalculatedHold = (value: number, units: 'MIL' | 'MOA'): string => {
    if (Math.abs(value) < 0.05) {
      return `0.0`;
    }
    const direction = value > 0 ? 'U' : 'D';
    return `${direction}${Math.abs(value).toFixed(1)}`;
  };

  const formatCalculatedWindage = (value: number, units: 'MIL' | 'MOA'): string => {
    if (Math.abs(value) < 0.05) {
      return `0.0`;
    }
    const direction = value > 0 ? 'L' : 'R';
    return `${direction}${Math.abs(value).toFixed(1)}`;
  };

  // Show loading state while session is being created
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
            <div>
              {session.place ? `${session.title} @ ${session.place}` : session.title}
            </div>
            {avgGroupSize && (
              <div className="text-xs">
                Avg Group: {avgGroupSize}cm ({validGroups.length} groups)
              </div>
            )}
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
                <DialogDescription>
                  Create a new shooting session with a name and location.
                </DialogDescription>
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
                  <Button variant="outline" onClick={() => {}}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="p-3 border bg-card">
        <PresetSelectors onManagePresets={() => setShowPresetManager(!showPresetManager)} />
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
            {/* Firearm and Ammo Info */}
            {(snapshot.firearmName || snapshot.ammoName) && (
              <div className="mb-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {snapshot.firearmName && (
                    <KV k="Firearm" v={snapshot.firearmName} />
                  )}
                  {snapshot.ammoName && (
                    <KV k="Ammunition" v={snapshot.ammoName} />
                  )}
                </div>
              </div>
            )}
            
            {/* Technical parameters */}
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

            {/* Calculated Holds */}
            {calculator.lastResult && (
              <div className="mb-2 pt-2 border-t">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Calculated Holds ({calculator.scopeUnits})</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <KV 
                    k="Elevation" 
                    v={formatCalculatedHold(
                      calculator.scopeUnits === 'MIL' ? calculator.lastResult.holdMil : calculator.lastResult.holdMoa,
                      calculator.scopeUnits
                    )} 
                  />
                  <KV 
                    k="Windage" 
                    v={calculator.lastResult.windDrift 
                      ? formatCalculatedWindage(
                          calculator.scopeUnits === 'MIL' 
                            ? (calculator.lastResult.windDrift / calculator.X) * 1000
                            : (calculator.lastResult.windDrift / calculator.X) * 3438,
                          calculator.scopeUnits
                        )
                      : "0.0"
                    } 
                  />
                </div>
              </div>
            )}
            
            {/* Weather conditions */}
            <div className="mb-2 pt-2 border-t">
              <div className="text-xs font-medium mb-1 text-muted-foreground">Weather Conditions</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <KV k="Temperature" v={`${snapshot.temperature}°C`} />
                <KV k="Humidity" v={`${snapshot.humidity}%`} />
                <KV k="Wind Speed" v={`${snapshot.windSpeed} m/s`} />
                <KV k="Wind Direction" v={`${snapshot.windDirection}°`} />
              </div>
            </div>
            
            {/* Equipment info */}
            <div className="pt-2 border-t">
              <div className="grid grid-cols-2 md:grid-cols-2 gap-2 text-sm">
                <KV k="Barrel" v={`${snapshot.barrelLengthIn}" (${(snapshot.barrelLengthIn * 2.54).toFixed(1)}cm)`} />
                <KV k="Twist rate" v={`1:${snapshot.twistRateIn}"`} />
              </div>
            </div>
          </>
        )}
      </section>

      {/* Static Scope Adjustment Calculator - Always Visible */}
      <section className="p-4 bg-slate-800 text-white border border-slate-600">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xl">🎯</span>
          <h3 className="font-bold text-white text-lg">Scope Adjustment Calculator</h3>
        </div>
        
        {logForm.rangeM > 0 && (logForm.offsetUpCm !== 0 || logForm.offsetRightCm !== 0) ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-white mb-1 uppercase tracking-wide">{calculator.scopeUnits} Adjustments</div>
                <KVDark 
                  k="Elevation" 
                  v={calculator.scopeUnits === 'MIL' 
                    ? `${(-logForm.offsetUpCm * 10) / logForm.rangeM < 0 ? 'D' : 'U'}${Math.abs((-logForm.offsetUpCm * 10) / logForm.rangeM).toFixed(2)}`
                    : `${(-logForm.offsetUpCm * 34.38) / logForm.rangeM < 0 ? 'D' : 'U'}${Math.abs((-logForm.offsetUpCm * 34.38) / logForm.rangeM).toFixed(2)}`
                  } 
                />
                <KVDark 
                  k="Windage" 
                  v={calculator.scopeUnits === 'MIL'
                    ? `${(-logForm.offsetRightCm * 10) / logForm.rangeM < 0 ? 'L' : 'R'}${Math.abs((-logForm.offsetRightCm * 10) / logForm.rangeM).toFixed(2)}`
                    : `${(-logForm.offsetRightCm * 34.38) / logForm.rangeM < 0 ? 'L' : 'R'}${Math.abs((-logForm.offsetRightCm * 34.38) / logForm.rangeM).toFixed(2)}`
                  } 
                />
              </div>
            </div>
            <div className="mt-3 pt-2 px-3 py-2 bg-slate-700/50 border-t border-slate-600">
              <p className="text-sm text-slate-200 flex items-center gap-2">
                <span className="text-lg">💡</span>
                <span>
                  Adjustments based on group center offset at {logForm.rangeM}m range. 
                  Positive values indicate upward/rightward corrections needed.
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
            onChange={(rangeM) => updateLogForm('rangeM', rangeM || 0)}
            step="1"
          />
          <NumberInput 
            label="Number of shots" 
            value={logForm.shots} 
            onChange={(shots) => updateLogForm('shots', shots)}
            step="1"
          />
          <NumberInput 
            label="Offset up/down (cm)" 
            value={logForm.offsetUpCm} 
            onChange={(offsetUpCm) => updateLogForm('offsetUpCm', offsetUpCm || 0)}
            step="0.1"
            placeholder="+ high, - low"
          />
          <NumberInput 
            label="Offset left/right (cm)" 
            value={logForm.offsetRightCm} 
            onChange={(offsetRightCm) => updateLogForm('offsetRightCm', offsetRightCm || 0)}
            step="0.1"
            placeholder="+ right, - left"
          />
          <NumberInput 
            label="Group size (cm)" 
            value={logForm.groupSizeCm} 
            onChange={(groupSizeCm) => updateLogForm('groupSizeCm', groupSizeCm)}
            step="0.1"
            placeholder="Optional"
          />
        </div>

        {/* Current Scope Reading - Simple row */}
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
            onChange={(notes) => updateLogForm('notes', notes)}
            placeholder="Wind conditions, rifle position, etc..."
          />
        </div>
      </section>

      {/* Save/Navigation buttons */}
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