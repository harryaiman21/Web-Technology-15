// src/hooks/useAuth.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import * as api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const me = await api.getMe();
      setUser(me || null);
      setIsLoading(false);
    })();
  }, []);

  const loginFn = async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    return data.user;
  };

  const logoutFn = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login: loginFn, logout: logoutFn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
