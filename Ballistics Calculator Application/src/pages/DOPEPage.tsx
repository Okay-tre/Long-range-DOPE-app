import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { newSession, updateSession, deleteSession, deleteEntry, exportJSON, importEntriesJSON, exportSessionJSON } from "./dope.handlers";
import { SessionManager } from "../components/SessionManager";
import { PDFExport } from "../components/PDFExport";
import { StorageManager } from "../components/StorageManager";
import { EquipmentManager } from "../components/EquipmentManager";
import { toast } from "sonner@2.0.3";
import type { Entry } from "../lib/appState";
import { calculate } from "../lib/calcEngine";
import { calculateAirDensity, calculateWindDrift } from "../utils/ballistics";

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between bg-card px-2 py-1 border">
      <span className="text-xs">{k}</span>
      <span className="font-mono text-xs">{v}</span>
    </div>
  );
}

interface SessionHeaderRow {
  type: 'session';
  sessionId: string;
  sessionTitle: string;
  sessionPlace: string;
  sessionStarted: string;
  // Representative data from first entry in session
  rangeM?: number;
  bulletInfo?: string;
  firearmName?: string;
  humidity?: number;
  windSpeed?: number;
  windDirection?: number;
}

interface EntryRow {
  type: 'entry';
  entry: any;
}

type TableRow = SessionHeaderRow | EntryRow;

// DOPE Card types and functions
interface DOPECardData {
  rifleName: string;
  ammoName: string;
  bulletWeight: number;
  maxRange: number;
  minRange: number;
  entries: Entry[];
  dopeTable: DOPEEntry[];
  dataPointCount: number;
  ballisticProfile: BallisticProfile;
  groupSuggestions: GroupSuggestion[];
}

interface DOPEEntry {
  range: number;
  elevationMil: number;
  elevationMoa: number;
  windageMil: number;
  windageMoa: number;
  isCalculated: boolean; // true for ballistic calculations
  actualEntries: number; // Number of actual entries at this range
  confidence: 'high' | 'medium' | 'low'; // Data confidence level
  windDrift?: number; // Wind drift in cm for display
}

interface GroupSuggestion {
  range: number;
  entryCount: number;
  avgElevationMil: number;
  avgElevationMoa: number;
  avgWindageMil: number;
  avgWindageMoa: number;
  groupSizeCm: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  consistencyRating: 'excellent' | 'good' | 'fair' | 'poor';
}

interface BallisticProfile {
  V0: number;
  BC: number;
  model: string;
  bulletWeightGr: number;
  y0Cm: number;
  zeroDistanceM: number;
  avgTemperature: number;
  avgHumidity: number;
  avgWindSpeed: number;
  avgWindDirection: number;
}

// Group entries by rifle/ammo combination
function groupEntriesByRifleAmmo(entries: Entry[]): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  
  entries.forEach(entry => {
    const key = `${entry.firearmName || 'Unknown Rifle'}_${entry.ammoName || 'Unknown Ammo'}_${entry.bulletWeightGr || 0}gr`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(entry);
  });
  
  return groups;
}

// Calculate ballistic profile from entries
function calculateBallisticProfile(entries: Entry[]): BallisticProfile {
  const count = entries.length;
  
  // Average the ballistic parameters
  const avgV0 = entries.reduce((sum, e) => sum + e.V0, 0) / count;
  const avgBC = entries.reduce((sum, e) => sum + (e.bcUsed || 0), 0) / count;
  const avgTemperature = entries.reduce((sum, e) => sum + e.temperature, 0) / count;
  const avgHumidity = entries.reduce((sum, e) => sum + e.humidity, 0) / count;
  const avgWindSpeed = entries.reduce((sum, e) => sum + e.windSpeed, 0) / count;
  const avgWindDirection = entries.reduce((sum, e) => sum + e.windDirection, 0) / count;
  
  // Use the most common model and bullet weight
  const models = entries.map(e => e.model);
  const mostCommonModel = models.sort((a, b) =>
    models.filter(v => v === a).length - models.filter(v => v === b).length
  ).pop() || 'G7';
  
  const bulletWeight = entries[0].bulletWeightGr || 175;
  const y0Cm = entries[0].y0Cm || 3.5;
  
  // Get zero distance from entries (with fallback to 100m)
  const zeroDistances = entries.map(e => e.zeroDistanceM).filter(z => z !== undefined);
  const avgZeroDistance = zeroDistances.length > 0 
    ? zeroDistances.reduce((sum, z) => sum + z, 0) / zeroDistances.length 
    : 100; // Default to 100m if no zero distance data
  
  return {
    V0: avgV0,
    BC: avgBC,
    model: mostCommonModel,
    bulletWeightGr: bulletWeight,
    y0Cm: y0Cm,
    zeroDistanceM: avgZeroDistance,
    avgTemperature,
    avgHumidity,
    avgWindSpeed,
    avgWindDirection
  };
}

