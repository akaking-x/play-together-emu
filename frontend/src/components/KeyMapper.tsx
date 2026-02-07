import { useState, useEffect, useCallback } from 'react';

const PS1_BUTTONS = [
  { key: 'UP',    label: 'Up',       group: 'D-Pad' },
  { key: 'DOWN',  label: 'Down',     group: 'D-Pad' },
  { key: 'LEFT',  label: 'Left',     group: 'D-Pad' },
  { key: 'RIGHT', label: 'Right',    group: 'D-Pad' },
  { key: 'CROSS',    label: 'Cross',    group: 'Face' },
  { key: 'CIRCLE',   label: 'Circle',   group: 'Face' },
  { key: 'SQUARE',   label: 'Square',   group: 'Face' },
  { key: 'TRIANGLE', label: 'Triangle', group: 'Face' },
  { key: 'L1', label: 'L1', group: 'Shoulder' },
  { key: 'R1', label: 'R1', group: 'Shoulder' },
  { key: 'L2', label: 'L2', group: 'Shoulder' },
  { key: 'R2', label: 'R2', group: 'Shoulder' },
  { key: 'START',  label: 'Start',  group: 'System' },
  { key: 'SELECT', label: 'Select', group: 'System' },
];

const GROUPS = ['D-Pad', 'Face', 'Shoulder', 'System'];

interface Props {
  mapping: Record<string, string>;
  onSave: (mapping: Record<string, string>) => void;
  onCancel?: () => void;
}

function formatKey(code: string): string {
  if (!code) return '---';
  return code
    .replace('Key', '')
    .replace('Arrow', '')
    .replace('ShiftRight', 'R-Shift')
    .replace('ShiftLeft', 'L-Shift')
    .replace('ControlRight', 'R-Ctrl')
    .replace('ControlLeft', 'L-Ctrl')
    .replace('Digit', '')
    .replace('Numpad', 'Num ');
}

export function KeyMapper({ mapping, onSave, onCancel }: Props) {
  const [current, setCurrent] = useState<Record<string, string>>({ ...mapping });
  const [listening, setListening] = useState<string | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();

    // Remove duplicate key bindings
    const updated = { ...current };
    for (const [btn, code] of Object.entries(updated)) {
      if (code === e.code && btn !== listening) {
        updated[btn] = '';
      }
    }
    updated[listening] = e.code;
    setCurrent(updated);
    setListening(null);
  }, [listening, current]);

  useEffect(() => {
    if (!listening) return;
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [listening, handleKeyDown]);

  return (
    <div style={{ maxWidth: 500 }}>
      {GROUPS.map(group => (
        <div key={group} style={{ marginBottom: 20 }}>
          <h4 style={{ color: '#aaa', marginBottom: 8, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>
            {group}
          </h4>
          {PS1_BUTTONS.filter(b => b.group === group).map(btn => (
            <div
              key={btn.key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 0',
                borderBottom: '1px solid #222',
              }}
            >
              <span style={{ color: '#ccc' }}>{btn.label}</span>
              <button
                onClick={() => setListening(listening === btn.key ? null : btn.key)}
                className="btn btn-sm"
                style={{
                  minWidth: 140,
                  background: listening === btn.key ? '#ff6b35' : '#333',
                  color: '#fff',
                  border: listening === btn.key ? '1px solid #ff6b35' : '1px solid #555',
                  padding: '4px 12px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  textAlign: 'center',
                }}
              >
                {listening === btn.key ? 'Nhan phim...' : formatKey(current[btn.key] || '')}
              </button>
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          className="btn btn-primary"
          onClick={() => onSave(current)}
          style={{
            padding: '8px 20px',
            background: '#4a9eff',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Luu
        </button>
        <button
          className="btn btn-outline"
          onClick={() => {
            setCurrent({ ...mapping });
            setListening(null);
            onCancel?.();
          }}
          style={{
            padding: '8px 20px',
            background: 'transparent',
            color: '#aaa',
            border: '1px solid #555',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Huy
        </button>
      </div>
    </div>
  );
}
