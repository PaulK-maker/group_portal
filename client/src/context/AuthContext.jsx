import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth as useClerkAuth } from '@clerk/react';
import { api, getToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { isLoaded, isSignedIn, getToken: getClerkToken } = useClerkAuth();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groupId, setGroupId] = useState(() => localStorage.getItem('pp_group'));

  const chooseGroup = useCallback((id) => {
    localStorage.setItem('pp_group', id);
    setGroupId(id);
  }, []);

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api('/auth/me');
      setMe(data);
      const saved = localStorage.getItem('pp_group');
      const stillMember = data.memberships.some((m) => m.group._id === saved);
      if ((!saved || !stillMember) && data.memberships[0]) chooseGroup(data.memberships[0].group._id);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, [chooseGroup, isSignedIn]);

  useEffect(() => {
    if (isLoaded) {
      refresh();
    }
  }, [isLoaded, refresh]);

  const logout = async () => {
    localStorage.removeItem('pp_group');
    setMe(null);
    setGroupId(null);
  };

  const membership = me?.memberships.find((m) => m.group._id === groupId);
  const role = membership?.role;
  const value = {
    me, loading: loading || !isLoaded, groupId, chooseGroup, membership, role, refresh, logout,
    isFinance: role === 'admin' || role === 'treasurer',
    canPost: ['admin', 'treasurer', 'secretary'].includes(role),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
