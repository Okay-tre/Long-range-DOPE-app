/**
 * IndexedDB wrapper for durable local storage
 * Provides localStorage-like interface with better performance and durability
 */

const DB_NAME = 'BallisticsDOPE';
const DB_VERSION = 1;
const STORE_NAME = 'appData';

export interface StorageItem {
  key: string;
  value: any;
  timestamp: number;
  version: string;
}

class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB connection
   */
  private async init(): Promise<void> {
    if (this.db) return;
    
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`IndexedDB error: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        
        // Handle database errors after opening
        this.db.onerror = (event) => {
          console.error('IndexedDB error:', event);
        };

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          
          // Create indexes for better querying
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('version', 'version', { unique: false });
        }
      };
    });

    await this.initPromise;
  }

  /**
   * Store data in IndexedDB
   */
  async setItem(key: string, value: any): Promise<void> {
    try {
      await this.init();
      
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const item: StorageItem = {
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
        timestamp: Date.now(),
        version: DB_VERSION.toString()
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(item);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Failed to store item: ${request.error?.message}`));
      });

    } catch (error) {
      console.error('IndexedDB setItem error:', error);
      // Fallback to localStorage
      this.fallbackSetItem(key, value);
    }
  }

  /**
   * Retrieve data from IndexedDB
   */
  async getItem(key: string): Promise<string | null> {
    try {
      await this.init();
      
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise<string | null>((resolve, reject) => {
        const request = store.get(key);
        
        request.onsuccess = () => {
          const result = request.result;
          resolve(result ? result.value : null);
        };
        
        request.onerror = () => {
          reject(new Error(`Failed to get item: ${request.error?.message}`));
        };
      });

    } catch (error) {
      console.error('IndexedDB getItem error:', error);
      // Fallback to localStorage
      return this.fallbackGetItem(key);
    }
  }

  /**
   * Remove data from IndexedDB
   */
  async removeItem(key: string): Promise<void> {
    try {
      await this.init();
      
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(key);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Failed to remove item: ${request.error?.message}`));
      });

    } catch (error) {
      console.error('IndexedDB removeItem error:', error);
      // Fallback to localStorage
      this.fallbackRemoveItem(key);
    }
  }

  /**
   * Clear all data from IndexedDB
   */
  async clear(): Promise<void> {
    try {
      await this.init();
      
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Failed to clear store: ${request.error?.message}`));
      });

    } catch (error) {
      console.error('IndexedDB clear error:', error);
      // Fallback to localStorage
      this.fallbackClear();
    }
  }

  /**
   * Get all keys from IndexedDB
   */
  async getAllKeys(): Promise<string[]> {
    try {
      await this.init();
      
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise<string[]>((resolve, reject) => {
        const request = store.getAllKeys();
        
        request.onsuccess = () => {
          resolve(request.result as string[]);
        };
        
        request.onerror = () => {
          reject(new Error(`Failed to get all keys: ${request.error?.message}`));
        };
      });

    } catch (error) {
      console.error('IndexedDB getAllKeys error:', error);
      // Fallback to localStorage
      return this.fallbackGetAllKeys();
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{ count: number; totalSize: number; oldestTimestamp?: number; newestTimestamp?: number }> {
    try {
      await this.init();
      
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise<{ count: number; totalSize: number; oldestTimestamp?: number; newestTimestamp?: number }>((resolve, reject) => {
        const request = store.getAll();
        
        request.onsuccess = () => {
          const items: StorageItem[] = request.result;
          let totalSize = 0;
          let oldestTimestamp: number | undefined;
          let newestTimestamp: number | undefined;

          items.forEach(item => {
            totalSize += JSON.stringify(item).length;
            
            if (!oldestTimestamp || item.timestamp < oldestTimestamp) {
              oldestTimestamp = item.timestamp;
            }
            
            if (!newestTimestamp || item.timestamp > newestTimestamp) {
              newestTimestamp = item.timestamp;
            }
          });

          resolve({
            count: items.length,
            totalSize,
            oldestTimestamp,
            newestTimestamp
          });
        };
        
        request.onerror = () => {
          reject(new Error(`Failed to get stats: ${request.error?.message}`));
        };
      });

    } catch (error) {
      console.error('IndexedDB getStats error:', error);
      return { count: 0, totalSize: 0 };
    }
  }

  /**
   * Migrate data from localStorage to IndexedDB
   */
  async migrateFromLocalStorage(keys: string[]): Promise<void> {
    const migratedKeys: string[] = [];
    
    try {
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          await this.setItem(key, value);
          migratedKeys.push(key);
        }
      }
      
      // Only remove from localStorage after successful migration
      migratedKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn(`Failed to remove ${key} from localStorage:`, error);
        }
      });
      
      console.log(`Migrated ${migratedKeys.length} items from localStorage to IndexedDB`);
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Check if IndexedDB is available and working
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.init();
      return this.db !== null;
    } catch (error) {
      return false;
    }
  }

  // Fallback methods for localStorage
  private fallbackSetItem(key: string, value: any): void {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, stringValue);
    } catch (error) {
      console.error('localStorage setItem fallback failed:', error);
    }
  }

  private fallbackGetItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('localStorage getItem fallback failed:', error);
      return null;
    }
  }

  private fallbackRemoveItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('localStorage removeItem fallback failed:', error);
    }
  }

  private fallbackClear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('localStorage clear fallback failed:', error);
    }
  }

  private fallbackGetAllKeys(): string[] {
    try {
      return Object.keys(localStorage);
    } catch (error) {
      console.error('localStorage getAllKeys fallback failed:', error);
      return [];
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initPromise = null;
  }
}

