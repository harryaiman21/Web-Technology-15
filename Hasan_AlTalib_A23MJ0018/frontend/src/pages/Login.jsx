import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Shield, Zap, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const STATS = [
  { icon: Zap, label: 'Cases Automated', value: '2,847', suffix: 'this month' },
  { icon: Shield, label: 'SLA Compliance', value: '94.2', suffix: '%' },
  { icon: BarChart3, label: 'Avg Resolution', value: '4.3', suffix: 'minutes' },
];

function AnimatedGrid() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(212,5,17,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(212,5,17,0.04) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
      }}
    />
  );
}

function GlowOrb({ style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        borderRadius: '50%',
        filter: 'blur(80px)',
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/inbox');
    } catch (err) {
      setError(err.message || 'Authentication failed. Check credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--nexus-bg)',
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      {/* ── Left brand panel ── */}
      <div
        style={{
          flex: '0 0 55%',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '64px 72px',
          overflow: 'hidden',
        }}
      >
        <AnimatedGrid />
        <GlowOrb style={{ width: 600, height: 600, top: -200, left: -200, background: 'rgba(212,5,17,0.10)' }} />
        <GlowOrb style={{ width: 450, height: 450, bottom: -100, right: -100, background: 'rgba(34,211,238,0.06)' }} />
        <GlowOrb style={{ width: 300, height: 300, top: '40%', right: '10%', background: 'rgba(129,140,248,0.04)' }} />

        {/* DHL wordmark */}
        <div
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 600ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 56 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 52,
                height: 32,
                background: '#D40511',
                borderRadius: 4,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.1em',
                color: '#ffffff',
              }}
            >
              DHL
            </div>
            <div
              style={{
                width: 1,
                height: 24,
                background: 'var(--nexus-border)',
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--nexus-text-3)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Digital Automation Center
            </span>
          </div>

          {/* NEXUS headline */}
          <div style={{ marginBottom: 20 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 'clamp(64px, 8vw, 96px)',
                fontWeight: 900,
                letterSpacing: '-0.04em',
                lineHeight: 0.9,
                color: 'var(--nexus-text-1)',
                position: 'relative',
              }}
            >
              NEX
              <span style={{ color: '#D40511' }}>US</span>
            </h1>
            <div
              style={{
                marginTop: 4,
                height: 3,
                width: 64,
                background: 'linear-gradient(90deg, #D40511, transparent)',
                borderRadius: 2,
              }}
            />
          </div>

          <p
            style={{
              margin: '0 0 64px',
              fontSize: 16,
              lineHeight: 1.7,
              color: 'var(--nexus-text-3)',
              maxWidth: 420,
            }}
          >
            Incident Intelligence Platform — AI-powered triage, automated resolution,
            and human-in-the-loop oversight for DHL Malaysia operations.
          </p>

          {/* Stats row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
              maxWidth: 480,
            }}
          >
            {STATS.map(({ icon: Icon, label, value, suffix }, i) => (
              <div
                key={label}
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateY(0)' : 'translateY(24px)',
                  transition: `all 600ms cubic-bezier(0.4,0,0.2,1) ${200 + i * 80}ms`,
                  background: 'var(--nexus-surface-2)',
                  border: '1px solid var(--nexus-border)',
                  borderRadius: 8,
                  padding: '16px 14px',
                }}
              >
                <Icon size={14} color="#D40511" style={{ marginBottom: 8 }} />
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--nexus-text-1)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                  }}
                >
                  {value}
                </div>
                <div style={{ fontSize: 10, color: 'var(--nexus-text-3)', marginTop: 4, lineHeight: 1.3 }}>
                  {label}
                  <br />
                  <span style={{ color: 'var(--nexus-text-3)', opacity: 0.7 }}>{suffix}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom status bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: 72,
            right: 72,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#10B981',
              boxShadow: '0 0 8px rgba(16,185,129,0.6)',
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--nexus-text-3)', letterSpacing: '0.04em' }}>
            All systems operational · Malaysia cluster active
          </span>
        </div>
      </div>

      {/* ── Divider ── */}
      <div
        style={{
          width: 1,
          background: 'linear-gradient(to bottom, transparent, rgba(34,211,238,0.15) 30%, rgba(212,5,17,0.15) 70%, transparent)',
          flexShrink: 0,
        }}
      />

      {/* ── Right login panel ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 48px',
          position: 'relative',
          background: 'var(--nexus-sidebar-bg)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 380,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 700ms cubic-bezier(0.4,0,0.2,1) 150ms',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 40 }}>
            <h2
              style={{
                margin: '0 0 8px',
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--nexus-text-1)',
              }}
            >
              Sign in
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--nexus-text-3)' }}>
              Operator workspace access
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Email field */}
            <div>
              <label
                htmlFor="login-email"
                style={{
                  display: 'block',
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--nexus-text-3)',
                }}
              >
                Email address
              </label>
              <input
                id="login-email"
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@dhl.com"
                autoComplete="email"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'var(--nexus-surface-1)',
                  border: '1px solid var(--nexus-border-bright)',
                  borderRadius: 8,
                  fontSize: 14,
                  color: 'var(--nexus-text-1)',
                  outline: 'none',
                  transition: 'border-color 150ms, box-shadow 150ms',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(34,211,238,0.4)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(34,211,238,0.08)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--nexus-border)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Password field */}
            <div>
              <label
                htmlFor="login-password"
                style={{
                  display: 'block',
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--nexus-text-3)',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 44px 12px 16px',
                    background: 'var(--nexus-surface-1)',
                    border: '1px solid var(--nexus-border-bright)',
                    borderRadius: 8,
                    fontSize: 14,
                    color: 'var(--nexus-text-1)',
                    outline: 'none',
                    transition: 'border-color 150ms, box-shadow 150ms',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(212,5,17,0.5)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(212,5,17,0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--nexus-border)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--nexus-text-3)',
                    display: 'flex',
                    padding: 4,
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(212,5,17,0.08)',
                  border: '1px solid rgba(212,5,17,0.25)',
                  borderLeft: '3px solid #D40511',
                  borderRadius: 6,
                  fontSize: 13,
                  color: '#fca5a5',
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: loading ? 'rgba(212,5,17,0.6)' : '#D40511',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                color: '#ffffff',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 150ms, transform 100ms, box-shadow 150ms',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(212,5,17,0.35)',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#b8040e';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 28px rgba(212,5,17,0.45)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#D40511';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(212,5,17,0.35)';
                }
              }}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Authenticating…' : 'Access Workspace'}
            </button>
          </form>

          {/* Demo hint */}
          <div
            style={{
              marginTop: 32,
              padding: '14px 16px',
              background: 'var(--nexus-surface-1)',
              border: '1px solid var(--nexus-border)',
              borderRadius: 8,
            }}
          >
            <p style={{ margin: 0, fontSize: 11, color: 'var(--nexus-text-3)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--nexus-text-2)' }}>Demo accounts:</strong>
              {' '}admin@nexus.com · reviewer@nexus.com · reporter@nexus.com
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 28,
            fontSize: 11,
            color: 'var(--nexus-text-3)',
            letterSpacing: '0.04em',
            textAlign: 'center',
          }}
        >
          DHL Asia Pacific Shared Services · DAC 3.0 · 2026
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        input::placeholder { color: var(--nexus-text-3); opacity: 0.6; }
      `}</style>
    </div>
  );
}
