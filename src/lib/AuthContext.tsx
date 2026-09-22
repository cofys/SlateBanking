import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

export interface UserSession {
  discordId: string;
  username: string;
  avatarUrl?: string;
  isGlobalAdmin: string | boolean;
  linkedDiscordId?: string | null;
  mcUuid?: string | null;
}

interface AuthContextType {
  user: UserSession | null;
  isLoading: boolean;
  rememberMe: boolean;
  authError: string | null;
  clearAuthError: () => void;
  setRememberMe: (remember: boolean) => void;
  login: (bankId?: string, provider?: 'citycorp' | 'discord', intent?: 'login' | 'link', rememberMeOverride?: boolean) => Promise<void>;
  linkDiscord: (bankId?: string) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  rememberMe: true,
  authError: null,
  clearAuthError: () => {},
  setRememberMe: () => {},
  login: async () => {},
  linkDiscord: async () => {},
  logout: async () => {},
  checkSession: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [rememberMe, setRememberMeState] = useState<boolean>(() => {
    return localStorage.getItem('slate_remember_me') !== 'false';
  });

  const popupPollRef = useRef<any>(null);

  const clearAuthError = () => setAuthError(null);

  const setRememberMe = (remember: boolean) => {
    setRememberMeState(remember);
    localStorage.setItem('slate_remember_me', String(remember));
  };

  const checkSession = async () => {
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
      const origin = event.origin;
      const isAllowed =
        !origin ||
        origin === window.location.origin ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1');

      if (!isAllowed) return;

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkSession();
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setAuthError(event.data.error || 'Authentication error occurred');
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

    // BroadcastChannel for cross-window / cross-popup communication
    let channel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel('oauth_channel');
        channel.onmessage = (event) => {
          if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
            checkSession();
          } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
            setAuthError(event.data.error || 'Authentication error occurred');
          }
        };
      } catch (e) {}
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
      if (channel) {
        try { channel.close(); } catch(e) {}
      }
      if (popupPollRef.current) {
        clearInterval(popupPollRef.current);
      }
    };
  }, []);

  const login = async (bankId?: string, provider?: 'citycorp' | 'discord', intent?: 'login' | 'link', rememberMeOverride?: boolean) => {
    try {
      setAuthError(null);
      const finalRemember = rememberMeOverride !== undefined ? rememberMeOverride : rememberMe;
      const params = new URLSearchParams();
      if (bankId) params.append('bankId', bankId);
      // Discord is never a login method. Linking uses linkDiscord().
      const resolvedProvider = intent === 'link' && provider === 'discord' ? 'discord' : 'citycorp';
      params.append('provider', resolvedProvider);
      if (resolvedProvider === 'discord') params.append('intent', 'link');
      else if (intent && intent !== 'link') params.append('intent', intent);
      params.append('rememberMe', String(finalRemember));
      params.append('returnTo', window.location.pathname);
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`/api/auth/url${queryString}`);
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error || `Failed to initiate authorization (${response.status})`;
        setAuthError(errMsg);
        throw new Error(errMsg);
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
        } else {
          // Monitor popup status: as soon as it closes, automatically re-verify the session
          if (popupPollRef.current) clearInterval(popupPollRef.current);
          popupPollRef.current = setInterval(() => {
            if (!authWindow || authWindow.closed) {
              clearInterval(popupPollRef.current);
              popupPollRef.current = null;
              // Add a short delay to allow backend database commit
              setTimeout(() => {
                checkSession();
              }, 600);
            }
          }, 700);
          // Failsafe cleanup after 5 minutes
          setTimeout(() => {
            if (popupPollRef.current) {
              clearInterval(popupPollRef.current);
              popupPollRef.current = null;
            }
          }, 300000);
        }
      } catch (e) {
        window.location.href = url;
      }
    } catch (error: any) {
      console.error('OAuth error:', error);
      if (!authError && error?.message) {
        setAuthError(error.message);
      }
    }
  };

  const linkDiscord = async (bankId?: string) => {
    await login(bankId, "discord", "link");
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
    <AuthContext.Provider value={{ user, isLoading, rememberMe, authError, clearAuthError, setRememberMe, login, linkDiscord, logout, checkSession }}>
      {children}
    </AuthContext.Provider>
  );
};
