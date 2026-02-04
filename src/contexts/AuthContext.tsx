import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

type AppRole = 'admin' | 'customer';

interface AuthState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  profileLoading: boolean;
  profile: {
    full_name: string | null;
    phone: string | null;
  } | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string, phone?: string) => Promise<{ error: Error | null }>;
  signInWithOtp: (email: string) => Promise<{ error: Error | null }>;
  signInWithPhoneOtp: (phone: string) => Promise<{ error: Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: { full_name?: string; phone?: string }) => Promise<{ error: Error | null }>;
  isAdmin: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Helper function for manual cleanup - defined outside component for stability
const clearAuthStorage = () => {
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('sb-') && key.includes('-auth-token')) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    loading: true,
    profileLoading: false,
    profile: null,
  });

  const isMounted = useRef(true);
  const isInitialLoad = useRef(true);

  // Manual cleanup function - resets state to clean signed-out state
  const applyManualCleanup = useCallback(() => {
    clearAuthStorage();
    
    setState({
      user: null,
      session: null,
      role: null,
      loading: false,
      profileLoading: false,
      profile: null,
    });
  }, []);

  // Fetch user role and profile - returns promise so we can await it
  const fetchUserData = useCallback(async (userId: string): Promise<void> => {
    if (!isMounted.current) return;
    
    setState(prev => ({ ...prev, profileLoading: true }));
    
    try {
      // Race against a 5-second timeout to prevent profileLoading from hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
      );
      
      const dataPromise = Promise.all([
        supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
        supabase.from('profiles').select('full_name, phone').eq('id', userId).maybeSingle(),
      ]);

      const [adminCheck, profileResult] = await Promise.race([
        dataPromise,
        timeoutPromise.then(() => { throw new Error('Profile fetch timeout'); }),
      ]) as [any, any];

      if (!isMounted.current) return;

      const role: AppRole = (!adminCheck.error && adminCheck.data === true) ? 'admin' : 'customer';

      setState(prev => ({
        ...prev,
        role,
        profile: profileResult.data,
        profileLoading: false,
      }));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[Auth] Error fetching user data:', error);
      }
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          role: 'customer',
          profileLoading: false,
        }));
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    isInitialLoad.current = true;

    // Set up auth state change listener FIRST (before getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted.current) return;

        // For initial load, we handle this in initSession below
        // This listener handles SUBSEQUENT auth changes (login, logout, token refresh)
        if (isInitialLoad.current) {
          return;
        }

        setState(prev => ({
          ...prev,
          session,
          user: session?.user ?? null,
        }));

        if (session?.user) {
          // Use setTimeout to avoid Supabase deadlock on auth state change
          setTimeout(() => {
            if (isMounted.current) {
              fetchUserData(session.user.id);
            }
          }, 0);
        } else {
          setState(prev => ({
            ...prev,
            role: null,
            profile: null,
            profileLoading: false,
          }));
        }
      }
    );

    // Initialize session - AWAIT profile data before setting loading to false
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[Auth] getSession error:', error);
          if (isMounted.current) applyManualCleanup();
          return;
        }
        
        if (!isMounted.current) return;
        
        // Update session and user immediately
        setState(prev => ({
          ...prev,
          session,
          user: session?.user ?? null,
        }));

        // If we have a session, AWAIT profile data before setting loading to false
        if (session?.user) {
          await fetchUserData(session.user.id);
        }
        
        // NOW set loading to false - after profile is loaded
        if (isMounted.current) {
          setState(prev => ({ ...prev, loading: false }));
          isInitialLoad.current = false;
        }
      } catch (error) {
        console.error('[Auth] getSession failed:', error);
        if (isMounted.current) applyManualCleanup();
      }
    };
    
    // Safety timeout - only for catastrophic network failures (15 seconds)
    const safetyTimeout = setTimeout(() => {
      if (isMounted.current && state.loading) {
        console.warn('[Auth] Safety timeout - network may be slow');
        setState(prev => ({ ...prev, loading: false }));
        isInitialLoad.current = false;
      }
    }, 15000);
    
    initSession();

    return () => {
      isMounted.current = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [fetchUserData, applyManualCleanup]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName?: string, phone?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: fullName,
          phone: phone,
        },
      },
    });
    return { error };
  };

  const signInWithOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/menu`,
        shouldCreateUser: true,
      },
    });
    return { error };
  };

  const verifyOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    return { error };
  };

  const signInWithPhoneOtp = async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        shouldCreateUser: true,
      },
    });
    return { error };
  };

  const verifyPhoneOtp = async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    return { error };
  };

  const signOut = async () => {
    try {
      // Use 'global' scope to ensure server-side session termination
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      
      if (error) {
        console.error("Sign out error:", error);
        // Still proceed with local cleanup even if server-side fails
        applyManualCleanup();
      }
    } catch (error) {
      console.error("Sign out failed, applying manual cleanup:", error);
      applyManualCleanup();
    }
  };

  const updateProfile = async (data: { full_name?: string; phone?: string }) => {
    if (!state.user) {
      return { error: new Error('Not authenticated') };
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: state.user.id,
        ...data,
        updated_at: new Date().toISOString(),
      });

    if (!error) {
      // Refresh profile data
      fetchUserData(state.user.id);
    }

    return { error };
  };

  const isAdmin = state.role === 'admin';
  const isAuthenticated = !!state.session;

  const value: AuthContextValue = {
    ...state,
    signIn,
    signUp,
    signInWithOtp,
    signInWithPhoneOtp,
    verifyOtp,
    verifyPhoneOtp,
    signOut,
    updateProfile,
    isAdmin,
    isAuthenticated,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
