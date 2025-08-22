import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { createEquipmentPreset, createBulletPreset, applyEquipmentPreset, applyBulletPreset, type EquipmentPreset, type BulletPreset, type ModelKind, type ScopeUnits } from "../lib/appState";
import { Button } from "./ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Separator } from "./ui/separator";
import { Trash2, Edit, Plus, Download, Upload } from "lucide-react";
import { toast } from "sonner@2.0.3";

interface EquipmentManagerProps {
  showInCalculator?: boolean;
}

export function EquipmentManager({ showInCalculator = false }: EquipmentManagerProps) {
  const { state, setState } = useApp();
  const { equipmentPresets, bulletPresets } = state;

  const [showEquipmentDialog, setShowEquipmentDialog] = useState(false);
  const [showBulletDialog, setShowBulletDialog] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<EquipmentPreset | null>(null);
  const [editingBullet, setEditingBullet] = useState<BulletPreset | null>(null);

  // Equipment form state
  const [equipmentForm, setEquipmentForm] = useState({
    name: "",
    firearmName: "",
    y0Cm: 3.5,
    zeroDistanceM: 100,
    scopeUnits: "MIL" as ScopeUnits,
    barrelLengthIn: 20,
    twistRateIn: 8,
    notes: ""
  });

  // Bullet form state
  const [bulletForm, setBulletForm] = useState({
    name: "",
    ammoName: "",
    bulletWeightGr: 175,
    bc: 0.25,
    model: "G7" as ModelKind,
    V0: 800,
    manufacturer: "",
    notes: ""
  });

  const resetEquipmentForm = () => {
    setEquipmentForm({
      name: "",
      firearmName: "",
      y0Cm: 3.5,
      zeroDistanceM: 100,
      scopeUnits: "MIL",
      barrelLengthIn: 20,
      twistRateIn: 8,
      notes: ""
    });
    setEditingEquipment(null);
  };

  const resetBulletForm = () => {
    setBulletForm({
      name: "",
      ammoName: "",
      bulletWeightGr: 175,
      bc: 0.25,
      model: "G7",
      V0: 800,
      manufacturer: "",
      notes: ""
    });
    setEditingBullet(null);
  };

  const handleSaveEquipment = () => {
    if (!equipmentForm.name.trim()) {
      toast.error("Equipment name is required");
      return;
    }

    if (editingEquipment) {
      // Update existing
      const updatedPresets = equipmentPresets.map(preset =>
        preset.id === editingEquipment.id
          ? { ...preset, ...equipmentForm }
          : preset
      );
      setState({
        ...state,
        equipmentPresets: updatedPresets
      });
      toast.success("Equipment preset updated");
    } else {
      // Create new
      const newPreset = createEquipmentPreset(equipmentForm);
      setState({
        ...state,
        equipmentPresets: [...equipmentPresets, newPreset]
      });
      toast.success("Equipment preset saved");
    }

    resetEquipmentForm();
    setShowEquipmentDialog(false);
  };

  const handleSaveBullet = () => {
    if (!bulletForm.name.trim()) {
      toast.error("Bullet name is required");
      return;
    }

    if (editingBullet) {
      // Update existing
      const updatedPresets = bulletPresets.map(preset =>
        preset.id === editingBullet.id
          ? { ...preset, ...bulletForm }
          : preset
      );
      setState({
        ...state,
        bulletPresets: updatedPresets
      });
      toast.success("Bullet preset updated");
    } else {
      // Create new
      const newPreset = createBulletPreset(bulletForm);
      setState({
        ...state,
        bulletPresets: [...bulletPresets, newPreset]
      });
      toast.success("Bullet preset saved");
    }

    resetBulletForm();
    setShowBulletDialog(false);
  };

  const handleDeleteEquipment = (id: string) => {
    if (confirm("Delete this equipment preset?")) {
      setState({
        ...state,
        equipmentPresets: equipmentPresets.filter(preset => preset.id !== id)
      });
      toast.success("Equipment preset deleted");
    }
  };

  const handleDeleteBullet = (id: string) => {
    if (confirm("Delete this bullet preset?")) {
      setState({
        ...state,
        bulletPresets: bulletPresets.filter(preset => preset.id !== id)
      });
      toast.success("Bullet preset deleted");
    }
  };

  const handleEditEquipment = (preset: EquipmentPreset) => {
    setEquipmentForm({
      name: preset.name,
      firearmName: preset.firearmName,
      y0Cm: preset.y0Cm,
      zeroDistanceM: preset.zeroDistanceM,
      scopeUnits: preset.scopeUnits,
      barrelLengthIn: preset.barrelLengthIn,
      twistRateIn: preset.twistRateIn,
      notes: preset.notes || ""
    });
    setEditingEquipment(preset);
    setShowEquipmentDialog(true);
  };

  const handleEditBullet = (preset: BulletPreset) => {
    setBulletForm({
      name: preset.name,
      ammoName: preset.ammoName,
      bulletWeightGr: preset.bulletWeightGr,
      bc: preset.bc,
      model: preset.model,
      V0: preset.V0,
      manufacturer: preset.manufacturer || "",
      notes: preset.notes || ""
    });
    setEditingBullet(preset);
    setShowBulletDialog(true);
  };

  const handleApplyEquipment = (preset: EquipmentPreset) => {
    setState({
      ...state,
      calculator: applyEquipmentPreset(state.calculator, preset)
    });
    toast.success(`Applied equipment: ${preset.name}`);
  };

  const handleApplyBullet = (preset: BulletPreset) => {
    setState({
      ...state,
      calculator: applyBulletPreset(state.calculator, preset)
    });
    toast.success(`Applied bullet: ${preset.name}`);
  };

  const handleSaveCurrentAsEquipment = () => {
    const { calculator } = state;
    const name = calculator.firearmName || "Custom Equipment";
    
    setEquipmentForm({
      name,
      firearmName: calculator.firearmName,
      y0Cm: calculator.y0Cm,
      zeroDistanceM: calculator.zeroDistanceM,
      scopeUnits: calculator.scopeUnits,
      barrelLengthIn: calculator.barrelLengthIn,
      twistRateIn: calculator.twistRateIn,
      notes: ""
    });
    setShowEquipmentDialog(true);
  };

  const handleSaveCurrentAsBullet = () => {
    const { calculator } = state;
    const name = calculator.ammoName || "Custom Bullet";
    
    setBulletForm({
      name,
      ammoName: calculator.ammoName,
      bulletWeightGr: calculator.bulletWeightGr,
      bc: calculator.bc,
      model: calculator.model,
      V0: calculator.V0,
      manufacturer: "",
      notes: ""
    });
    setShowBulletDialog(true);
  };

  // Function to load current calculator settings into equipment form
  const handleLoadCurrentEquipment = () => {
    const { calculator } = state;
    const name = calculator.firearmName || "Current Equipment";
    
    setEquipmentForm({
      name,
      firearmName: calculator.firearmName,
      y0Cm: calculator.y0Cm,
      zeroDistanceM: calculator.zeroDistanceM,
      scopeUnits: calculator.scopeUnits,
      barrelLengthIn: calculator.barrelLengthIn,
      twistRateIn: calculator.twistRateIn,
      notes: ""
    });
    toast.success("Loaded current calculator equipment settings");
  };

  // Function to load current calculator settings into bullet form
  const handleLoadCurrentBullet = () => {
    const { calculator } = state;
    const name = calculator.ammoName || "Current Bullet";
    
    setBulletForm({
      name,
      ammoName: calculator.ammoName,
      bulletWeightGr: calculator.bulletWeightGr,
      bc: calculator.bc,
      model: calculator.model,
      V0: calculator.V0,
      manufacturer: "",
      notes: ""
    });
    toast.success("Loaded current calculator bullet settings");
  };

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Equipment & Bullet Presets</h3>
        <div className="flex gap-2">
          {showInCalculator && (
            <>
              <Button
                onClick={handleSaveCurrentAsEquipment}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                Save Equipment
              </Button>
              <Button
                onClick={handleSaveCurrentAsBullet}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                Save Bullet
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Equipment Presets */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base">Equipment Presets ({equipmentPresets.length})</CardTitle>
          <Dialog open={showEquipmentDialog} onOpenChange={setShowEquipmentDialog}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={resetEquipmentForm}>
                <Plus className="h-4 w-4 mr-1" />
                Add Equipment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingEquipment ? "Edit Equipment Preset" : "Add Equipment Preset"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Quick Load from Calculator Section */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-800">Quick Load from Calculator</span>
                  </div>
                  <p className="text-xs text-blue-600 mb-2">
                    Load current calculator settings to quickly create or update this preset
                  </p>
                  <Button
                    onClick={handleLoadCurrentEquipment}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Load Current Equipment Settings
                  </Button>
                </div>

                <Separator />

                <div>
                  <Label htmlFor="equipment-name">Preset Name *</Label>
                  <Input
                    id="equipment-name"
                    value={equipmentForm.name}
                    onChange={(e) => setEquipmentForm({...equipmentForm, name: e.target.value})}
                    placeholder="e.g., AR-15 Setup, Precision Rifle"
                  />
                </div>
                <div>
                  <Label htmlFor="firearm-name">Firearm Name</Label>
                  <Input
                    id="firearm-name"
                    value={equipmentForm.firearmName}
                    onChange={(e) => setEquipmentForm({...equipmentForm, firearmName: e.target.value})}
                    placeholder="e.g., Custom AR-15"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="y0-cm">Height Over Bore (cm)</Label>
                    <Input
                      id="y0-cm"
                      type="number"
                      step="0.1"
                      value={equipmentForm.y0Cm}
                      onChange={(e) => setEquipmentForm({...equipmentForm, y0Cm: Number(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="zero-distance">Zero Distance (m)</Label>
                    <Input
                      id="zero-distance"
                      type="number"
                      value={equipmentForm.zeroDistanceM}
                      onChange={(e) => setEquipmentForm({...equipmentForm, zeroDistanceM: Number(e.target.value)})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="scope-units">Scope Units</Label>
                    <Select value={equipmentForm.scopeUnits} onValueChange={(value: ScopeUnits) => setEquipmentForm({...equipmentForm, scopeUnits: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MIL">MIL</SelectItem>
                        <SelectItem value="MOA">MOA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="barrel-length">Barrel (in)</Label>
                    <Input
                      id="barrel-length"
                      type="number"
                      step="0.1"
                      value={equipmentForm.barrelLengthIn}
                      onChange={(e) => setEquipmentForm({...equipmentForm, barrelLengthIn: Number(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="twist-rate">Twist (in)</Label>
                    <Input
                      id="twist-rate"
                      type="number"
                      step="0.1"
                      value={equipmentForm.twistRateIn}
                      onChange={(e) => setEquipmentForm({...equipmentForm, twistRateIn: Number(e.target.value)})}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="equipment-notes">Notes</Label>
                  <Textarea
                    id="equipment-notes"
                    value={equipmentForm.notes}
                    onChange={(e) => setEquipmentForm({...equipmentForm, notes: e.target.value})}
                    placeholder="Optional notes about this equipment setup"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowEquipmentDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEquipment}>
                    {editingEquipment ? "Update" : "Save"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {equipmentPresets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No equipment presets saved. Create your first preset to quickly apply rifle and scope configurations.
            </p>
          ) : (
            <div className="space-y-2">
              {equipmentPresets.map((preset) => (
                <div key={preset.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{preset.name}</span>
                      <span className="text-xs text-muted-foreground">({preset.scopeUnits})</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {preset.firearmName} • {preset.y0Cm}cm HOB • {preset.zeroDistanceM}m zero
                    </div>
                    {preset.notes && (
                      <div className="text-xs text-muted-foreground italic truncate">
                        {preset.notes}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {showInCalculator && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApplyEquipment(preset)}
                        className="text-xs"
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        Apply
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEditEquipment(preset)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteEquipment(preset.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bullet Presets */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base">Bullet Presets ({bulletPresets.length})</CardTitle>
          <Dialog open={showBulletDialog} onOpenChange={setShowBulletDialog}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={resetBulletForm}>
                <Plus className="h-4 w-4 mr-1" />
                Add Bullet
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingBullet ? "Edit Bullet Preset" : "Add Bullet Preset"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Quick Load from Calculator Section */}
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-green-800">Quick Load from Calculator</span>
                  </div>
                  <p className="text-xs text-green-600 mb-2">
                    Load current calculator settings to quickly create or update this preset
                  </p>
                  <Button
                    onClick={handleLoadCurrentBullet}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Load Current Bullet Settings
                  </Button>
                </div>

                <Separator />

                <div>
                  <Label htmlFor="bullet-name">Preset Name *</Label>
                  <Input
                    id="bullet-name"
                    value={bulletForm.name}
                    onChange={(e) => setBulletForm({...bulletForm, name: e.target.value})}
                    placeholder="e.g., 175gr FGMM, Custom Load"
                  />
                </div>
                <div>
                  <Label htmlFor="ammo-name">Ammunition Name</Label>
                  <Input
                    id="ammo-name"
                    value={bulletForm.ammoName}
                    onChange={(e) => setBulletForm({...bulletForm, ammoName: e.target.value})}
                    placeholder="e.g., Federal Gold Medal Match"
                  />
                </div>
                <div>
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Input
                    id="manufacturer"
                    value={bulletForm.manufacturer}
                    onChange={(e) => setBulletForm({...bulletForm, manufacturer: e.target.value})}
                    placeholder="e.g., Federal, Hornady, Sierra"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="bullet-weight">Weight (gr)</Label>
                    <Input
                      id="bullet-weight"
                      type="number"
                      value={bulletForm.bulletWeightGr}
                      onChange={(e) => setBulletForm({...bulletForm, bulletWeightGr: Number(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="muzzle-velocity">Velocity (m/s)</Label>
                    <Input
                      id="muzzle-velocity"
                      type="number"
                      value={bulletForm.V0}
                      onChange={(e) => setBulletForm({...bulletForm, V0: Number(e.target.value)})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="ballistic-coefficient">BC</Label>
                    <Input
                      id="ballistic-coefficient"
                      type="number"
                      step="0.001"
                      value={bulletForm.bc}
                      onChange={(e) => setBulletForm({...bulletForm, bc: Number(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="drag-model">Drag Model</Label>
                    <Select value={bulletForm.model} onValueChange={(value: ModelKind) => setBulletForm({...bulletForm, model: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="G1">G1</SelectItem>
                        <SelectItem value="G7">G7</SelectItem>
                        <SelectItem value="noDrag">No Drag</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="bullet-notes">Notes</Label>
                  <Textarea
                    id="bullet-notes"
                    value={bulletForm.notes}
                    onChange={(e) => setBulletForm({...bulletForm, notes: e.target.value})}
                    placeholder="Optional notes about this bullet/load"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowBulletDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveBullet}>
                    {editingBullet ? "Update" : "Save"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {bulletPresets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No bullet presets saved. Create your first preset to quickly apply ammunition configurations.
            </p>
          ) : (
            <div className="space-y-2">
              {bulletPresets.map((preset) => (
                <div key={preset.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{preset.name}</span>
                      <span className="text-xs text-muted-foreground">({preset.model})</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {preset.ammoName} • {preset.bulletWeightGr}gr • BC {preset.bc} • {preset.V0}m/s
                    </div>
                    {preset.manufacturer && (
                      <div className="text-xs text-muted-foreground">
                        {preset.manufacturer}
                      </div>
                    )}
                    {preset.notes && (
                      <div className="text-xs text-muted-foreground italic truncate">
                        {preset.notes}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {showInCalculator && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApplyBullet(preset)}
                        className="text-xs"
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        Apply
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEditBullet(preset)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteBullet(preset.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}