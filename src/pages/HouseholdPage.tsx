import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type HouseholdRecord = {
  id: string
  name: string
  invite_code: string
}

type ProfileRecord = {
  id: string
  full_name: string | null
  household_id: string | null
}

export function HouseholdPage() {
  const [household, setHousehold] = useState<HouseholdRecord | null>(null)
  const [members, setMembers] = useState<ProfileRecord[]>([])
  const [householdName, setHouseholdName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [switchCode, setSwitchCode] = useState('')
  const [pendingSwitchCode, setPendingSwitchCode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const [message, setMessage] = useState('')
  const [copiedField, setCopiedField] = useState<'code' | 'link' | null>(null)

  const inviteLink = household ? `${window.location.origin}${window.location.pathname}?household=${household.invite_code}` : ''

  const clearSwitchPrompt = () => {
    setPendingSwitchCode(null)
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('household')
    window.history.replaceState({}, '', nextUrl)
  }

  const loadHousehold = async () => {
    setIsLoading(true)
    setMessage('')

    try {
      const { data: householdIdData, error: householdIdError } = await supabase.rpc('get_my_household_id')

      if (householdIdError) throw householdIdError
      if (!householdIdData) {
        setHousehold(null)
        setMembers([])
        setHouseholdName('')
        return
      }

      const householdId = String(householdIdData)

      const [{ data: householdData, error: householdError }, { data: membersData, error: membersError }] = await Promise.all([
        supabase.from('households').select('id, name, invite_code').eq('id', householdId).maybeSingle(),
        supabase.from('profiles').select('id, full_name, household_id').eq('household_id', householdId),
      ])

      if (householdError) throw householdError
      if (membersError) throw membersError

      setHousehold(householdData)
      setHouseholdName(householdData?.name ?? '')
      setMembers(membersData ?? [])
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to load household details.'
      setMessage(errorMessage)
      setHousehold(null)
      setMembers([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadHousehold()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const inviteFromLink = params.get('household')?.trim()

    if (inviteFromLink) {
      setSwitchCode(inviteFromLink)
      setPendingSwitchCode(inviteFromLink)
    }
  }, [])

  const handleSaveHouseholdName = async () => {
    if (!household) {
      setMessage('No household found for this account.')
      return
    }

    const nextName = householdName.trim()
    if (!nextName) {
      setMessage('Household name cannot be empty.')
      return
    }

    setIsSaving(true)
    setMessage('')

    try {
      const { error } = await supabase.from('households').update({ name: nextName }).eq('id', household.id)

      if (error) throw error

      setHousehold((current) => (current ? { ...current, name: nextName } : current))
      setIsEditingName(false)
      setMessage('Household name updated.')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to update household name.'
      setMessage(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopy = async (value: string, field: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1200)
    } catch {
      setMessage('Copy failed. Please select the text and copy it manually.')
    }
  }

  const handleSwitchReview = () => {
    const trimmed = switchCode.trim()
    if (!trimmed) {
      setMessage('Enter a household code to switch households.')
      return
    }

    setPendingSwitchCode(trimmed)
    setMessage('')
  }

  const handleConfirmSwitch = async () => {
    const targetedCode = pendingSwitchCode?.trim()
    if (!targetedCode) {
      setMessage('No household selected for switch.')
      return
    }

    setIsSwitching(true)
    setMessage('')

    try {
      const { data, error } = await supabase.rpc('join_household_by_code', {
        input_invite_code: targetedCode,
      })

      if (error) throw error

      const payload = data as { success?: boolean; message?: string } | null
      if (payload && payload.success === false) {
        throw new Error(payload.message ?? 'Unable to switch households.')
      }

      clearSwitchPrompt()
      setSwitchCode('')
      setPendingSwitchCode(null)
      await loadHousehold()
      setMessage(payload?.message ?? 'Household switched successfully.')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to switch households.'
      setMessage(errorMessage)
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <section className="page-card">
      <div className="page-header">
        <div>
          <div className="eyebrow">My household</div>
          <h2>Household overview</h2>
        </div>
      </div>

      {isLoading ? (
        <div className="placeholder-panel">
          <p>Loading household details…</p>
        </div>
      ) : !household ? (
        <div className="placeholder-panel">
          <p>No household found.</p>
          <span>You may need to create or join one first.</span>
        </div>
      ) : (
        <div className="household-stack">
          <div className="household-card">
              <div className="household-name-section">
                <div className="household-name-label">Household</div>

                {isEditingName ? (
                  <div className="household-name-editor">
                    <input
                      type="text"
                      value={householdName}
                      onChange={(event) => setHouseholdName(event.target.value)}
                      placeholder="Enter household name"
                    />

                    <div className="compact-actions">
                      <button type="button" className="secondary-button" onClick={() => setIsEditingName(false)}>
                        Cancel
                      </button>
                      <button type="button" className="primary-button" onClick={handleSaveHouseholdName} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="household-name-display">
                    <h3>{household.name}</h3>
                    <button type="button" className="secondary-button" onClick={() => setIsEditingName(true)}>
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {message ? <div className="status-message">{message}</div> : null}
          </div>

          <div className="household-card">
            <div className="members-header">
              <h3>Members</h3>
              <span>{members.length}</span>
            </div>

            <ul className="member-list">
              {members.length === 0 ? (
                <li className="member-empty">No household members yet.</li>
              ) : (
                members.map((member) => (
                  <li key={member.id} className="member-item">
                    <div className="member-avatar">{(member.full_name ?? 'U').charAt(0).toUpperCase()}</div>
                    <div>
                      <strong>{member.full_name ?? 'Unnamed member'}</strong>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="household-card">
            <div className="members-header">
              <h3>Invite new member</h3>
            </div>

            <label className="field-label">
              Share code
              <div className="copy-inline">
                <input type="text" readOnly value={household.invite_code} />
                <button type="button" className="secondary-button" onClick={() => handleCopy(household.invite_code, 'code')}>
                  {copiedField === 'code' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </label>

            <label className="field-label">
              Share link
              <div className="copy-inline">
                <input type="text" readOnly value={inviteLink} />
                <button type="button" className="secondary-button" onClick={() => handleCopy(inviteLink, 'link')}>
                  {copiedField === 'link' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </label>
          </div>

          <div className="household-card">
            <div className="members-header">
              <h3>Switch households</h3>
            </div>

            <label className="field-label">
              Household code
              <input
                type="text"
                value={switchCode}
                onChange={(event) => setSwitchCode(event.target.value)}
                placeholder="Enter another household code"
              />
            </label>

            <div className="household-actions">
              <button type="button" className="secondary-button" onClick={handleSwitchReview}>
                Review switch
              </button>
            </div>

            {pendingSwitchCode ? (
              <div className="confirmation-panel">
                <p>
                  Switching households will move all of your recipes to <strong>{pendingSwitchCode}</strong>. This will
                  update your current household and may change what you see in your recipe list.
                </p>

                <div className="confirmation-actions">
                  <button type="button" className="secondary-button" onClick={clearSwitchPrompt}>
                    Cancel
                  </button>
                  <button type="button" className="primary-button" onClick={handleConfirmSwitch} disabled={isSwitching}>
                    {isSwitching ? 'Switching...' : 'Confirm switch'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
