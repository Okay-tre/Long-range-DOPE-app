import React from "react";
import { useApp } from "../contexts/AppContext";
import { applyEquipmentPreset, applyBulletPreset } from "../lib/appState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Settings } from "lucide-react";
import { toast } from "sonner@2.0.3";

interface PresetSelectorsProps {
  onManagePresets?: () => void;
}

export function PresetSelectors({ onManagePresets }: PresetSelectorsProps) {
  const { state, setState } = useApp();
  const { equipmentPresets, bulletPresets, calculator } = state;

  const handleEquipmentChange = (presetId: string) => {
    if (presetId === "none") return;
    
    const preset = equipmentPresets.find(p => p.id === presetId);
    if (preset) {
      setState({
        ...state,
        calculator: applyEquipmentPreset(calculator, preset)
      });
      toast.success(`Applied equipment: ${preset.name}`);
    }
  };

  const handleBulletChange = (presetId: string) => {
    if (presetId === "none") return;
    
    const preset = bulletPresets.find(p => p.id === presetId);
    if (preset) {
      setState({
        ...state,
        calculator: applyBulletPreset(calculator, preset)
      });
      toast.success(`Applied bullet: ${preset.name}`);
    }
  };

  // Find currently matching presets
  const matchingEquipment = equipmentPresets.find(preset => 
    preset.firearmName === calculator.firearmName &&
    preset.y0Cm === calculator.y0Cm &&
    preset.zeroDistanceM === calculator.zeroDistanceM &&
    preset.scopeUnits === calculator.scopeUnits
  );

  const matchingBullet = bulletPresets.find(preset =>
    preset.ammoName === calculator.ammoName &&
    preset.bulletWeightGr === calculator.bulletWeightGr &&
    preset.bc === calculator.bc &&
    preset.model === calculator.model &&
    preset.V0 === calculator.V0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Saved equipment and bullets</h3>
        {onManagePresets && (
          <Button
            onClick={onManagePresets}
            variant="ghost"
            size="sm"
            className="text-xs"
          >
            <Settings className="h-3 w-3 mr-1" />
            Manage
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Equipment Preset Selector */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Equipment Preset</Label>
          <Select
            value={matchingEquipment ? matchingEquipment.id : "none"}
            onValueChange={handleEquipmentChange}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select equipment preset..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>
                {equipmentPresets.length === 0 
                  ? "No equipment presets saved" 
                  : "Select equipment preset..."}
              </SelectItem>
              {equipmentPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {preset.firearmName} • {preset.scopeUnits} • {preset.zeroDistanceM}m
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {matchingEquipment && (
            <p className="text-xs text-green-600">
              ✓ Matches "{matchingEquipment.name}" preset
            </p>
          )}
        </div>

        {/* Bullet Preset Selector */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Bullet Preset</Label>
          <Select
            value={matchingBullet ? matchingBullet.id : "none"}
            onValueChange={handleBulletChange}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select bullet preset..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>
                {bulletPresets.length === 0 
                  ? "No bullet presets saved" 
                  : "Select bullet preset..."}
              </SelectItem>
              {bulletPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {preset.bulletWeightGr}gr • {preset.model} • {preset.V0}m/s
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {matchingBullet && (
            <p className="text-xs text-green-600">
              ✓ Matches "{matchingBullet.name}" preset
            </p>
          )}
        </div>
      </div>

      {/* Summary */}
      {(equipmentPresets.length > 0 || bulletPresets.length > 0) && (
        <div className="text-xs text-muted-foreground">
          {equipmentPresets.length} equipment preset{equipmentPresets.length !== 1 ? 's' : ''} • {bulletPresets.length} bullet preset{bulletPresets.length !== 1 ? 's' : ''} saved
        </div>
      )}
    </div>
  );
}