// Calculate group suggestions for ranges with multiple entries
function calculateGroupSuggestions(entries: Entry[]): GroupSuggestion[] {
  const rangeGroups = new Map<number, Entry[]>();
  
  // Group entries by range
  entries.forEach(entry => {
    if (!rangeGroups.has(entry.rangeM)) {
      rangeGroups.set(entry.rangeM, []);
    }
    rangeGroups.get(entry.rangeM)!.push(entry);
  });
  
  const suggestions: GroupSuggestion[] = [];
  
  rangeGroups.forEach((rangeEntries, range) => {
    if (rangeEntries.length < 2) return; // Skip single entries
    
    const count = rangeEntries.length;
    
    // Calculate averages using ACTUAL adjustments, not suggested
    const avgElevationMil = rangeEntries.reduce((sum, e) => {
      const actualElev = e.actualAdjMil?.up || 0;
      return sum + actualElev;
    }, 0) / count;
    
    const avgElevationMoa = rangeEntries.reduce((sum, e) => {
      const actualElev = e.actualAdjMoa?.up || 0;
      return sum + actualElev;
    }, 0) / count;
    
    const avgWindageMil = rangeEntries.reduce((sum, e) => {
      const actualWind = e.actualAdjMil?.right || 0;
      return sum + actualWind;
    }, 0) / count;
    
    const avgWindageMoa = rangeEntries.reduce((sum, e) => {
      const actualWind = e.actualAdjMoa?.right || 0;
      return sum + actualWind;
    }, 0) / count;
    
    // Calculate group size if available
    const groupSizes = rangeEntries.filter(e => e.groupSizeCm).map(e => e.groupSizeCm);
    const avgGroupSize = groupSizes.length > 0 
      ? groupSizes.reduce((sum, size) => sum + size, 0) / groupSizes.length
      : 0;
    
    // Calculate standard deviations for consistency rating using actual adjustments
    const elevStdDevMil = Math.sqrt(
      rangeEntries.reduce((sum, e) => {
        const actualElev = e.actualAdjMil?.up || 0;
        return sum + Math.pow(actualElev - avgElevationMil, 2);
      }, 0) / count
    );
    
    const windStdDevMil = Math.sqrt(
      rangeEntries.reduce((sum, e) => {
        const actualWind = e.actualAdjMil?.right || 0;
        return sum + Math.pow(actualWind - avgWindageMil, 2);
      }, 0) / count
    );
    
    // Determine consistency rating based on standard deviation
    const totalStdDev = elevStdDevMil + windStdDevMil;
    let consistencyRating: 'excellent' | 'good' | 'fair' | 'poor';
    if (totalStdDev < 0.2) consistencyRating = 'excellent';
    else if (totalStdDev < 0.4) consistencyRating = 'good';
    else if (totalStdDev < 0.6) consistencyRating = 'fair';
    else consistencyRating = 'poor';
    
    // Determine confidence level
    let confidenceLevel: 'high' | 'medium' | 'low';
    if (count >= 5 && consistencyRating === 'excellent') confidenceLevel = 'high';
    else if (count >= 3 && (consistencyRating === 'excellent' || consistencyRating === 'good')) confidenceLevel = 'medium';
    else confidenceLevel = 'low';
    
    suggestions.push({
      range,
      entryCount: count,
      avgElevationMil: roundToBallistic(avgElevationMil),
      avgElevationMoa: roundToBallistic(avgElevationMoa),
      avgWindageMil: roundToBallistic(avgWindageMil),
      avgWindageMoa: roundToBallistic(avgWindageMoa),
      groupSizeCm: avgGroupSize,
      confidenceLevel,
      consistencyRating
    });
  });
  
  return suggestions.sort((a, b) => a.range - b.range);
}

