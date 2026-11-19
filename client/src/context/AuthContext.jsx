import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth as useClerkAuth, useClerk } from '@clerk/react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { isLoaded, isSignedIn, getToken: getClerkToken } = useClerkAuth();
  const { signOut } = useClerk();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupId, setGroupId] = useState(() => localStorage.getItem('pp_group'));
  const requestId = useRef(0);

  const chooseGroup = useCallback((id) => {
    localStorage.setItem('pp_group', id);
    setGroupId(id);
  }, []);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!isSignedIn) {
      setMe(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getClerkToken();
      if (!token) throw new Error('Unable to obtain a sign-in token. Please sign out and sign in again.');
      const data = await api('/auth/me', { token });
      if (currentRequest !== requestId.current) return;
      setMe(data);
      const saved = localStorage.getItem('pp_group');
      const stillMember = data.memberships.some((m) => m.group._id === saved);
      if ((!saved || !stillMember) && data.memberships[0]) chooseGroup(data.memberships[0].group._id);
    } catch (err) {
      if (currentRequest === requestId.current) {
        setMe(null);
        setError(err.message || 'Unable to load your account.');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [chooseGroup, getClerkToken, isSignedIn]);

  useEffect(() => {
    if (isLoaded) {
      refresh();
    }
    return () => { requestId.current++; };
  }, [isLoaded, refresh]);

  const logout = async () => {
    try {
      await signOut();
      localStorage.removeItem('pp_group');
      setMe(null);
      setGroupId(null);
      setError(null);
    } catch (err) {
      setError(err.message || 'Unable to sign out.');
    }
  };

  const membership = me?.memberships.find((m) => m.group._id === groupId);
  const role = membership?.role;
  const value = {
    me, loading: loading || !isLoaded, error, isSignedIn, groupId, chooseGroup, membership, role, refresh, logout,
    isFinance: role === 'admin' || role === 'treasurer',
    canPost: ['admin', 'chairman', 'treasurer', 'secretary'].includes(role),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
