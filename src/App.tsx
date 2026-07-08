import React, { useState } from 'react';
import { EmployeeSelect } from './components/EmployeeSelect';
import { PunchClock } from './components/PunchClock';
import { AdminPanel } from './components/AdminPanel';
import { AdminLogin } from './components/AdminLogin';
import { Employee, AdminUser } from './types';
import { supabase } from './supabaseClient';

function App() {
  const [currentView, setCurrentView] = useState<'select' | 'punch' | 'admin' | 'admin_login'>('select');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loggedAdminUser, setLoggedAdminUser] = useState<AdminUser | null>(null);

  return (
    <>
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
