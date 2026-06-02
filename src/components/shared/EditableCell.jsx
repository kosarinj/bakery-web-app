import { useState, useRef, useEffect } from 'react'

export default function EditableCell({
  value,
  onSave,
  type = 'number',
  align = 'right',
  className = '',
  disabled = false,
  placeholder = '',
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const inputRef = useRef(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function startEdit() {
    if (disabled) return
    cancelledRef.current = false
    setDraft(value !== null && value !== undefined ? String(value) : '')
    setEditing(true)
  }

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false
      setEditing(false)
      return
    }
    setEditing(false)
    const newVal = type === 'number' ? (parseFloat(draft) || 0) : draft.trim()
    if (newVal !== value) {
      onSave(newVal)
      setSaved(true)
      setTimeout(() => setSaved(false), 600)
    }
  }

  function cancel() {
    cancelledRef.current = true
    setEditing(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); inputRef.current.blur() }
    if (e.key === 'Escape') cancel()
  }

  const displayVal = value !== null && value !== undefined ? value : ''

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`cell-input ${className}`}
        style={{ textAlign: align }}
        type={type === 'number' ? 'number' : 'text'}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    )
  }

  return (
    <span
      tabIndex={disabled ? -1 : 0}
      className={`cell-display ${disabled ? 'cell-disabled' : 'cell-editable'} ${saved ? 'cell-saved' : ''} ${className}`}
      style={{ textAlign: align }}
      onClick={startEdit}
      onFocus={startEdit}
    >
      {(displayVal === 0 || displayVal === '')
        ? <span className="cell-zero">{type === 'number' && displayVal === 0 ? '0' : ''}</span>
        : displayVal}
    </span>
  )
}
