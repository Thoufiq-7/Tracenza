import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Cpu, ShieldCheck, Building2, UserCog } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi, errorMessage } from '../api/client';
import { Button } from '../components/ui';

// Synthetic demo accounts (seeded only outside production)
const DEMO = [
  { group: 'AICTE Officials', icon: ShieldCheck, items: [
    { label: 'Scrutiny Officer', email: 'scrutiny@aicte-india.org', pass: 'scrutiny123' },
    { label: 'Admin (Rules, Engine)', email: 'admin@aicte-india.org', pass: 'admin123' },
    { label: 'Expert Committee (EVC)', email: 'expert@aicte-india.org', pass: 'expert123' },
  ] },
  { group: 'Institutions', icon: Building2, items: [
    { label: 'Apex Institute (Clean)', email: 'principal@apex.edu.in', pass: 'apex123' },
    { label: 'Zenith College (Deficiencies)', email: 'principal@zenith.edu.in', pass: 'zenith123' },
    { label: 'Crescent Institute', email: 'principal@crescent.edu.in', pass: 'crescent123' },
  ] },
];

export const LoginPage: React.FC = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [institution, setInstitution] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const doLogin = async (e?: string, p?: string) => {
    setBusy(true);
    setError('');
    try {
      await login(e ?? email, p ?? password);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async () => {
    setBusy(true);
    setError('');
    try {
      await authApi.register({ email, password, full_name: fullName, institution_name: institution });
      await doLogin(email, password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-800 flex items-center justify-center shadow-md shadow-blue-800/20">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Tracenza <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-semibold">PS 26262</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">AICTE Approval Workflow & Compliance Monitoring</p>
            </div>
          </div>

          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-5 text-xs font-semibold">
            {(['login', 'register'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2 rounded-lg cursor-pointer ${mode === m ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                {m === 'login' ? 'Sign in' : 'Register institution'}
              </button>
            ))}
          </div>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mode === 'login' ? doLogin() : doRegister();
            }}
          >
            {mode === 'register' && (
              <>
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" aria-label="Full name" className="input" />
                <input required value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Institution name (as registered with AICTE)" aria-label="Institution name" className="input" />
              </>
            )}
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" className="input" autoComplete="username" />
            <input required type="password" minLength={mode === 'register' ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" className="input" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            {error && <p className="text-xs text-rose-600 font-medium" role="alert">{error}</p>}
            <Button type="submit" variant="primary" busy={busy} className="w-full py-2.5">
              {mode === 'login' ? 'Sign in to Console' : 'Create institution account'}
            </Button>
          </form>

          <p className="text-[11px] text-slate-500 mt-5 text-center leading-relaxed">
            Statutory AICTE Approval Process Handbook (APH) compliance workflow.
          </p>
        </div>

        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <UserCog className="w-3.5 h-3.5" /> Demo Accounts
            </h2>
            <div className="space-y-4">
              {DEMO.map((group) => {
                const Icon = group.icon;
                return (
                  <div key={group.group} className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 text-blue-700" /> {group.group}
                    </p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {group.items.map((it) => (
                        <button
                          key={it.email}
                          onClick={() => { setEmail(it.email); setPassword(it.pass); doLogin(it.email, it.pass); }}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 text-left transition-colors cursor-pointer group"
                        >
                          <div>
                            <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-900">{it.label}</p>
                            <p className="text-[11px] text-slate-500 font-mono">{it.email}</p>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 group-hover:text-blue-700">Auto-fill →</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white/70 text-[11px] text-slate-600 space-y-1">
            <p className="font-semibold text-slate-800">Smart India Hackathon 2026 • Problem Statement 26262</p>
            <p>Role-based access control with audited hash-chain logging and zero unexplainable AI outputs.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