// Calculate range averages for actual shot data (for reference only)
function calculateRangeAverages(entries: Entry[]): Map<number, { elevMil: number; elevMoa: number; windMil: number; windMoa: number; count: number; avgWindDrift: number }> {
  const rangeGroups = new Map<number, Entry[]>();
  
  // Group by range
  entries.forEach(entry => {
    if (!rangeGroups.has(entry.rangeM)) {
      rangeGroups.set(entry.rangeM, []);
    }
    rangeGroups.get(entry.rangeM)!.push(entry);
  });
  
  // Calculate averages for each range
  const averages = new Map<number, { elevMil: number; elevMoa: number; windMil: number; windMoa: number; count: number; avgWindDrift: number }>();
  
  rangeGroups.forEach((rangeEntries, range) => {
    const count = rangeEntries.length;
    const elevMil = rangeEntries.reduce((sum, e) => sum + e.suggestedAdjMil.up, 0) / count;
    const elevMoa = rangeEntries.reduce((sum, e) => sum + e.suggestedAdjMoa.up, 0) / count;
    const windMil = rangeEntries.reduce((sum, e) => sum + e.suggestedAdjMil.right, 0) / count;
    const windMoa = rangeEntries.reduce((sum, e) => sum + e.suggestedAdjMoa.right, 0) / count;
    const avgWindDrift = rangeEntries.reduce((sum, e) => sum + e.offsetRightCm, 0) / count;
    
    averages.set(range, { elevMil, elevMoa, windMil, windMoa, count, avgWindDrift });
  });
  
  return averages;
}

// Calculate pure ballistic DOPE adjustments (scope adjustments needed)
function calculateBallisticDOPE(range: number, profile: BallisticProfile): { elevationMil: number; elevationMoa: number; windDriftCm: number } {
  try {
    const zeroRange = profile.zeroDistanceM;
    
    // If this is the zero range, return zero adjustment
    if (Math.abs(range - zeroRange) < 1) {
      return {
        elevationMil: 0.0,
        elevationMoa: 0.0,
        windDriftCm: 0.0
      };
    }
    
    // Calculate air density from conditions
    const rho = calculateAirDensity(profile.avgTemperature, profile.avgHumidity);
    
    // Calculate bullet trajectory at target range with zero scope setting
    const targetCalc = calculate({
      V0: profile.V0,
      thetaDeg: 0, // Level shot - scope set to zero
      X: range,
      g: 9.81,
      y0: profile.y0Cm / 100, // Convert cm to m
      model: profile.model as any,
      bcUsed: profile.BC,
      rho: rho
    });
    
    // Calculate bullet trajectory at zero range with zero scope setting
    const zeroCalc = calculate({
      V0: profile.V0,
      thetaDeg: 0, // Level shot - scope set to zero
      X: zeroRange,
      g: 9.81,
      y0: profile.y0Cm / 100,
      model: profile.model as any,
      bcUsed: profile.BC,
      rho: rho
    });
    
    // The scope adjustment needed is the difference in bullet drops
    // At zero range, the bullet should hit the target (drop = 0 after zeroing)
    // At target range, we need to compensate for additional drop
    const additionalDrop = targetCalc.drop - zeroCalc.drop;
    
    // Convert drop difference to angular scope adjustment
    // Positive adjustment = UP (to compensate for more bullet drop)
    // Angular adjustment in mils = drop_in_meters / range_in_meters * 1000
    const elevationMil = additionalDrop / range * 1000;
    
    // Convert mils to MOA: 1 mil = 3.437746 MOA (more precise)
    const elevationMoa = elevationMil * 3.437746;
    
    // Calculate wind drift for reference
    const windDriftM = calculateWindDrift(
      profile.avgWindSpeed,
      profile.avgWindDirection,
      targetCalc.tFlight,
      (profile.V0 + targetCalc.vImpact) / 2
    );
    
    return {
      elevationMil: elevationMil,
      elevationMoa: elevationMoa,
      windDriftCm: windDriftM * 100
    };
    
  } catch (error) {
    console.warn('Ballistic DOPE calculation failed, using approximation:', error);
    
    // Simple ballistic approximation for fallback
    const zeroRange = profile.zeroDistanceM;
    if (Math.abs(range - zeroRange) < 1) {
      return { elevationMil: 0.0, elevationMoa: 0.0, windDriftCm: 0.0 };
    }
    
    // Simple drop approximation: drop ≈ 0.5 * g * (range/V0)^2
    const targetTime = range / profile.V0;
    const zeroTime = zeroRange / profile.V0;
    const targetDrop = 0.5 * 9.81 * targetTime * targetTime;
    const zeroDrop = 0.5 * 9.81 * zeroTime * zeroTime;
    const additionalDrop = targetDrop - zeroDrop;
    
    const elevationMil = additionalDrop / range * 1000;
    const elevationMoa = elevationMil * 3.437746;
    
    return {
      elevationMil: elevationMil,
      elevationMoa: elevationMoa,
      windDriftCm: 0
    };
  }
}

