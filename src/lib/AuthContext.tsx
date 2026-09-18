import React, { createContext, useContext, useEffect, useState } from 'react';

export interface UserSession {
  discordId: string;
  username: string;
  avatarUrl?: string;
  isGlobalAdmin: string | boolean; // boolean
}

interface AuthContextType {
  user: UserSession | null;
  isLoading: boolean;
  rememberMe: boolean;
  setRememberMe: (remember: boolean) => void;
  login: (bankId?: string, provider?: 'discord' | 'citycorp', intent?: 'login' | 'link', rememberMeOverride?: boolean) => void;
  logout: () => void;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  rememberMe: true,
  setRememberMe: () => {},
  login: () => {},
  logout: () => {},
  checkSession: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rememberMe, setRememberMeState] = useState<boolean>(() => {
    return localStorage.getItem('slate_remember_me') !== 'false';
  });

  const setRememberMe = (remember: boolean) => {
    setRememberMeState(remember);
    localStorage.setItem('slate_remember_me', String(remember));
  };

  const checkSession = async () => {
    console.log("checkSession called!");
    try {
      const res = await fetch('/api/auth/me', { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.avatarUrl && data.avatarUrl.includes("crafatar.com")) {
          data.avatarUrl = data.avatarUrl.replace("https://crafatar.com/avatars/", "https://mc-heads.net/avatar/").replace("?size=64&overlay=true", "/64");
        }
        setUser(data);
      } else {
        setUser(null);
      }
    } catch(e) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkSession();
      }
    };
    window.addEventListener('message', handleMessage);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'oauth_auth_success') {
        checkSession();
        localStorage.removeItem('oauth_auth_success');
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const login = async (bankId?: string, provider?: 'discord' | 'citycorp', intent?: 'login' | 'link', rememberMeOverride?: boolean) => {
    try {
      const finalRemember = rememberMeOverride !== undefined ? rememberMeOverride : rememberMe;
      const params = new URLSearchParams();
      if (bankId) params.append('bankId', bankId);
      if (provider) params.append('provider', provider);
      if (intent) params.append('intent', intent);
      params.append('rememberMe', String(finalRemember));
      params.append('returnTo', window.location.pathname);
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`/api/auth/url${queryString}`);
      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }
      const { url } = await response.json();
      
      try {
        const authWindow = window.open(
          url,
          'oauth_popup',
          'width=600,height=700'
        );
        if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
          // Fallback to top-level redirect if popups blocked in iframe
          window.location.href = url;
        }
      } catch (e) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('OAuth error:', error);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, rememberMe, setRememberMe, login, logout, checkSession }}>
      {children}
    </AuthContext.Provider>
  );
};
