import React from 'react';
import { Activity, ArrowRight, BookOpen, CloudCog, Github, LifeBuoy, LockKeyhole, RefreshCw, Search, Ticket } from 'lucide-react';

export function CloudOpsMark() {
  return <span className="cloudopsMark" aria-hidden="true"><CloudCog size={24} strokeWidth={1.8} /></span>;
}

const providerOptions = [
  { key: 'github', label: 'GitHub', icon: Github },
  { key: 'google', label: 'Google' },
];

const authSteps = [
  { icon: Search, title: 'Investigate an issue', description: 'Start with a technical question or a relevant file.' },
  { icon: BookOpen, title: 'Check the evidence', description: 'See which runbooks and documents support the answer.' },
  { icon: Ticket, title: 'Escalate when needed', description: 'Review a support ticket before sending it to the team.' },
];

export default function SignIn({ providers, apiState, loadingProvider, notice, onSignIn, onRetry }) {
  const checking = providers.loading || apiState === 'checking';
  const unavailable = apiState === 'down' || providers.error;
  const anyProvider = providers.github || providers.google;
  const status = checking ? 'checking' : unavailable ? 'offline' : anyProvider ? 'online' : 'setup';
  const messages = {
    checking: ['Checking connection', 'Looking up the available sign-in providers.'],
    offline: ['Sign-in service unavailable', 'Check your connection and retry. If the issue persists, contact your CloudOps administrator.'],
    setup: ['Provider setup required', 'Ask your CloudOps administrator to enable a sign-in provider for this workspace.'],
    online: ['Sign-in service online', 'Choose an available provider to continue.'],
  };
  const [statusTitle, statusDescription] = messages[status];

  return (
    <main className="cloudopsAuth">
      <section className="authIdentity" aria-labelledby="auth-identity-title">
        <div className="authWordmark"><CloudOpsMark /><strong>CloudOps</strong></div>
        <div className="authIdentityBody">
          <h1 id="auth-identity-title">Cloud operations<br />support workspace.</h1>
          <p>Investigate with your team's knowledge and move unresolved issues into the support queue.</p>
          <ol className="authSteps">
            {authSteps.map(({ icon: Icon, title, description }) => (
              <li key={title}>
                <span className="authStepIcon"><Icon size={20} aria-hidden="true" /></span>
                <div><strong>{title}</strong><span>{description}</span></div>
              </li>
            ))}
          </ol>
        </div>
        <div className="authIdentityFooter"><LockKeyhole size={15} aria-hidden="true" /> Private workspace access</div>
      </section>
      <section className="authAccess" aria-labelledby="auth-access-title">
        <div className="authAccessBody">
          <div className="authAccessIcon"><LockKeyhole size={24} aria-hidden="true" /></div>
          <h2 id="auth-access-title">Sign in to CloudOps</h2>
          <p className="authAccessIntro">Use an account approved for your workspace.</p>
          {notice.text && <div className="supportAlert" role="alert">{notice.text}</div>}
          <div className="authProviderList">
            {providerOptions.map(({ key, label, icon: Icon }) => {
              const providerStatus = providers.loading ? 'Checking' : providers.error ? 'Unavailable' : !providers[key] ? 'Not configured' : apiState === 'down' ? 'Service offline' : '';
              return (
                <button key={key} type="button" onClick={() => onSignIn(key)} disabled={checking || unavailable || !providers[key] || Boolean(loadingProvider)}>
                  <span className="authProviderIcon">{Icon ? <Icon size={20} aria-hidden="true" /> : <span className="googleMark" aria-hidden="true">G</span>}</span>
                  <strong>{loadingProvider === key ? `Connecting to ${label}…` : `Continue with ${label}`}</strong>
                  {providerStatus ? <small>{providerStatus}</small> : <ArrowRight size={18} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <div className={`authConnection ${status}`}>
            <Activity size={19} aria-hidden="true" />
            <div role="status"><strong>{statusTitle}</strong><span>{statusDescription}</span></div>
            {(status === 'offline' || status === 'setup') && (
              <button type="button" onClick={onRetry} aria-label="Retry connection"><RefreshCw size={15} aria-hidden="true" />Retry</button>
            )}
          </div>
          <div className="authHelp"><LifeBuoy size={17} aria-hidden="true" /><p>For access or role changes, contact your CloudOps administrator.</p></div>
        </div>
      </section>
    </main>
  );
}