// Round to 0.1 increments (ballistics precision)
function roundToBallistic(value: number): number {
  return Math.round(value * 10) / 10;
}

// Generate DOPE table using pure ballistic calculations
function generateDOPETable(entries: Entry[]): DOPEEntry[] {
  if (entries.length === 0) return [];
  
  const profile = calculateBallisticProfile(entries);
  const actualData = calculateRangeAverages(entries);
  const actualRanges = Array.from(actualData.keys()).sort((a, b) => a - b);
  const maxActualRange = actualRanges.length > 0 ? Math.max(...actualRanges) : 300;
  
  // Determine increment based on max range
  const increment = maxActualRange <= 100 ? 10 : 50;
  
  // Create comprehensive DOPE range
  const extendedMaxRange = Math.max(maxActualRange + increment, 500); // At least to 500m
  const startRange = increment;
  
  // Generate all ranges at increments
  const dopeRanges: number[] = [];
  
  // Always include the zero range
  if (!dopeRanges.includes(profile.zeroDistanceM)) {
    dopeRanges.push(profile.zeroDistanceM);
  }
  
  // Add increment ranges
  for (let range = startRange; range <= extendedMaxRange; range += increment) {
    if (!dopeRanges.includes(range)) {
      dopeRanges.push(range);
    }
  }
  
  // Add actual shot ranges that don't fall on increment boundaries
  actualRanges.forEach(range => {
    if (!dopeRanges.includes(range)) {
      dopeRanges.push(range);
    }
  });
  
  dopeRanges.sort((a, b) => a - b);
  
  // Generate DOPE entries - ALWAYS use ballistic calculations for DOPE cards
  const dopeEntries: DOPEEntry[] = dopeRanges.map(range => {
    const ballistic = calculateBallisticDOPE(range, profile);
    const actualShots = actualData.get(range);
    
    // Determine confidence based on data availability and range
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    
    if (Math.abs(range - profile.zeroDistanceM) < 1) {
      confidence = 'high'; // Zero range is always high confidence
    } else if (actualRanges.length >= 3) {
      const distanceFromData = Math.min(
        ...actualRanges.map(r => Math.abs(r - range))
      );
      if (distanceFromData <= increment / 2) confidence = 'high';
      else if (distanceFromData <= increment) confidence = 'medium';
      else confidence = 'low';
    } else if (actualRanges.length >= 1) {
      if (range >= Math.min(...actualRanges) && range <= Math.max(...actualRanges)) {
        confidence = 'medium';
      } else {
        confidence = 'low';
      }
    } else {
      confidence = 'low';
    }
    
    return {
      range,
      // Always use ballistic calculations, rounded to 0.1
      elevationMil: roundToBallistic(ballistic.elevationMil),
      elevationMoa: roundToBallistic(ballistic.elevationMoa),
      windageMil: 0, // DOPE cards typically don't include wind corrections
      windageMoa: 0,
      isCalculated: true, // DOPE cards are always calculated
      actualEntries: actualShots ? actualShots.count : 0,
      confidence,
      windDrift: ballistic.windDriftCm
    };
  });
  
  return dopeEntries;
}

// Generate DOPE cards for all rifle/ammo combinations (always generate)
function generateDOPECards(entries: Entry[]): DOPECardData[] {
  const groups = groupEntriesByRifleAmmo(entries);
  const dopeCards: DOPECardData[] = [];
  
  groups.forEach((groupEntries, key) => {
    if (groupEntries.length === 0) return;
    
    const firstEntry = groupEntries[0];
    const actualRanges = Array.from(new Set(groupEntries.map(e => e.rangeM))).sort((a, b) => a - b);
    const maxRange = actualRanges.length > 0 ? Math.max(...actualRanges) : 300;
    const minRange = actualRanges.length > 0 ? Math.min(...actualRanges) : 100;
    
    const ballisticProfile = calculateBallisticProfile(groupEntries);
    const dopeTable = generateDOPETable(groupEntries);
    const groupSuggestions = calculateGroupSuggestions(groupEntries);
    
    dopeCards.push({
      rifleName: firstEntry.firearmName || 'Unknown Rifle',
      ammoName: firstEntry.ammoName || 'Unknown Ammo',
      bulletWeight: firstEntry.bulletWeightGr || 0,
      maxRange,
      minRange,
      entries: groupEntries,
      dopeTable,
      dataPointCount: actualRanges.length,
      ballisticProfile,
      groupSuggestions
    });
  });
  
  return dopeCards.sort((a, b) => a.rifleName.localeCompare(b.rifleName));
}