// Create singleton instance
const indexedDBStorage = new IndexedDBStorage();

/**
 * Enhanced storage interface with both sync and async methods
 * Provides backward compatibility with localStorage while enabling IndexedDB features
 */
export class EnhancedStorage {
  private cache: Map<string, string> = new Map();
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the storage system and handle migration
   */
  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const isIndexedDBAvailable = await indexedDBStorage.isAvailable();
        
        if (isIndexedDBAvailable) {
          // Check for localStorage data to migrate
          const localStorageKeys = Object.keys(localStorage);
          const relevantKeys = localStorageKeys.filter(key => key.startsWith('ballistics-'));
          
          if (relevantKeys.length > 0) {
            console.log('Migrating data from localStorage to IndexedDB...');
            await indexedDBStorage.migrateFromLocalStorage(relevantKeys);
          }

          // Pre-load frequently accessed data into cache
          await this.preloadCache();
        }
      } catch (error) {
        console.warn('Storage initialization failed, falling back to localStorage:', error);
      }
    })();

    return this.initPromise;
  }

  /**
   * Pre-load frequently accessed data into memory cache
   */
  private async preloadCache(): Promise<void> {
    try {
      const keys = await indexedDBStorage.getAllKeys();
      const ballistics_keys = keys.filter(key => key.startsWith('ballistics-'));
      
      for (const key of ballistics_keys) {
        const value = await indexedDBStorage.getItem(key);
        if (value !== null) {
          this.cache.set(key, value);
        }
      }
    } catch (error) {
      console.warn('Failed to preload cache:', error);
    }
  }

  /**
   * Set item (async, preferred method)
   */
  async setItem(key: string, value: any): Promise<void> {
    await this.init();
    
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    this.cache.set(key, stringValue);
    
    try {
      await indexedDBStorage.setItem(key, stringValue);
    } catch (error) {
      console.warn('IndexedDB setItem failed, using localStorage fallback:', error);
      localStorage.setItem(key, stringValue);
    }
  }

  /**
   * Get item (sync method for backward compatibility)
   * Note: This uses cache for immediate access, but may not reflect latest changes
   */
  getItem(key: string): string | null {
    // Try cache first
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    
    // Fallback to localStorage for immediate access
    return localStorage.getItem(key);
  }

  /**
   * Get item (async, preferred method)
   */
  async getItemAsync(key: string): Promise<string | null> {
    await this.init();
    
    try {
      const value = await indexedDBStorage.getItem(key);
      if (value !== null) {
        this.cache.set(key, value);
        return value;
      }
    } catch (error) {
      console.warn('IndexedDB getItem failed, using localStorage fallback:', error);
    }
    
    // Fallback to localStorage
    const fallbackValue = localStorage.getItem(key);
    if (fallbackValue !== null) {
      this.cache.set(key, fallbackValue);
    }
    return fallbackValue;
  }

  /**
   * Remove item
   */
  async removeItem(key: string): Promise<void> {
    await this.init();
    
    this.cache.delete(key);
    
    try {
      await indexedDBStorage.removeItem(key);
    } catch (error) {
      console.warn('IndexedDB removeItem failed, using localStorage fallback:', error);
      localStorage.removeItem(key);
    }
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    await this.init();
    
    this.cache.clear();
    
    try {
      await indexedDBStorage.clear();
    } catch (error) {
      console.warn('IndexedDB clear failed, using localStorage fallback:', error);
      localStorage.clear();
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{ count: number; totalSize: number; oldestTimestamp?: number; newestTimestamp?: number }> {
    await this.init();
    return indexedDBStorage.getStats();
  }

  /**
   * Force refresh cache from persistent storage
   */
  async refreshCache(): Promise<void> {
    this.cache.clear();
    await this.preloadCache();
  }
}

// Export singleton instance
export const enhancedStorage = new EnhancedStorage();

// Export the IndexedDB storage for direct access if needed
export { indexedDBStorage };

// Initialize on module load
enhancedStorage.init().catch(error => {
  console.warn('Failed to initialize enhanced storage:', error);
});
