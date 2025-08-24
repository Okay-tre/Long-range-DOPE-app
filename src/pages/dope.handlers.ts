/* ------------------------------------------------------------------
   Session & entry helpers (lightweight + safe defaults)
   These mirror the names your components import.
-------------------------------------------------------------------*/

// Types are intentionally loose to avoid coupling to AppContext internals.
type AnyState = any;
type SetState = (s: any) => void;

export function newSession(
  state: AnyState,
  setState: SetState,
  title?: string,
  place?: string
) {
  const s = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    title: title?.trim() || "New Session",
    place: place?.trim() || "",
  };
  setState({ ...state, session: s });
  return s;
}

export function updateSession(
  state: AnyState,
  setState: SetState,
  patch: Partial<{ title: string; place: string; startedAt: string }>
) {
  if (!state?.session) return;
  setState({ ...state, session: { ...state.session, ...patch } });
}

export function deleteSession(state: AnyState, setState: SetState) {
  const s = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    title: "Default Session",
    place: "",
  };
  setState({ ...state, session: s });
}

export function deleteEntry(state: AnyState, setState: SetState, id: string) {
  const next = (state?.entries ?? []).filter((e: any) => e.id !== id);
  setState({ ...state, entries: next });
}

/* ---------------- export/import helpers ---------------- */

export function exportJSON(entries: any[]): string {
  return JSON.stringify(entries ?? [], null, 2);
}

export function exportSessionJSON(entries: any[], session: any): string {
  return JSON.stringify({ session, entries: entries ?? [] }, null, 2);
}

export function importEntriesJSON(
  state: AnyState,
  setState: SetState,
  jsonText: string,
  mode: "merge" | "replace" = "merge"
): { imported: number; errors: string[] } {
  const errors: string[] = [];
  let incoming: any[] = [];

  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      incoming = parsed;
    } else if (parsed && Array.isArray(parsed.entries)) {
      incoming = parsed.entries;
    } else {
      errors.push("JSON must be an array of entries or { entries: [] }");
    }
  } catch (e) {
    errors.push("Invalid JSON");
  }

  // Very light validation — keep what looks like an entry
  incoming = incoming.filter((e) => {
    const ok = e && typeof e === "object" && typeof e.id === "string";
    if (!ok) errors.push("Skipped malformed entry");
    return ok;
  });

  if (mode === "replace") {
    setState({ ...state, entries: incoming });
  } else {
    const existingById = new Map((state?.entries ?? []).map((e: any) => [e.id, e]));
    for (const e of incoming) existingById.set(e.id, e);
    setState({ ...state, entries: Array.from(existingById.values()) });
  }

  return { imported: incoming.length, errors };
}