export function DOPEPage() {
  const { state, setState, navigate } = useApp();
  const { session, entries, calculator } = state;

  const [sortBy, setSortBy] = useState<"date" | "range">("date");
  const [filterRange, setFilterRange] = useState({ min: "", max: "" });
  const [filterNotes, setFilterNotes] = useState("");
  const [showSessionHeaders, setShowSessionHeaders] = useState(true);
  const [showDOPECards, setShowDOPECards] = useState(false);
  const [showGroupSuggestions, setShowGroupSuggestions] = useState(false);
  const [showStorageManager, setShowStorageManager] = useState(false);

  // If no session exists, create one
  if (!session) {
    const defaultSession = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      title: "Default Session",
      place: ""
    };
    setState({
      ...state,
      session: defaultSession
    });
    return (
      <div className="container max-w-7xl mx-auto p-4">
        <div className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">Initializing session...</p>
        </div>
      </div>
    );
  }

  // Filter and sort entries
  const filteredEntries = entries
    .filter(entry => {
      const rangeMatch = (!filterRange.min || entry.rangeM >= Number(filterRange.min)) &&
                         (!filterRange.max || entry.rangeM <= Number(filterRange.max));
      const notesMatch = !filterNotes || entry.notes.toLowerCase().includes(filterNotes.toLowerCase());
      return rangeMatch && notesMatch;
    })
    .sort((a, b) => {
      if (sortBy === "date") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else {
        return a.rangeM - b.rangeM;
      }
    });

  // Group entries by session and create table rows
  const createTableRows = (): TableRow[] => {
    if (!showSessionHeaders) {
      return filteredEntries.map(entry => ({ type: 'entry', entry }));
    }

    const rows: TableRow[] = [];
    const sessionGroups = new Map<string, any[]>();
    
    // Group entries by session
    filteredEntries.forEach(entry => {
      if (!sessionGroups.has(entry.sessionId)) {
        sessionGroups.set(entry.sessionId, []);
      }
      sessionGroups.get(entry.sessionId)!.push(entry);
    });

    // Create rows with session headers
    Array.from(sessionGroups.entries()).forEach(([sessionId, sessionEntries]) => {
      if (sessionEntries.length === 0) return;
      
      // Find session info (use current session if it matches, otherwise create placeholder)
      const isCurrentSession = sessionId === session.id;
      const sessionInfo = isCurrentSession ? session : {
        id: sessionId,
        title: `Session ${sessionId.slice(0, 8)}`,
        place: "",
        startedAt: sessionEntries[0].createdAt
      };

      // Get representative data from first entry
      const firstEntry = sessionEntries[0];
      const bulletInfo = firstEntry.bulletWeightGr ? 
        `${firstEntry.ammoName || 'Unknown'} ${firstEntry.bulletWeightGr}gr` : 
        firstEntry.ammoName || 'Unknown';

      // Add session header
      rows.push({
        type: 'session',
        sessionId,
        sessionTitle: sessionInfo.title,
        sessionPlace: sessionInfo.place || "",
        sessionStarted: sessionInfo.startedAt,
        rangeM: firstEntry.rangeM,
        bulletInfo,
        firearmName: firstEntry.firearmName,
        humidity: firstEntry.humidity,
        windSpeed: firstEntry.windSpeed,
        windDirection: firstEntry.windDirection
      });

      // Add entry rows
      sessionEntries.forEach(entry => {
        rows.push({ type: 'entry', entry });
      });
    });

    return rows;
  };

  const tableRows = createTableRows();
  const dopeCards = generateDOPECards(filteredEntries);

  const handleDeleteSession = () => {
    if (confirm("Delete current session? This will create a new default session but keep all entries.")) {
      deleteSession(state, setState);
      toast.success("Session deleted, new session created");
    }
  };

  const handleDeleteEntry = (id: string) => {
    if (confirm("Delete this entry?")) {
      deleteEntry(state, setState, id);
      toast.success("Entry deleted");
    }
  };

  const handleExportJSON = () => {
    const json = exportJSON(filteredEntries);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Safe filename generation
    const safeTitle = session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateString = new Date().toISOString().split('T')[0];
    a.download = `dope-entries-${safeTitle}-${dateString}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Entries exported to JSON");
  };

  const handleExportSession = () => {
    const json = exportSessionJSON(entries, session);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Safe filename generation
    const safeTitle = session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateString = new Date().toISOString().split('T')[0];
    a.download = `session-${safeTitle}-${dateString}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Session data exported to JSON");
  };

  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = false;
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        
        // Ask user about merge mode
        const confirmMessage = [
          'How would you like to import this data?',
          '',
          'OK = Replace all current entries with imported data',
          'Cancel = Add imported entries to existing data'
        ].join('\n');
        
        const shouldReplace = confirm(confirmMessage);
        const mergeMode = shouldReplace ? 'replace' : 'merge';
        const result = importEntriesJSON(state, setState, text, mergeMode);
        
        if (result.errors.length > 0) {
          const errorList = result.errors.slice(0, 5).join('\n');
          const additionalErrors = result.errors.length > 5 
            ? `\n...and ${result.errors.length - 5} more errors`
            : '';
          const errorMsg = `Import completed with errors:\n${errorList}${additionalErrors}`;
          
          toast.error(errorMsg, {
            duration: 8000,
          });
        }
        
        if (result.imported > 0) {
          const successMsg = `Successfully imported ${result.imported} entries` + 
            (result.errors.length > 0 ? ` (${result.errors.length} errors)` : '');
          toast.success(successMsg, { duration: 5000 });
        } else {
          toast.error('No valid entries found to import');
        }
        
      } catch (error) {
        console.error('Import failed:', error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Import failed: ${errorMsg}`);
      }
    };
    
    input.click();
  };

  const getConfidenceColor = (confidence: 'high' | 'medium' | 'low'): string => {
    switch (confidence) {
      case 'high': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  const getConfidenceIcon = (confidence: 'high' | 'medium' | 'low'): string => {
    switch (confidence) {
      case 'high': return '●';
      case 'medium': return '◐';
      case 'low': return '○';
      default: return '?';
    }
  };

  const getConsistencyColor = (rating: 'excellent' | 'good' | 'fair' | 'poor'): string => {
    switch (rating) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  // Format elevation with 0.1 precision and proper direction
  const formatElevation = (mil: number, moa: number, units: 'MIL' | 'MOA'): string => {
    const value = units === 'MIL' ? mil : moa;
    const formattedValue = Math.abs(value).toFixed(1);
    
    if (Math.abs(value) < 0.05) {
      return `0.0`;
    }
    
    const direction = value > 0 ? 'U' : 'D';
    return `${direction}${formattedValue}`;
  };

  // Format windage with 0.1 precision
  const formatWindage = (mil: number, moa: number, units: 'MIL' | 'MOA'): string => {
    const value = units === 'MIL' ? mil : moa;
    const formattedValue = Math.abs(value).toFixed(1);
    
    if (Math.abs(value) < 0.05) {
      return `0.0`;
    }
    
    const direction = value > 0 ? 'L' : 'R';
    return `${direction}${formattedValue}`;
  };

  // Get the elevation value for the current scope units
  const getElevationValue = (entry: DOPEEntry): number => {
    return calculator.scopeUnits === 'MIL' ? entry.elevationMil : entry.elevationMoa;
  };

  // Helper function to get actual scope adjustments used
  const getActualElevation = (entry: any): { mil: number; moa: number } => {
    return {
      mil: entry.actualAdjMil?.up || 0,
      moa: entry.actualAdjMoa?.up || 0
    };
  };

  const getActualWindage = (entry: any): { mil: number; moa: number } => {
    return {
      mil: entry.actualAdjMil?.right || 0,
      moa: entry.actualAdjMoa?.right || 0
    };
  };

  return (
    <div className="container max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">DOPE (Data On Previous Engagement)</h2>
        
        <button
          onClick={() => setShowStorageManager(!showStorageManager)}
          className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80"
        >
          {showStorageManager ? 'Hide' : 'Show'} Storage Manager
        </button>
      </div>
      
      {/* Storage Manager */}
      {showStorageManager && (
        <div className="space-y-4">
          <StorageManager />
          <EquipmentManager />
        </div>
      )}
      
      {/* Session Management */}
      <div className="p-3 border bg-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <SessionManager compact={true} showNewSession={false} />
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => navigate("/log")}
              className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80"
            >
              Add Entry
            </button>
            <button
              onClick={handleDeleteSession}
              className="px-3 py-1 bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90"
            >
              Delete Session
            </button>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="p-3 border bg-card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium">Sort by:</label>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as "date" | "range")}
              className="w-full px-2 py-1 border"
            >
              <option value="date">Date (newest first)</option>
              <option value="range">Range (ascending)</option>
            </select>
          </div>
          
          <div>
            <label className="text-sm font-medium">Range filter:</label>
            <div className="flex gap-1">
              <input
                type="number"
                placeholder="Min"
                value={filterRange.min}
                onChange={(e) => setFilterRange({...filterRange, min: e.target.value})}
                className="w-full px-2 py-1 border"
              />
              <input
                type="number"
                placeholder="Max"
                value={filterRange.max}
                onChange={(e) => setFilterRange({...filterRange, max: e.target.value})}
                className="w-full px-2 py-1 border"
              />
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium">Notes filter:</label>
            <input
              type="text"
              placeholder="Search notes..."
              value={filterNotes}
              onChange={(e) => setFilterNotes(e.target.value)}
              className="w-full px-2 py-1 border"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showSessionHeaders}
              onChange={(e) => setShowSessionHeaders(e.target.checked)}
            />
            <span className="text-sm">Show session headers</span>
          </label>
          
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showGroupSuggestions}
              onChange={(e) => setShowGroupSuggestions(e.target.checked)}
            />
            <span className="text-sm">Show group suggestions</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportJSON} className="px-3 py-1 bg-primary text-primary-foreground text-sm hover:bg-primary/90">
            Export JSON
          </button>
          <button onClick={handleExportSession} className="px-3 py-1 bg-primary text-primary-foreground text-sm hover:bg-primary/90">
            Export Session
          </button>
          <button onClick={handleImportJSON} className="px-3 py-1 bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80">
            Import JSON
          </button>
          <PDFExport entries={filteredEntries} session={session} />
        </div>
      </div>

      {/* Group Suggestions */}
      {showGroupSuggestions && (
        <div className="p-3 border bg-card">
          <h3 className="font-semibold mb-3">Group Analysis & Suggestions</h3>
          {(() => {
            const suggestions = calculateGroupSuggestions(filteredEntries);
            
            if (suggestions.length === 0) {
              return <p className="text-muted-foreground text-sm">No group suggestions available. Need multiple entries at the same range to generate suggestions.</p>;
            }
            
            return (
              <div className="space-y-2">
                {suggestions.map((suggestion, idx) => (
                  <div key={idx} className="p-2 border bg-muted/50">
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-2 text-sm">
                      <div><strong>{suggestion.range}m</strong></div>
                      <div className={`font-mono ${getConfidenceColor(suggestion.confidenceLevel)}`}>
                        {formatElevation(suggestion.avgElevationMil, suggestion.avgElevationMoa, calculator.scopeUnits)}
                      </div>
                      <div className={`font-mono ${getConfidenceColor(suggestion.confidenceLevel)}`}>
                        {formatWindage(suggestion.avgWindageMil, suggestion.avgWindageMoa, calculator.scopeUnits)}
                      </div>
                      <div>{suggestion.entryCount} shots</div>
                      <div>{suggestion.groupSizeCm > 0 ? `${suggestion.groupSizeCm.toFixed(1)}cm` : 'N/A'}</div>
                      <div className={getConsistencyColor(suggestion.consistencyRating)}>
                        {suggestion.consistencyRating}
                      </div>
                      <div className={`${getConfidenceColor(suggestion.confidenceLevel)} flex items-center gap-1`}>
                        <span>{getConfidenceIcon(suggestion.confidenceLevel)}</span>
                        <span>{suggestion.confidenceLevel}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Entries Table */}
      <div className="border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Range</th>
                <th className="px-3 py-2 text-left">Firearm</th>
                <th className="px-3 py-2 text-left">Ammo</th>
                <th className="px-3 py-2 text-left">Elevation ({calculator.scopeUnits})</th>
                <th className="px-3 py-2 text-left">Windage ({calculator.scopeUnits})</th>
                <th className="px-3 py-2 text-left">Group</th>
                <th className="px-3 py-2 text-left">Notes</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    No entries found. <button onClick={() => navigate("/log")} className="text-primary hover:underline">Add your first entry</button>
                  </td>
                </tr>
              ) : (
                tableRows.map((row, idx) => {
                  if (row.type === 'session') {
                    return (
                      <tr key={`session-${row.sessionId}`} className="dope-session-header">
                        <td colSpan={9}>
                          <div className="session-info">
                            <div className="session-title">{row.sessionTitle}</div>
                            {row.sessionPlace && <div className="session-meta">@ {row.sessionPlace}</div>}
                            <div className="session-meta">{new Date(row.sessionStarted).toLocaleDateString()}</div>
                            {row.firearmName && <div className="session-meta">{row.firearmName}</div>}
                            {row.bulletInfo && <div className="session-meta">{row.bulletInfo}</div>}
                          </div>
                        </td>
                      </tr>
                    );
                  } else {
                    const entry = row.entry;
                    const actualElev = getActualElevation(entry);
                    const actualWind = getActualWindage(entry);
                    
                    return (
                      <tr key={entry.id} className="border-t hover:bg-muted/50">
                        <td className="px-3 py-2">{new Date(entry.createdAt).toLocaleDateString()}</td>
                        <td className="px-3 py-2 font-mono">{entry.rangeM}m</td>
                        <td className="px-3 py-2">{entry.firearmName || 'N/A'}</td>
                        <td className="px-3 py-2">{entry.ammoName || 'N/A'}</td>
                        <td className="px-3 py-2 font-mono">
                          {formatElevation(actualElev.mil, actualElev.moa, calculator.scopeUnits)}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {formatWindage(actualWind.mil, actualWind.moa, calculator.scopeUnits)}
                        </td>
                        <td className="px-3 py-2">
                          {entry.groupSizeCm ? `${entry.groupSizeCm}cm` : 'N/A'}
                        </td>
                        <td className="px-3 py-2">{entry.notes || 'N/A'}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="text-destructive hover:text-destructive/80 text-xs"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  }
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Show DOPE Card Button */}
      {filteredEntries.length > 0 && (
        <div className="flex justify-center">
          <button
            onClick={() => setShowDOPECards(!showDOPECards)}
            className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            {showDOPECards ? 'Hide DOPE Card' : 'Show DOPE Card'}
          </button>
        </div>
      )}

      {/* DOPE Cards */}
      {showDOPECards && dopeCards.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">DOPE Cards</h3>
          {dopeCards.map((dopeCard, cardIdx) => (
            <div key={cardIdx} className="border p-4 bg-card">
              <div className="mb-4">
                <h4 className="font-semibold text-lg">{dopeCard.rifleName}</h4>
                <p className="text-sm text-muted-foreground">
                  {dopeCard.ammoName} • {dopeCard.bulletWeight}gr • 
                  {dopeCard.dataPointCount} range{dopeCard.dataPointCount !== 1 ? 's' : ''} • 
                  {dopeCard.minRange}m - {dopeCard.maxRange}m
                </p>
              </div>

              {/* Ballistic Profile Summary */}
              <div className="mb-4 p-3 bg-muted">
                <div className="text-sm font-medium mb-2">Ballistic Profile</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <KV k="V₀" v={`${Math.round(dopeCard.ballisticProfile.V0)} m/s`} />
                  <KV k="BC" v={dopeCard.ballisticProfile.BC.toFixed(3)} />
                  <KV k="Model" v={dopeCard.ballisticProfile.model} />
                  <KV k="Zero" v={`${dopeCard.ballisticProfile.zeroDistanceM}m`} />
                </div>
              </div>

              {/* DOPE Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border px-2 py-1 text-left">Range (m)</th>
                      <th className="border px-2 py-1 text-left">Elevation ({calculator.scopeUnits})</th>
                      <th className="border px-2 py-1 text-left">Confidence</th>
                      <th className="border px-2 py-1 text-left">Data Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dopeCard.dopeTable.map((dopeEntry, entryIdx) => (
                      <tr key={entryIdx} className={entryIdx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                        <td className="border px-2 py-1 font-mono">{dopeEntry.range}</td>
                        <td className="border px-2 py-1 font-mono">
                          {formatElevation(dopeEntry.elevationMil, dopeEntry.elevationMoa, calculator.scopeUnits)}
                        </td>
                        <td className={`border px-2 py-1 ${getConfidenceColor(dopeEntry.confidence)}`}>
                          <span className="flex items-center gap-1">
                            <span>{getConfidenceIcon(dopeEntry.confidence)}</span>
                            <span>{dopeEntry.confidence}</span>
                          </span>
                        </td>
                        <td className="border px-2 py-1">
                          {dopeEntry.actualEntries > 0 ? dopeEntry.actualEntries : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}