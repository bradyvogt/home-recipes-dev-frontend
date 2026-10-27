import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type GroceryItem = {
  id: string
  name: string
  is_completed: boolean
  created_at: string
}

export function GroceryListPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [items, setItems] = useState<GroceryItem[]>([])
  const [newItem, setNewItem] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadItems = async () => {
      setIsLoading(true)
      setMessage('')

      try {
        const { data: householdData, error: householdError } = await supabase.rpc('get_my_household_id')
        if (householdError) throw householdError

        if (!householdData) {
          setHouseholdId(null)
          setItems([])
          return
        }

        const currentHouseholdId = String(householdData)
        setHouseholdId(currentHouseholdId)

        const { data, error } = await supabase
          .from('grocery_items')
          .select('id, name, is_completed, created_at')
          .eq('household_id', currentHouseholdId)
          .order('is_completed', { ascending: true })
          .order('created_at', { ascending: true })

        if (error) throw error
        setItems(data ?? [])
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to load the grocery list.')
      } finally {
        setIsLoading(false)
      }
    }

    void loadItems()
  }, [])

  const handleAddItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = newItem.trim()
    if (!name || !householdId) return

    setIsSaving(true)
    setMessage('')

    try {
      const { data, error } = await supabase
        .from('grocery_items')
        .insert({ household_id: householdId, name })
        .select('id, name, is_completed, created_at')
        .single()

      if (error) throw error
      setItems((current) => [...current, data])
      setNewItem('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add this item.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleItem = async (item: GroceryItem) => {
    setMessage('')
    const { error } = await supabase
      .from('grocery_items')
      .update({ is_completed: !item.is_completed })
      .eq('id', item.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setItems((current) => current
      .map((currentItem) => currentItem.id === item.id
        ? { ...currentItem, is_completed: !item.is_completed }
        : currentItem)
      .sort((first, second) => Number(first.is_completed) - Number(second.is_completed)
        || first.created_at.localeCompare(second.created_at)))
  }

  const handleClearCompleted = async () => {
    if (!householdId) return

    setIsSaving(true)
    setMessage('')

    try {
      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .eq('household_id', householdId)
        .eq('is_completed', true)

      if (error) throw error
      setItems((current) => current.filter((item) => !item.is_completed))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to clear completed items.')
    } finally {
      setIsSaving(false)
    }
  }

  const completedCount = items.filter((item) => item.is_completed).length
  const remainingCount = items.length - completedCount

  return (
    <section className="page-card grocery-page">
      <div className="page-header grocery-header">
        <div>
          <div className="eyebrow">Household</div>
          <h2>Grocery list</h2>
          <p className="grocery-count">{remainingCount} {remainingCount === 1 ? 'item' : 'items'} to get</p>
        </div>
        <button
          type="button"
          className="grocery-clear-button"
          onClick={handleClearCompleted}
          disabled={completedCount === 0 || isSaving}
        >
          Clear completed{completedCount > 0 ? ` (${completedCount})` : ''}
        </button>
      </div>

      <form className="grocery-add-form" onSubmit={handleAddItem}>
        <label className="sr-only" htmlFor="grocery-item-name">Add an item</label>
        <input
          id="grocery-item-name"
          type="text"
          value={newItem}
          onChange={(event) => setNewItem(event.target.value)}
          placeholder="Add an item, like milk"
          maxLength={120}
          disabled={!householdId || isLoading || isSaving}
        />
        <button type="submit" className="primary-button" disabled={!newItem.trim() || !householdId || isLoading || isSaving}>
          {isSaving ? 'Saving…' : 'Add item'}
        </button>
      </form>

      {message ? <p className="grocery-message" role="alert">{message}</p> : null}

      {isLoading ? (
        <p className="grocery-empty-state">Loading your household list…</p>
      ) : !householdId ? (
        <p className="grocery-empty-state">Join or create a household to use its grocery list.</p>
      ) : items.length === 0 ? (
        <p className="grocery-empty-state">Your list is empty. Add the first item above.</p>
      ) : (
        <ul className="grocery-items">
          {items.map((item) => (
            <li key={item.id} className={item.is_completed ? 'grocery-item completed' : 'grocery-item'}>
              <label>
                <input
                  type="checkbox"
                  checked={item.is_completed}
                  onChange={() => void handleToggleItem(item)}
                  aria-label={`${item.is_completed ? 'Mark' : 'Complete'} ${item.name}`}
                />
                <span>{item.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}