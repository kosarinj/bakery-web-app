import { useState, useEffect } from 'react'

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' })
  const [adding, setAdding] = useState(false)
  const [changingPw, setChangingPw] = useState({})  // id -> new password
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [])

  function load() {
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  async function addUser() {
    if (!newUser.username || !newUser.password) return
    try {
      const r = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(newUser)
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setUsers(prev => [...prev, d])
      setNewUser({ username: '', password: '', role: 'user' })
      setAdding(false)
      flash('User created')
    } catch (e) { setError(e.message) }
  }

  async function changePassword(id) {
    const pw = changingPw[id]
    if (!pw) return
    try {
      await fetch(`/api/users/${id}/password`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ password: pw })
      })
      setChangingPw(p => { const n = { ...p }; delete n[id]; return n })
      flash('Password updated')
    } catch (e) { setError(e.message) }
  }

  async function deleteUser(id, username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return
    try {
      const r = await fetch(`/api/users/${id}`, { method: 'DELETE', credentials: 'include' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setUsers(prev => prev.filter(u => u.id !== id))
      flash('User deleted')
    } catch (e) { setError(e.message) }
  }

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  if (loading) return <div className="loading">Loading users...</div>

  return (
    <div style={{ maxWidth: 700 }}>
      <div className="page-toolbar" style={{ marginBottom: 16 }}>
        <span className="toolbar-info">{users.length} users</span>
        <div className="toolbar-spacer" />
        {msg && <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>{msg}</span>}
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add User</button>}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="section-card">
        <table className="data-grid" style={{ minWidth: 500 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 140 }}>Username</th>
              <th style={{ minWidth: 80 }}>Role</th>
              <th style={{ minWidth: 120 }}>Created</th>
              <th style={{ minWidth: 240 }}>Change Password</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.username}</td>
                <td><span className={`badge ${u.role === 'admin' ? 'badge-purple' : 'badge-blue'}`}>{u.role}</span></td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="password" placeholder="New password…"
                      value={changingPw[u.id] || ''}
                      onChange={e => setChangingPw(p => ({ ...p, [u.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && changePassword(u.id)}
                      style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13, width: 160 }} />
                    {changingPw[u.id] && (
                      <button className="btn btn-secondary btn-sm" onClick={() => changePassword(u.id)}>Save</button>
                    )}
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button className="btn btn-danger btn-sm" style={{ padding: '3px 8px', fontSize: 11 }}
                    onClick={() => deleteUser(u.id, u.username)}>✕</button>
                </td>
              </tr>
            ))}

            {adding && (
              <tr style={{ background: 'var(--cell-edit-bg)' }}>
                <td>
                  <input autoFocus type="text" placeholder="Username"
                    value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                    style={{ width: '100%', border: '2px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13, fontFamily: 'var(--font)' }} />
                </td>
                <td>
                  <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                    style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 6px', fontSize: 13 }}>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td colSpan={1}>
                  <input type="password" placeholder="Password"
                    value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addUser(); if (e.key === 'Escape') { setAdding(false) } }}
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13, fontFamily: 'var(--font)' }} />
                </td>
                <td colSpan={2} style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-primary btn-sm" style={{ marginRight: 6 }} onClick={addUser}>Create</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setNewUser({ username: '', password: '', role: 'user' }) }}>Cancel</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        Each user gets their own login. All users currently have the same access.
        Passwords are stored securely (bcrypt hashed — never readable).
      </div>
    </div>
  )
}
