import { createContext, useContext, useState, useCallback } from 'react';

const RefreshContext = createContext(null);

export function RefreshProvider({ children }) {
  const [refreshKey, setRefreshKey] = useState(0);

  // Call this from any page after a data mutation to signal Dashboard to re-fetch
  const triggerRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <RefreshContext.Provider value={{ refreshKey, triggerRefresh }}>
      {children}
    </RefreshContext.Provider>
  );
}

export const useRefresh = () => useContext(RefreshContext);
