import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { exchangeOAuthCode, getOAuthProviders } from './api/auth';
import SignIn, { CloudOpsMark } from './SignIn';
import './styles.css';
import './cloudops.css';

const AdminOperationsCenter = lazy(() => import('./AdminOperationsCenter'));
const SupportWorkspace = lazy(() => import('./SupportWorkspace'));

const clearSession = () => {
  localStorage.removeItem('aegiscloud_token');
  localStorage.removeItem('aegiscloud_user');
  localStorage.removeItem('aegiscloud_entry');
};

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('aegiscloud_user') || 'null');
  } catch {
    return null;
  }
};

function SessionLoading() {
  return <main className="cloudopsSession"><CloudOpsMark /><p role="status">Securing your CloudOps session…</p></main>;
}

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [providers, setProviders] = useState({ google: false, github: false, loading: true });
  const [apiState, setApiState] = useState('checking');
  const [connectionCheck, setConnectionCheck] = useState(0);
  const [loadingProvider, setLoadingProvider] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [verifiedUser, setVerifiedUser] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('idle');
  const [sessionPath, setSessionPath] = useState('');
  const isAdminPath = currentPath === '/admin' || currentPath.startsWith('/admin/');

  const navigate = useCallback((path, replace = false) => {
    if (replace) window.history.replaceState({}, '', path);
    else window.history.pushState({}, '', path);
    setCurrentPath(path);
  }, []);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    let active = true;
    const providersRequest = getOAuthProviders(controller.signal);
    const healthRequest = fetch('/api/health', { signal: controller.signal }).then(async (response) => {
      const payload = await response.json().catch(() => null);
      return response.ok && payload?.code === 1;
    });
    Promise.allSettled([providersRequest, healthRequest]).then(([identity, health]) => {
      window.clearTimeout(timeout);
      if (!active) return;
      const available = identity.status === 'fulfilled' ? identity.value : null;
      if (typeof available?.github === 'boolean' && typeof available?.google === 'boolean') {
        setProviders({ github: available.github, google: available.google, loading: false });
      } else {
        setProviders({ github: false, google: false, loading: false, error: true });
      }
      setApiState(health.status === 'fulfilled' && health.value ? 'up' : 'down');
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [connectionCheck]);
  const checkConnection = () => {
    setProviders({ google: false, github: false, loading: true });
    setApiState('checking');
    setConnectionCheck((attempt) => attempt + 1);
  };

  useEffect(() => {
    if (currentPath !== '/auth/callback') return undefined;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const code = params.get('code');
    const failed = params.has('error');
    window.history.replaceState({}, '', '/');

    if (failed || !code) {
      clearSession();
      setCurrentPath('/');
      setNotice({ type: 'error', text: 'Sign-in could not be completed. Please try again.' });
      return undefined;
    }

    let active = true;
    exchangeOAuthCode(code)
      .then((session) => {
        if (!active) return;
        if (!session?.token || !session?.user) throw new Error('Sign-in returned an incomplete session. Please try again.');
        localStorage.setItem('aegiscloud_token', session.token);
        localStorage.setItem('aegiscloud_user', JSON.stringify(session.user));
        const destination = session.user.role === 'ADMIN' ? '/admin' : '/workspace';
        localStorage.setItem('aegiscloud_entry', destination);
        navigate(destination, true);
      })
      .catch((error) => {
        if (!active) return;
        clearSession();
        setCurrentPath('/');
        setNotice({ type: 'error', text: error.message || 'Sign-in could not be completed.' });
      });
    return () => { active = false; };
  }, [currentPath, navigate]);

  useEffect(() => {
    if (currentPath !== '/' || window.location.search) return;
    const token = localStorage.getItem('aegiscloud_token');
    const user = readStoredUser();
    if (token && user?.status === 1) {
      navigate(user.role === 'ADMIN' ? '/admin' : '/workspace', true);
    }
  }, [currentPath, navigate]);

  useEffect(() => {
    if (!isAdminPath && currentPath !== '/workspace') {
      setSessionStatus('idle');
      setVerifiedUser(null);
      return undefined;
    }

    const token = localStorage.getItem('aegiscloud_token');
    if (!token) {
      clearSession();
      navigate('/', true);
      setNotice({ type: 'error', text: 'Please sign in with an active workspace account.' });
      return undefined;
    }

    const controller = new AbortController();
    setSessionPath(currentPath);
    setSessionStatus('checking');
    setVerifiedUser(null);
    fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.code === 0 || !payload?.data) {
          throw new Error(payload?.message || 'Your session has expired. Please sign in again.');
        }
        const account = payload.data;
        if (account.status !== 1 || !['ADMIN', 'USER'].includes(account.role)) {
          throw new Error('This account no longer has active workspace access.');
        }
        localStorage.setItem('aegiscloud_user', JSON.stringify(account));
        setVerifiedUser(account);
        setSessionStatus('ready');
        if (account.role !== 'ADMIN' && isAdminPath) {
          navigate('/workspace', true);
        } else if (account.role === 'ADMIN' && !isAdminPath) {
          navigate('/admin', true);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        clearSession();
        setSessionStatus('invalid');
        navigate('/', true);
        setNotice({ type: 'error', text: error.message || 'Please sign in with an active workspace account.' });
      });

    return () => controller.abort();
  }, [currentPath, isAdminPath, navigate]);

  const hasAdminAccess = isAdminPath
    && sessionPath === currentPath
    && sessionStatus === 'ready'
    && verifiedUser?.role === 'ADMIN';
  const hasWorkspaceAccess = currentPath === '/workspace'
    && sessionPath === currentPath
    && sessionStatus === 'ready'
    && verifiedUser?.role === 'USER';

  const startSignIn = (provider) => {
    if (apiState !== 'up' || providers.loading || !providers[provider] || loadingProvider) return;
    setNotice({ type: '', text: '' });
    setLoadingProvider(provider);
    window.location.assign(`/oauth2/authorization/${provider}`);
  };

  const signOut = async () => {
    const token = localStorage.getItem('aegiscloud_token');
    try {
      await fetch('/api/users/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // Always clear the browser token, even when the backend is unreachable.
    } finally {
      clearSession();
      navigate('/', true);
    }
  };

  if (isAdminPath && hasAdminAccess) return <Suspense fallback={<SessionLoading />}><AdminOperationsCenter /></Suspense>;
  if (currentPath === '/workspace' && hasWorkspaceAccess) return <Suspense fallback={<SessionLoading />}><SupportWorkspace user={verifiedUser} onSignOut={signOut} /></Suspense>;
  if (currentPath === '/auth/callback' || isAdminPath || currentPath === '/workspace') {
    return <SessionLoading />;
  }

  return <SignIn providers={providers} apiState={apiState} loadingProvider={loadingProvider} notice={notice} onSignIn={startSignIn} onRetry={checkConnection} />;
}

createRoot(document.getElementById('root')).render(<App />);
