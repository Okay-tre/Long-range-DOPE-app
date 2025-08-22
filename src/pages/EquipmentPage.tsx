import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { createEquipmentPreset, createBulletPreset, type ScopeUnits, type ModelKind } from "../lib/appState";
import { EquipmentManager } from "../components/EquipmentManager";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Download, Settings, Calculator, Target, Wrench } from "lucide-react";
import { toast } from "sonner@2.0.3";

export function EquipmentPage() {
  const { state, setState } = useApp();
  const { calculator } = state;
  
  // Save preset dialog states
  const [showSaveEquipmentDialog, setShowSaveEquipmentDialog] = useState(false);
  const [showSaveBulletDialog, setShowSaveBulletDialog] = useState(false);
  
  // Save preset form states
  const [equipmentPresetName, setEquipmentPresetName] = useState("");
  const [equipmentPresetNotes, setEquipmentPresetNotes] = useState("");
  const [bulletPresetName, setBulletPresetName] = useState("");
  const [bulletPresetNotes, setBulletPresetNotes] = useState("");
  const [bulletManufacturer, setBulletManufacturer] = useState("");

  const handleFieldChange = (field: keyof typeof calculator, value: any) => {
    setState({
      ...state,
      calculator: {
        ...calculator,
        [field]: value
      }
    });
  };

  // Save equipment preset handler
  const handleSaveEquipmentPreset = () => {
    if (!equipmentPresetName.trim()) {
      toast.error("Equipment preset name is required");
      return;
    }

    const newPreset = createEquipmentPreset({
      name: equipmentPresetName.trim(),
      firearmName: calculator.firearmName,
      y0Cm: calculator.y0Cm,
      zeroDistanceM: calculator.zeroDistanceM,
      scopeUnits: calculator.scopeUnits,
      barrelLengthIn: calculator.barrelLengthIn,
      twistRateIn: calculator.twistRateIn,
      notes: equipmentPresetNotes.trim()
    });

    setState({
      ...state,
      equipmentPresets: [...state.equipmentPresets, newPreset]
    });

    toast.success(`Equipment preset "${equipmentPresetName}" saved`);
    setEquipmentPresetName("");
    setEquipmentPresetNotes("");
    setShowSaveEquipmentDialog(false);
  };

  // Save bullet preset handler
  const handleSaveBulletPreset = () => {
    if (!bulletPresetName.trim()) {
      toast.error("Bullet preset name is required");
      return;
    }

    const newPreset = createBulletPreset({
      name: bulletPresetName.trim(),
      ammoName: calculator.ammoName,
      bulletWeightGr: calculator.bulletWeightGr,
      bc: calculator.bc,
      model: calculator.model,
      V0: calculator.V0,
      manufacturer: bulletManufacturer.trim(),
      notes: bulletPresetNotes.trim()
    });

    setState({
      ...state,
      bulletPresets: [...state.bulletPresets, newPreset]
    });

    toast.success(`Bullet preset "${bulletPresetName}" saved`);
    setBulletPresetName("");
    setBulletPresetNotes("");
    setBulletManufacturer("");
    setShowSaveBulletDialog(false);
  };

  // Open save dialogs with default names
  const openSaveEquipmentDialog = () => {
    setEquipmentPresetName(calculator.firearmName || "Equipment Setup");
    setEquipmentPresetNotes("");
    setShowSaveEquipmentDialog(true);
  };

  const openSaveBulletDialog = () => {
    setBulletPresetName(calculator.ammoName || "Bullet Load");
    setBulletPresetNotes("");
    setBulletManufacturer("");
    setShowSaveBulletDialog(true);
  };

  return (
    <div className="container max-w-6xl mx-auto p-2 space-y-3">
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <Wrench className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Equipment & Ammunition Configuration</h1>
            <p className="text-xs text-muted-foreground">
              Configure your rifle, scope, and ammunition settings. Save configurations as presets for quick access.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.hash = '/calc'}>
            <Calculator className="h-4 w-4 mr-1" />
            Calculator
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.hash = '/log'}>
            <Target className="h-4 w-4 mr-1" />
            Log Results
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left Column - Current Configuration */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-4 w-4" />
                  Equipment Configuration
                </CardTitle>
                <Dialog open={showSaveEquipmentDialog} onOpenChange={setShowSaveEquipmentDialog}>
                  <DialogTrigger asChild>
                    <Button onClick={openSaveEquipmentDialog} size="sm">
                      <Download className="h-3 w-3 mr-1" />
                      Save Preset
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Save Equipment Preset</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="equipment-preset-name">Preset Name *</Label>
                        <Input
                          id="equipment-preset-name"
                          value={equipmentPresetName}
                          onChange={(e) => setEquipmentPresetName(e.target.value)}
                          placeholder="Enter preset name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="equipment-preset-notes">Notes (Optional)</Label>
                        <Textarea
                          id="equipment-preset-notes"
                          value={equipmentPresetNotes}
                          onChange={(e) => setEquipmentPresetNotes(e.target.value)}
                          placeholder="Optional notes about this equipment setup"
                          rows={2}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground p-2 bg-muted">
                        <strong>Will save:</strong> {calculator.firearmName || "Firearm"}, {calculator.y0Cm}cm HOB, {calculator.zeroDistanceM}m zero, {calculator.scopeUnits} units, {calculator.barrelLengthIn}" barrel, 1:{calculator.twistRateIn}" twist
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setShowSaveEquipmentDialog(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleSaveEquipmentPreset}>
                          Save Preset
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Scope Units - Highlighted */}
              <div className="scope-units-highlight p-3 mb-2">
                <div>
                  <Label htmlFor="scopeUnits" className="scope-units-label">Scope Units</Label>
                  <Select value={calculator.scopeUnits} onValueChange={(value) => handleFieldChange('scopeUnits', value)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MIL">MIL (Milliradian)</SelectItem>
                      <SelectItem value="MOA">MOA (Minute of Angle)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    All scope adjustments will be displayed in {calculator.scopeUnits}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firearm">Firearm Name</Label>
                  <Input
                    id="firearm"
                    value={calculator.firearmName}
                    onChange={(e) => handleFieldChange('firearmName', e.target.value)}
                    placeholder="e.g., Remington 700"
                  />
                </div>
                <div>
                  <Label htmlFor="barrel">Barrel Length (inches)</Label>
                  <Input
                    id="barrel"
                    type="number"
                    value={calculator.barrelLengthIn}
                    onChange={(e) => handleFieldChange('barrelLengthIn', Number(e.target.value))}
                    step="0.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="twist">Twist Rate (1 in X inches)</Label>
                  <Input
                    id="twist"
                    type="number"
                    value={calculator.twistRateIn}
                    onChange={(e) => handleFieldChange('twistRateIn', Number(e.target.value))}
                    step="0.5"
                  />
                </div>
                <div>
                  <Label htmlFor="height">Height Over Bore (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={calculator.y0Cm}
                    onChange={(e) => handleFieldChange('y0Cm', Number(e.target.value))}
                    step="0.1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Distance from bore centerline to scope centerline
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="zeroDistance">Zero Distance (m)</Label>
                <Input
                  id="zeroDistance"
                  type="number"
                  value={calculator.zeroDistanceM}
                  onChange={(e) => handleFieldChange('zeroDistanceM', Number(e.target.value))}
                  step="25"
                  min="25"
                  max="1000"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Range at which rifle is zeroed (affects DOPE calculations)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4" />
                  Bullet Configuration
                </CardTitle>
                <Dialog open={showSaveBulletDialog} onOpenChange={setShowSaveBulletDialog}>
                  <DialogTrigger asChild>
                    <Button onClick={openSaveBulletDialog} size="sm">
                      <Download className="h-3 w-3 mr-1" />
                      Save Preset
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Save Bullet Preset</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="bullet-preset-name">Preset Name *</Label>
                        <Input
                          id="bullet-preset-name"
                          value={bulletPresetName}
                          onChange={(e) => setBulletPresetName(e.target.value)}
                          placeholder="Enter preset name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="bullet-manufacturer">Manufacturer (Optional)</Label>
                        <Input
                          id="bullet-manufacturer"
                          value={bulletManufacturer}
                          onChange={(e) => setBulletManufacturer(e.target.value)}
                          placeholder="e.g., Federal, Hornady, Sierra"
                        />
                      </div>
                      <div>
                        <Label htmlFor="bullet-preset-notes">Notes (Optional)</Label>
                        <Textarea
                          id="bullet-preset-notes"
                          value={bulletPresetNotes}
                          onChange={(e) => setBulletPresetNotes(e.target.value)}
                          placeholder="Optional notes about this bullet/load"
                          rows={2}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground p-2 bg-muted">
                        <strong>Will save:</strong> {calculator.ammoName || "Ammunition"}, {calculator.bulletWeightGr}gr, BC {calculator.bc}, {calculator.model} model, {calculator.V0}m/s
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setShowSaveBulletDialog(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleSaveBulletPreset}>
                          Save Preset
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="ammo">Ammunition Name</Label>
                <Input
                  id="ammo"
                  value={calculator.ammoName}
                  onChange={(e) => handleFieldChange('ammoName', e.target.value)}
                  placeholder="e.g., Federal SMK 175gr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="bulletWeight">Bullet Weight (grains)</Label>
                  <Input
                    id="bulletWeight"
                    type="number"
                    value={calculator.bulletWeightGr}
                    onChange={(e) => handleFieldChange('bulletWeightGr', Number(e.target.value))}
                    step="0.1"
                    placeholder="e.g., 175"
                  />
                </div>
                <div>
                  <Label htmlFor="v0">Muzzle Velocity (m/s)</Label>
                  <Input
                    id="v0"
                    type="number"
                    value={calculator.V0}
                    onChange={(e) => handleFieldChange('V0', Number(e.target.value))}
                    step="1"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="model">Drag Model</Label>
                <Select value={calculator.model} onValueChange={(value: ModelKind) => handleFieldChange('model', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="noDrag">No Drag (Vacuum)</SelectItem>
                    <SelectItem value="G1">G1 (Flat Base)</SelectItem>
                    <SelectItem value="G7">G7 (Boat Tail)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {calculator.model !== "noDrag" && (
                <div>
                  <Label htmlFor="bc">
                    Ballistic Coefficient ({calculator.model})
                  </Label>
                  <Input
                    id="bc"
                    type="number"
                    value={calculator.bc}
                    onChange={(e) => handleFieldChange('bc', Number(e.target.value))}
                    step="0.001"
                    placeholder={calculator.model === "G1" ? "e.g., 0.450" : "e.g., 0.250"}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {calculator.model === "G1" 
                      ? "Typical range: 0.200 - 0.800 for rifle bullets"
                      : "Typical range: 0.150 - 0.400 for modern bullets"
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Preset Management */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <CardTitle className="text-base">Preset Management</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                Manage your saved equipment and bullet presets. Apply presets to quickly configure your calculator.
              </p>
            </CardHeader>
            <CardContent className="py-2">
              <EquipmentManager showInCalculator={true} />
            </CardContent>
          </Card>

          {/* Quick Setup Guide */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Quick Setup Guide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <div className="w-5 h-5 bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">1</div>
                  <div>
                    <div className="font-medium">Configure Equipment</div>
                    <div className="text-muted-foreground text-xs">Set your rifle, scope, and zero distance in the current configuration section</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-5 h-5 bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">2</div>
                  <div>
                    <div className="font-medium">Configure Ammunition</div>
                    <div className="text-muted-foreground text-xs">Enter bullet weight, velocity, and ballistic coefficient for accurate calculations</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-5 h-5 bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">3</div>
                  <div>
                    <div className="font-medium">Save as Presets</div>
                    <div className="text-muted-foreground text-xs">Save your configurations for quick access in the calculator</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-5 h-5 bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">4</div>
                  <div>
                    <div className="font-medium">Use in Calculator</div>
                    <div className="text-muted-foreground text-xs">Select presets from the calculator page for quick setup</div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t">
                <h4 className="font-medium mb-1 text-sm">Current Summary</h4>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div><strong>Equipment:</strong> {calculator.firearmName || "Unnamed"} • {calculator.scopeUnits} • {calculator.zeroDistanceM}m zero</div>
                  <div><strong>Bullet:</strong> {calculator.ammoName || "Unnamed"} • {calculator.bulletWeightGr}gr • {calculator.V0}m/s</div>
                </div>
              </div>

              <div className="pt-2 border-t">
                <Button onClick={() => window.location.hash = '/calc'} className="w-full" size="sm">
                  <Calculator className="h-4 w-4 mr-1" />
                  Go to Calculator
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
