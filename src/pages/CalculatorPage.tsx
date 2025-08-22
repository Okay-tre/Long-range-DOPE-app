import React, { useEffect } from "react";
import { useApp } from "../contexts/AppContext";
import { updateCalculatorField, validateAndCalculate, resetCalculator, setDragModel } from "./calc.handlers";
import { WindClock } from "../components/WindClock";
import { PresetSelectors } from "../components/PresetSelectors";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { Settings, Target, FileText } from "lucide-react";

export function CalculatorPage() {
  const { state, setState } = useApp();
  const { calculator } = state;

  // Auto-calculate when inputs change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (calculator.V0 > 0 && calculator.X > 0 && calculator.bc > 0) {
        validateAndCalculate(state, setState);
      }
    }, 300); // Debounce calculations

    return () => clearTimeout(timer);
  }, [
    calculator.V0, calculator.thetaDeg, calculator.X, calculator.y0Cm,
    calculator.model, calculator.bc, calculator.bulletWeightGr, calculator.temperature, calculator.humidity,
    calculator.windSpeed, calculator.windDirection
  ]);

  const handleFieldChange = (field: keyof typeof calculator, value: any) => {
    updateCalculatorField(state, setState, field, value);
  };

  const handleReset = () => {
    resetCalculator(state, setState);
  };

  return (
    <div className="container max-w-6xl mx-auto p-2 space-y-3">
      <div className="flex items-center justify-between py-1">
        <div>
          <h1 className="text-xl font-semibold">Ballistics Calculator</h1>
          <p className="text-xs text-muted-foreground">
            Configure shooting parameters and get precise ballistic calculations
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.hash = '/equipment'}>
            <Settings className="h-4 w-4 mr-1" />
            Equipment
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            Reset All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left Column - Inputs */}
        <div className="space-y-3">

          {/* Equipment & Ammunition Presets */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-base">Equipment & Ammunition</CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <PresetSelectors />
            </CardContent>
          </Card>

          {/* Shooting Parameters */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-base">Shooting Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="range">Range (m)</Label>
                  <Input
                    id="range"
                    type="number"
                    value={calculator.X}
                    onChange={(e) => handleFieldChange('X', Number(e.target.value))}
                    step="10"
                  />
                </div>
                <div>
                  <Label htmlFor="theta">Launch Angle (degrees)</Label>
                  <Input
                    id="theta"
                    type="number"
                    value={calculator.thetaDeg}
                    onChange={(e) => handleFieldChange('thetaDeg', Number(e.target.value))}
                    step="0.1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Typically 0-5° for long range shooting
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Weather Conditions */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-base">Weather Conditions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="temperature">Temperature (°C)</Label>
                  <Input
                    id="temperature"
                    type="number"
                    value={calculator.temperature}
                    onChange={(e) => handleFieldChange('temperature', Number(e.target.value))}
                    step="1"
                  />
                </div>
                <div>
                  <Label htmlFor="humidity">Humidity (%)</Label>
                  <Input
                    id="humidity"
                    type="number"
                    value={calculator.humidity}
                    onChange={(e) => handleFieldChange('humidity', Number(e.target.value))}
                    step="1"
                    min="0"
                    max="100"
                  />
                </div>
              </div>
              
              <Separator />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
                <div>
                  <Label htmlFor="windSpeed">Wind Speed (m/s)</Label>
                  <Input
                    id="windSpeed"
                    type="number"
                    value={calculator.windSpeed}
                    onChange={(e) => handleFieldChange('windSpeed', Number(e.target.value))}
                    step="0.1"
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    0 = No wind, 5 = Light breeze, 10 = Fresh breeze
                  </p>
                </div>
                
                <div>
                  <Label>Wind Direction</Label>
                  <div className="flex justify-center mt-1">
                    <WindClock
                      direction={calculator.windDirection}
                      speed={calculator.windSpeed}
                      onChange={(direction) => handleFieldChange('windDirection', direction)}
                      size={80}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Results */}
        <div className="space-y-3">
          
          {/* Calculation Results */}
          <div className="calculation-results-section text-white">
            <div className="p-2 border-b border-slate-600">
              <h3 className="font-medium text-white text-base">Calculation Results</h3>
            </div>
            <div className="p-2">
              {calculator.lastResult ? (
                <div className="space-y-2">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-4 gap-1">
                    <div className="text-center p-2 bg-slate-700">
                      <div className="text-xs text-slate-300">Flight</div>
                      <div className="text-sm font-mono text-white">{calculator.lastResult.tFlight.toFixed(3)}s</div>
                    </div>
                    <div className="text-center p-2 bg-slate-700">
                      <div className="text-xs text-slate-300">Impact</div>
                      <div className="text-sm font-mono text-white">{calculator.lastResult.vImpact.toFixed(0)}m/s</div>
                    </div>
                    <div className="text-center p-2 bg-slate-700">
                      <div className="text-xs text-slate-300">Drop</div>
                      <div className="text-sm font-mono text-white">{calculator.lastResult.drop.toFixed(2)}m</div>
                    </div>
                    <div className="text-center p-2 bg-slate-700">
                      <div className="text-xs text-slate-300">Drift</div>
                      <div className="text-sm font-mono text-white">{calculator.lastResult.windDrift 
                          ? (calculator.lastResult.windDrift > 0 ? 'R' : 'L') + Math.abs(calculator.lastResult.windDrift).toFixed(2) + 'm'
                          : "0.00m"}</div>
                    </div>
                  </div>

                  <div className="border-t border-slate-600 pt-2 mt-2">
                    <h4 className="font-medium mb-1 text-white text-sm">Scope Adjustments ({calculator.scopeUnits})</h4>
                    <div className="grid grid-cols-1 gap-1">
                      <div className="p-2 bg-slate-700">
                        <div className="text-xs text-slate-300">Elevation</div>
                        <div className="text-sm font-mono text-white">
                          {calculator.scopeUnits === 'MIL' 
                            ? (calculator.lastResult.holdMil < 0 ? 'U' : 'D') + Math.abs(calculator.lastResult.holdMil).toFixed(2)
                            : (calculator.lastResult.holdMoa < 0 ? 'U' : 'D') + Math.abs(calculator.lastResult.holdMoa).toFixed(2)
                          }
                        </div>
                      </div>
                      {calculator.lastResult.windDrift && calculator.lastResult.windDrift !== 0 && (
                        <div className="p-2 bg-slate-700">
                          <div className="text-xs text-slate-300">Windage</div>
                          <div className="text-sm font-mono text-white">
                            {calculator.scopeUnits === 'MIL'
                              ? (calculator.lastResult.windDrift > 0 ? 'L' : 'R') + Math.abs((calculator.lastResult.windDrift / calculator.X) * 1000).toFixed(2)
                              : (calculator.lastResult.windDrift > 0 ? 'L' : 'R') + Math.abs((calculator.lastResult.windDrift / calculator.X) * 3438).toFixed(2)
                            }
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-600 pt-2 mt-2">
                    <h4 className="font-medium mb-1 text-white text-sm">Conditions Used</h4>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div className="flex justify-between text-slate-200">
                        <span>Model:</span>
                        <span className="font-mono">{calculator.lastResult.modelUsed}</span>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>Bullet Weight:</span>
                        <span className="font-mono">{calculator.bulletWeightGr}gr</span>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>Air Density:</span>
                        <span className="font-mono">{calculator.lastResult.rhoUsed.toFixed(3)} kg/m³</span>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>Temperature:</span>
                        <span className="font-mono">{calculator.temperature}°C</span>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>Humidity:</span>
                        <span className="font-mono">{calculator.humidity}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-300">
                  <p className="mb-1">Enter valid parameters to see results</p>
                  <p className="text-sm">Results will update automatically as you type</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                className="w-full" 
                onClick={() => validateAndCalculate(state, setState)}
                disabled={!calculator.V0 || !calculator.X || !calculator.bc}
                size="sm"
              >
                Recalculate
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => window.location.hash = '/log'}>
                  <Target className="h-4 w-4 mr-1" />
                  Log Results
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.location.hash = '/dope'}>
                  <FileText className="h-4 w-4 mr-1" />
                  View DOPE
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Calculation Tips */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-base">Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>• Configure your equipment and ammunition in the Equipment page for accurate calculations</p>
              <p>• Results update automatically as you change parameters</p>
              <p>• Use saved presets for quick configuration of different rifles/loads</p>
              <p>• Log your results to build a comprehensive DOPE card</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
