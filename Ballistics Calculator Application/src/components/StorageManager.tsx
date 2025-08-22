import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { toast } from 'sonner@2.0.3';
import { 
  getStorageInfo, 
  exportAppData, 
  importAppData, 
  clearAllData, 
  refreshData 
} from '../lib/appState';
import { enhancedStorage } from '../lib/indexedDB';

interface StorageStats {
  enhanced: { 
    count: number; 
    totalSize: number; 
    oldestTimestamp?: number; 
    newestTimestamp?: number 
  };
  localStorage: { 
    size: number; 
    available: boolean 
  };
  migration: { 
    needed: boolean; 
    completed: boolean 
  };
}

export function StorageManager() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const storageInfo = await getStorageInfo();
      setStats(storageInfo);
    } catch (error) {
      console.error('Failed to load storage stats:', error);
      toast.error('Failed to load storage information');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      const exportData = await exportAppData();
      
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ballistics-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Data exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export data');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        setLoading(true);
        const text = await file.text();
        await importAppData(text);
        
        // Refresh stats after import
        await loadStats();
        
        toast.success('Data imported successfully');
      } catch (error) {
        console.error('Import failed:', error);
        toast.error('Failed to import data: ' + (error as Error).message);
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  const handleClearData = async () => {
    if (!confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await clearAllData();
      await loadStats();
      toast.success('All data cleared');
    } catch (error) {
      console.error('Clear data failed:', error);
      toast.error('Failed to clear data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshData = async () => {
    try {
      setRefreshing(true);
      await refreshData();
      await loadStats();
      toast.success('Data refreshed from storage');
    } catch (error) {
      console.error('Refresh failed:', error);
      toast.error('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading && !stats) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading storage information...</div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Storage Management</h3>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadStats}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh Stats'}
        </Button>
      </div>

      {stats && (
        <div className="space-y-4">
          {/* IndexedDB Stats */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-medium">Enhanced Storage (IndexedDB)</h4>
              <Badge variant="secondary">Primary</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-muted rounded p-3">
                <div className="font-mono">{stats.enhanced.count}</div>
                <div className="text-muted-foreground">Items</div>
              </div>
              <div className="bg-muted rounded p-3">
                <div className="font-mono">{formatBytes(stats.enhanced.totalSize)}</div>
                <div className="text-muted-foreground">Total Size</div>
              </div>
              {stats.enhanced.oldestTimestamp && (
                <div className="bg-muted rounded p-3">
                  <div className="font-mono text-xs">
                    {formatDate(stats.enhanced.oldestTimestamp)}
                  </div>
                  <div className="text-muted-foreground">Oldest Data</div>
                </div>
              )}
              {stats.enhanced.newestTimestamp && (
                <div className="bg-muted rounded p-3">
                  <div className="font-mono text-xs">
                    {formatDate(stats.enhanced.newestTimestamp)}
                  </div>
                  <div className="text-muted-foreground">Newest Data</div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* localStorage Stats */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-medium">localStorage</h4>
              <Badge variant={stats.localStorage.available ? "secondary" : "destructive"}>
                {stats.localStorage.available ? "Fallback" : "Unavailable"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-muted rounded p-3">
                <div className="font-mono">{formatBytes(stats.localStorage.size)}</div>
                <div className="text-muted-foreground">Data Size</div>
              </div>
              <div className="bg-muted rounded p-3">
                <div className="font-mono">{stats.localStorage.available ? 'Available' : 'Unavailable'}</div>
                <div className="text-muted-foreground">Status</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Migration Status */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-medium">Migration Status</h4>
              {stats.migration.needed && (
                <Badge variant="warning">Migration Needed</Badge>
              )}
              {stats.migration.completed && (
                <Badge variant="default">Completed</Badge>
              )}
              {!stats.migration.needed && !stats.migration.completed && (
                <Badge variant="secondary">Up to Date</Badge>
              )}
            </div>
            
            {stats.migration.needed && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
                <p className="text-yellow-800">
                  Data migration from localStorage to IndexedDB is pending. 
                  This will happen automatically on next app restart, or you can refresh data now.
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-3">
            <h4 className="font-medium">Data Management</h4>
            
            <div className="flex flex-wrap gap-3">
              <Button 
                variant="outline" 
                onClick={handleRefreshData}
                disabled={loading || refreshing}
              >
                {refreshing ? 'Refreshing...' : 'Refresh Data'}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handleExport}
                disabled={loading}
              >
                Export Backup
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handleImport}
                disabled={loading}
              >
                Import Backup
              </Button>
              
              <Button 
                variant="destructive" 
                onClick={handleClearData}
                disabled={loading}
              >
                Clear All Data
              </Button>
            </div>
            
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                • <strong>Export Backup:</strong> Download complete application backup (settings + all sessions + entries)
              </p>
              <p>
                • <strong>Import Backup:</strong> Restore from a full application backup - replaces ALL current data
              </p>
              <p>
                • <strong>Refresh Data:</strong> Reload data from storage and update the cache
              </p>
              <p>
                • <strong>Clear All Data:</strong> Permanently delete all application data (cannot be undone)
              </p>
              <div className="pt-2 border-t border-muted-foreground/20 mt-2">
                <p className="text-blue-600 dark:text-blue-400">
                  💡 <strong>Tip:</strong> For importing just shooting entries (not full backups), use the "Import JSON" 
                  button on the DOPE page which supports multiple formats and merge options.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}