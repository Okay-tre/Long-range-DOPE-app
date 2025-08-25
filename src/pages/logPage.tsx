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
    // Direction labels match your existing sign convention in the UI
    const dirLetter =
      axis === "elev"
        ? unitsValue < 0 ? "D" : "U"
        : unitsValue < 0 ? "L" : "R";

    // Convert to clicks (rounded to whole clicks for simplicity)
    const clicks = Math.round(Math.abs(unitsValue) / Math.max(scopeClick, 1e-9));

    // Human string
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
          </div
