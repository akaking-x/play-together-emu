import { useState, useEffect, useCallback } from 'react';
import { KeyMapper } from '../components/KeyMapper';
import { DEFAULT_KEYMAP } from '../emulator/input-mapper';
import { api } from '../api/client';

interface KeyProfile {
  id: string;
  name: string;
  isDefault: boolean;
  mapping: Record<string, string>;
}

export function SettingsPage() {
  const [profiles, setProfiles] = useState<KeyProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<KeyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await api.get('/keymaps');
      const data = res.data as KeyProfile[];
      setProfiles(data);
      const active = data.find(p => p.isDefault) || data[0];
      if (active) {
        setActiveProfileId(active.id);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) return;
    try {
      await api.post('/keymaps', {
        name: newProfileName.trim(),
        mapping: DEFAULT_KEYMAP,
      });
      setNewProfileName('');
      setCreating(false);
      await fetchProfiles();
    } catch {
      alert('Loi khi tao profile');
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm('Xoa profile nay?')) return;
    try {
      await api.delete(`/keymaps/${id}`);
      if (editingProfile?.id === id) {
        setEditingProfile(null);
      }
      await fetchProfiles();
    } catch {
      alert('Loi khi xoa profile');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await api.post(`/keymaps/${id}/activate`);
      setActiveProfileId(id);
      setProfiles(prev =>
        prev.map(p => ({ ...p, isDefault: p.id === id })),
      );
    } catch {
      alert('Loi khi kich hoat profile');
    }
  };

  const handleSaveMapping = async (mapping: Record<string, string>) => {
    if (!editingProfile) return;
    try {
      await api.put(`/keymaps/${editingProfile.id}`, { mapping });
      setEditingProfile(null);
      await fetchProfiles();
    } catch {
      alert('Loi khi luu mapping');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
        Dang tai...
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Cai dat</h1>
        <p className="text-muted">Quan ly cau hinh phim cho cac game</p>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Profile list */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Profiles</h3>
            <button
              onClick={() => setCreating(true)}
              style={{
                padding: '4px 12px',
                background: '#4a9eff',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              + Tao moi
            </button>
          </div>

          {creating && (
            <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={newProfileName}
                onChange={e => setNewProfileName(e.target.value)}
                placeholder="Ten profile..."
                onKeyDown={e => { if (e.key === 'Enter') handleCreateProfile(); }}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  background: '#222',
                  color: '#eee',
                  border: '1px solid #444',
                  borderRadius: 4,
                }}
              />
              <button
                onClick={handleCreateProfile}
                style={{
                  padding: '6px 12px',
                  background: '#2a7a2a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Luu
              </button>
              <button
                onClick={() => { setCreating(false); setNewProfileName(''); }}
                style={{
                  padding: '6px 12px',
                  background: '#555',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Huy
              </button>
            </div>
          )}

          {profiles.length === 0 ? (
            <p style={{ color: '#666' }}>Chua co profile nao. Tao moi de bat dau.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profiles.map(profile => (
                <div
                  key={profile.id}
                  style={{
                    padding: 12,
                    background: editingProfile?.id === profile.id ? '#1a2a4e' : '#1a1a2e',
                    border: activeProfileId === profile.id ? '1px solid #4a9eff' : '1px solid #333',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 'bold', color: '#eee' }}>
                      {profile.name}
                      {profile.isDefault && (
                        <span style={{ fontSize: 11, color: '#4a9eff', marginLeft: 8 }}>
                          (dang dung)
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {!profile.isDefault && (
                      <button
                        onClick={() => handleActivate(profile.id)}
                        style={{
                          padding: '3px 8px',
                          fontSize: 11,
                          background: '#2a7a2a',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 3,
                          cursor: 'pointer',
                        }}
                      >
                        Kich hoat
                      </button>
                    )}
                    <button
                      onClick={() => setEditingProfile(
                        editingProfile?.id === profile.id ? null : profile,
                      )}
                      style={{
                        padding: '3px 8px',
                        fontSize: 11,
                        background: editingProfile?.id === profile.id ? '#4a9eff' : '#555',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 3,
                        cursor: 'pointer',
                      }}
                    >
                      {editingProfile?.id === profile.id ? 'Dong' : 'Chinh sua'}
                    </button>
                    {profiles.length > 1 && (
                      <button
                        onClick={() => handleDeleteProfile(profile.id)}
                        style={{
                          padding: '3px 8px',
                          fontSize: 11,
                          background: '#aa3333',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 3,
                          cursor: 'pointer',
                        }}
                      >
                        Xoa
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Key mapper editor */}
        <div style={{ flex: 1 }}>
          {editingProfile ? (
            <div>
              <h3 style={{ marginTop: 0 }}>
                Chinh sua: {editingProfile.name}
              </h3>
              <KeyMapper
                mapping={editingProfile.mapping}
                onSave={handleSaveMapping}
                onCancel={() => setEditingProfile(null)}
              />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
              <p>Chon mot profile de chinh sua mapping phim</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
