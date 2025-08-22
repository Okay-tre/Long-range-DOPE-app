/* Simple data operations for /dope page. */

import type { AppState, Entry, Session } from "../lib/appState";

export function newSession(state: AppState, setState: (s: AppState)=>void, title?: string, place?: string) {
  const s2: Session = { 
    id: crypto.randomUUID(), 
    startedAt: new Date().toISOString(), 
    title: title || "New Session",
    place: place || ""
  };
  setState({ ...state, session: s2 });
}

export function renameSession(state: AppState, setState: (s: AppState)=>void, title: string) {
  setState({ ...state, session: { ...state.session, title } });
}

export function updateSessionPlace(state: AppState, setState: (s: AppState)=>void, place: string) {
  setState({ ...state, session: { ...state.session, place } });
}

export function updateSession(state: AppState, setState: (s: AppState)=>void, updates: Partial<Session>) {
  setState({ ...state, session: { ...state.session, ...updates } });
}

export function deleteSession(state: AppState, setState: (s: AppState)=>void) {
  // keeps entries (user can filter by sessionId if you choose)
  const s2: Session = { 
    id: crypto.randomUUID(), 
    startedAt: new Date().toISOString(), 
    title: "Default Session",
    place: ""
  };
  setState({ ...state, session: s2 });
}

export function editEntry(state: AppState, setState: (s: AppState)=>void, id: string, patch: Partial<Entry>) {
  setState({ ...state, entries: state.entries.map(e => e.id === id ? { ...e, ...patch } : e) });
}

export function deleteEntry(state: AppState, setState: (s: AppState)=>void, id: string) {
  setState({ ...state, entries: state.entries.filter(e => e.id !== id) });
}

export function exportJSON(entries: Entry[]): string {
  return JSON.stringify(entries, null, 2);
}

// Enhanced JSON import functionality
export function importEntriesJSON(
  state: AppState, 
  setState: (s: AppState) => void, 
  jsonData: string,
  mergeMode: 'replace' | 'merge' = 'merge'
): { imported: number; errors: string[] } {
  try {
    const parsed = JSON.parse(jsonData);
    let entries: Entry[] = [];
    let importCount = 0;
    const errors: string[] = [];

    // Handle different JSON formats
    if (Array.isArray(parsed)) {
      // Direct array of entries
      entries = parsed;
    } else if (parsed.data && Array.isArray(parsed.data.entries)) {
      // Full app backup format
      entries = parsed.data.entries;
    } else if (parsed.entries && Array.isArray(parsed.entries)) {
      // Object with entries property
      entries = parsed.entries;
    } else {
      throw new Error('Invalid JSON format. Expected array of entries or object with entries property.');
    }

    // Validate and process entries
    const validEntries: Entry[] = [];
    const currentSessionId = state.session.id;

    entries.forEach((entry, index) => {
      try {
        // Basic validation
        if (!entry.id || !entry.rangeM || !entry.createdAt) {
          errors.push(`Entry ${index + 1}: Missing required fields (id, rangeM, or createdAt)`);
          return;
        }

        // Generate new IDs to avoid conflicts
        const processedEntry: Entry = {
          ...entry,
          id: crypto.randomUUID(),
          sessionId: currentSessionId, // Assign to current session
          // Ensure backward compatibility for optional fields
          actualAdjMil: entry.actualAdjMil || null,
          actualAdjMoa: entry.actualAdjMoa || null,
          // Set defaults for any missing fields
          firearmName: entry.firearmName || "",
          ammoName: entry.ammoName || "",
          bulletWeightGr: entry.bulletWeightGr || 175,
          barrelLengthIn: entry.barrelLengthIn || 20,
          twistRateIn: entry.twistRateIn || 8,
          temperature: entry.temperature || 15,
          humidity: entry.humidity || 0,
          windSpeed: entry.windSpeed || 0,
          windDirection: entry.windDirection || 0,
          y0Cm: entry.y0Cm || 3.5,
          notes: entry.notes || "",
          // Recalculate suggested adjustments if missing
          suggestedAdjMil: entry.suggestedAdjMil || {
            up: (-entry.offsetUpCm * 10) / entry.rangeM,
            right: (-entry.offsetRightCm * 10) / entry.rangeM,
          },
          suggestedAdjMoa: entry.suggestedAdjMoa || {
            up: (-entry.offsetUpCm * 34.38) / entry.rangeM,
            right: (-entry.offsetRightCm * 34.38) / entry.rangeM,
          },
        };

        validEntries.push(processedEntry);
        importCount++;
      } catch (error) {
        errors.push(`Entry ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Update state based on merge mode
    const newEntries = mergeMode === 'replace' 
      ? validEntries 
      : [...state.entries, ...validEntries];

    setState({
      ...state,
      entries: newEntries
    });

    return { imported: importCount, errors };

  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Export specific session data
export function exportSessionJSON(entries: Entry[], session: Session): string {
  const sessionData = {
    session: {
      title: session.title,
      place: session.place,
      startedAt: session.startedAt,
      exportedAt: new Date().toISOString(),
    },
    entries: entries.filter(e => e.sessionId === session.id),
    metadata: {
      version: "1.0",
      entryCount: entries.filter(e => e.sessionId === session.id).length,
      exportType: "session"
    }
  };

  return JSON.stringify(sessionData, null, 2);
}

/* For PDF, wire your chosen client-side library in UI code; this is a placeholder to keep
   the handlers logic-only. */
export type DopeExportRow = Entry; // same shape; format in your PDF layer