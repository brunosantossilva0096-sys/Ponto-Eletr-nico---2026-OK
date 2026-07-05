import React, { useState } from 'react';
import { EmployeeSelect } from './components/EmployeeSelect';
import { PunchClock } from './components/PunchClock';
import { AdminPanel } from './components/AdminPanel';
import { Employee } from './types';
import { supabase } from './supabaseClient';

function App() {
  const [currentView, setCurrentView] = useState<'select' | 'punch' | 'admin'>('select');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const handleAdminLogin = () => {
    const pass = prompt('Digite a senha do Administrador:');
    if (pass === 'admin') {
      setCurrentView('admin');
    } else {
      alert('Senha incorreta!');
    }
  };

  return (
    <>
      {currentView === 'select' && (
        <EmployeeSelect 
          onSelectEmployee={(emp) => { setSelectedEmployee(emp); setCurrentView('punch'); }} 
          onAdminLogin={handleAdminLogin} 
        />
      )}
      
      {currentView === 'punch' && selectedEmployee && (
        <PunchClock 
          employee={selectedEmployee} 
          onBack={() => { setSelectedEmployee(null); setCurrentView('select'); }} 
        />
      )}

      {currentView === 'admin' && (
        <AdminPanel onLogout={() => setCurrentView('select')} />
      )}
    </>
  );
}

export default App;
