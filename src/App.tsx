import React, { useState, useEffect } from 'react';
import { EmployeeSelect } from './components/EmployeeSelect';
import { PunchClock } from './components/PunchClock';
import { AdminPanel } from './components/AdminPanel';
import { AdminLogin } from './components/AdminLogin';
import { Employee, AdminUser } from './types';
import { supabase } from './supabaseClient';
import { Wifi, WifiOff, RefreshCcw } from 'lucide-react';

function App() {
  const [currentView, setCurrentView] = useState<'select' | 'punch' | 'admin' | 'admin_login'>('select');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loggedAdminUser, setLoggedAdminUser] = useState<AdminUser | null>(null);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const updatePendingCount = () => {
      const logs = JSON.parse(localStorage.getItem('offline_punches') || '[]');
      setPendingSync(logs.length);
    };

    updatePendingCount();

    // Check periodically to sync or update count
    const interval = setInterval(() => {
      updatePendingCount();
      if (navigator.onLine) {
        syncOfflineData();
      }
    }, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const syncOfflineData = async () => {
    if (isSyncing || !navigator.onLine) return;
    const offlineLogs = JSON.parse(localStorage.getItem('offline_punches') || '[]');
    if (offlineLogs.length === 0) return;
    
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('time_logs').insert(offlineLogs);
      if (!error) {
        localStorage.removeItem('offline_punches');
        setPendingSync(0);
      } else {
        console.error('Erro ao sincronizar batidas offline:', error);
      }
    } catch (err) {
      console.error('Erro de rede ao sincronizar:', err);
    }
    setIsSyncing(false);
  };

  return (
    <>
      {/* Indicador de Status de Conexão */}
      <div className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg transition-colors ${!isOnline ? 'bg-red-500 text-white' : pendingSync > 0 ? 'bg-orange-500 text-white' : 'bg-cyber-emerald text-white'}`}>
        {!isOnline ? (
          <><WifiOff size={14} /> MODO OFFLINE</>
        ) : pendingSync > 0 ? (
          <><RefreshCcw size={14} className={isSyncing ? "animate-spin" : ""} /> {isSyncing ? 'SINCRONIZANDO...' : `PENDENTE: ${pendingSync}`}</>
        ) : (
          <><Wifi size={14} /> ONLINE</>
        )}
      </div>

      {currentView === 'select' && (
        <EmployeeSelect 
          onSelectEmployee={(emp) => { setSelectedEmployee(emp); setCurrentView('punch'); }} 
          onAdminLogin={() => setCurrentView('admin_login')} 
        />
      )}
      
      {currentView === 'punch' && selectedEmployee && (
        <PunchClock 
          employee={selectedEmployee} 
          onBack={() => { setSelectedEmployee(null); setCurrentView('select'); }} 
        />
      )}

      {currentView === 'admin_login' && (
        <AdminLogin 
          onLogin={(user) => {
            setLoggedAdminUser(user);
            setCurrentView('admin');
          }}
          onBack={() => setCurrentView('select')}
        />
      )}

      {currentView === 'admin' && loggedAdminUser && (
        <AdminPanel 
          loggedAdmin={loggedAdminUser} 
          onLogout={() => { setLoggedAdminUser(null); setCurrentView('select'); }} 
        />
      )}
    </>
  );
}

export default App;
