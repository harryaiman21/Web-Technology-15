import { createContext, useContext, useState } from 'react';

export const HUBS = [
  'Shah Alam Hub',
  'KLIA Cargo',
  'Subang Jaya Depot',
  'Penang Hub',
  'JB Distribution',
];

const ViewContext = createContext(null);

export function ViewProvider({ children }) {
  const [viewMode, setViewMode]     = useState('admin');      // 'admin' | 'hub_manager'
  const [selectedHub, setSelectedHub] = useState(HUBS[0]);

  function switchToHub(hub) {
    setSelectedHub(hub || HUBS[0]);
    setViewMode('hub_manager');
  }

  function switchToAdmin() {
    setViewMode('admin');
  }

  return (
    <ViewContext.Provider value={{ viewMode, selectedHub, setSelectedHub, switchToHub, switchToAdmin }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error('useView must be used inside ViewProvider');
  return ctx;
}
