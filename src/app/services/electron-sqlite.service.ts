import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class ElectronSqliteService {
  
  constructor() {
    console.log('🔌 Electron SQLite Service initialized');
  }
  
  async query(dbName: string, query: string, params: any[] = []): Promise<any> {
    const platform = Capacitor.getPlatform();
    
    // For Electron, use IPC
    if (platform === 'electron') {
      try {
        // Access Electron IPC renderer
        const electron = (window as any).require('electron');
        const result = await electron.ipcRenderer.invoke('sqlite-query', {
          dbName,
          query,
          params
        });
        
        return result;
      } catch (error) {
        console.error('Electron IPC error:', error);
        throw error;
      }
    }
    
    // For mobile/web, use Capacitor SQLite plugin
    // This will be implemented separately
    throw new Error('SQLite not implemented for this platform');
  }
  
  async execute(dbName: string, sql: string): Promise<any> {
    const platform = Capacitor.getPlatform();
    
    if (platform === 'electron') {
      const electron = (window as any).require('electron');
      return await electron.ipcRenderer.invoke('sqlite-execute', {
        dbName,
        sql
      });
    }
    
    throw new Error('SQLite not implemented for this platform');
  }
  
  async open(dbName: string): Promise<any> {
    const platform = Capacitor.getPlatform();
    
    if (platform === 'electron') {
      const electron = (window as any).require('electron');
      return await electron.ipcRenderer.invoke('sqlite-open', { dbName });
    }
    
    throw new Error('SQLite not implemented for this platform');
  }
  
  async close(dbName: string): Promise<any> {
    const platform = Capacitor.getPlatform();
    
    if (platform === 'electron') {
      const electron = (window as any).require('electron');
      return await electron.ipcRenderer.invoke('sqlite-close', { dbName });
    }
    
    throw new Error('SQLite not implemented for this platform');
  }
}