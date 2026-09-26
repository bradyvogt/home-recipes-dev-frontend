import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type RecipeData = {
  name?: string
  title?: string
  description?: string
  sourceType?: string
  sourceLink?: string
  source_type?: string
  source_link?: string
  recipeYield?: number | string
  servings?: number | string
  prepTime?: string | number
  prep_time?: string | number
  cookTime?: string | number
  cook_time?: string | number
  totalTime?: string | number
  total_time?: string | number
  recipeCategory?: unknown[] | string[] | string
  recipeCuisine?: unknown[] | string[] | string
  recipeIngredient?: unknown[] | string[] | string
  recipeInstructions?: unknown[] | string[] | string
}

type RecipeRecord = {
  id: string
  slug: string
  recipe_data: RecipeData
}

type EditValues = {
  name: string
  description: string
  sourceType: string
  sourceLink: string
  recipeYield: string
  prepTime: string
  cookTime: string
  totalTime: string
  recipeCategory: string
  recipeCuisine: string
  recipeIngredient: string
  recipeInstructions: string
}

type SingleRecipePageProps = {
  slug: string
  session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null
}

const SUPABASE_FUNCTION_ROOT = 'https://bpcvnedueofvttcvnvel.supabase.co/functions/v1'

const asString = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          if ('text' in item && typeof item.text === 'string') return item.text
          if ('name' in item && typeof item.name === 'string') return item.name
        }
        return ''
      })
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/)
      .map((part) => part.trim())
      .filter(Boolean)
  }

  return []
}

const normalizeListText = (value: unknown): string => {
  if (!value) return ''
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          if ('text' in item && typeof item.text === 'string') return item.text
          if ('name' in item && typeof item.name === 'string') return item.name
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return asString(value)
}

const parseMinutesValue = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return 0
    if (/^\d+$/.test(trimmed)) return Number(trimmed)
    const match = trimmed.match(/(?:(\d+)\s*h(?:ours?)?)?(?:\s*)?(?:(\d+)\s*m(?:in(?:utes?)?)?)?/i)
    if (match) {
      const hours = Number(match[1] ?? 0)
      const minutes = Number(match[2] ?? 0)
      return hours * 60 + minutes
    }
    return 0
  }
  return 0
}

const formatDurationText = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours && remainder) return `${hours}h ${remainder}m`
  if (hours) return `${hours}h`
  return `${remainder}m`
}

const serializeDuration = (value: string | number) => {
  const minutes = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(minutes) || minutes < 0) return ''
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  let iso = 'PT'
  if (hours) iso += `${hours}H`
  if (remainder) iso += `${remainder}M`
  return iso || 'PT0M'
}

const buildEditValues = (recipe: RecipeData): EditValues => ({
  name: recipe.name ?? recipe.title ?? '',
  description: recipe.description ?? '',
  sourceType: recipe.sourceType ?? recipe.source_type ?? '',
  sourceLink: recipe.sourceLink ?? recipe.source_link ?? '',
  recipeYield: recipe.recipeYield !== undefined ? String(recipe.recipeYield) : recipe.servings !== undefined ? String(recipe.servings) : '',
  prepTime: String(parseMinutesValue(recipe.prepTime ?? recipe.prep_time ?? 0)),
  cookTime: String(parseMinutesValue(recipe.cookTime ?? recipe.cook_time ?? 0)),
  totalTime: String(parseMinutesValue(recipe.totalTime ?? recipe.total_time ?? 0)),
  recipeCategory: normalizeListText(recipe.recipeCategory ?? []),
  recipeCuisine: normalizeListText(recipe.recipeCuisine ?? []),
  recipeIngredient: normalizeListText(recipe.recipeIngredient ?? []),
  recipeInstructions: normalizeListText(recipe.recipeInstructions ?? []),
})

export function SingleRecipePage({ slug, session }: SingleRecipePageProps) {
  const [recipe, setRecipe] = useState<RecipeData | null>(null)
  const [recipeMeta, setRecipeMeta] = useState<Pick<RecipeRecord, 'id' | 'slug'> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [describeMode, setDescribeMode] = useState(false)
  const [editValues, setEditValues] = useState<EditValues>({
    name: '',
    description: '',
    sourceType: '',
    sourceLink: '',
    recipeYield: '',
    prepTime: '',
    cookTime: '',
    totalTime: '',
    recipeCategory: '',
    recipeCuisine: '',
    recipeIngredient: '',
    recipeInstructions: '',
  })
  const [saveState, setSaveState] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [describeText, setDescribeText] = useState('')
  const [describeSaving, setDescribeSaving] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadRecipe = async () => {
      setLoading(true)
      setError(null)

      const { data, error: recipeError } = await supabase
        .from('recipes')
        .select('id, slug, recipe_data')
        .eq('slug', slug)
        .maybeSingle()

      if (recipeError) {
        throw recipeError
      }

      if (!data) {
        throw new Error('Recipe not found.')
      }

      if (isMounted) {
        const normalizedRecipe = data.recipe_data as RecipeData
        setRecipeMeta({ id: data.id, slug: data.slug })
        setRecipe(normalizedRecipe)
        setEditValues(buildEditValues(normalizedRecipe))
      }
    }

    void loadRecipe()
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load this recipe.')
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [slug])

  const recipeName = useMemo(() => {
    if (!recipe) return 'Recipe'
    return recipe.name ?? recipe.title ?? 'Untitled recipe'
  }, [recipe])

  const recipeIngredients = useMemo(() => asStringArray(recipe?.recipeIngredient ?? []), [recipe])
  const recipeInstructions = useMemo(() => asStringArray(recipe?.recipeInstructions ?? []), [recipe])
  const recipeCategories = useMemo(() => asStringArray(recipe?.recipeCategory ?? []), [recipe])
  const recipeCuisines = useMemo(() => asStringArray(recipe?.recipeCuisine ?? []), [recipe])
  const prepMinutes = useMemo(() => parseMinutesValue(recipe?.prepTime ?? recipe?.prep_time ?? 0), [recipe])
  const cookMinutes = useMemo(() => parseMinutesValue(recipe?.cookTime ?? recipe?.cook_time ?? 0), [recipe])
  const totalMinutes = useMemo(() => parseMinutesValue(recipe?.totalTime ?? recipe?.total_time ?? 0), [recipe])
  const servings = useMemo(() => {
    const value = recipe?.recipeYield ?? recipe?.servings
    if (typeof value === 'number') return value
    if (typeof value === 'string' && value.trim()) return Number.parseInt(value, 10) || 0
    return 0
  }, [recipe])

  const handleEditField = (field: keyof EditValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditValues((current) => ({ ...current, [field]: event.target.value }))
  }

  const shareCurrentRecipe = async () => {
    const url = window.location.href

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setSaveState({ type: 'success', message: 'Recipe link copied to clipboard.' })
      } else {
        throw new Error('Clipboard is unavailable in this browser.')
      }
    } catch {
      setSaveState({ type: 'success', message: `Copy this link to share it: ${url}` })
    }
  }

  const handleSaveEdit = async () => {
    if (!recipeMeta) return
    setSaveState(null)
    setIsSaving(true)

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!sessionData.session?.access_token) throw new Error('Please sign in to edit a recipe.')

      const payload = {
        name: editValues.name.trim() || recipeName,
        description: editValues.description.trim(),
        sourceType: editValues.sourceType.trim(),
        sourceLink: editValues.sourceLink.trim(),
        recipeYield: editValues.recipeYield ? Number(editValues.recipeYield) : undefined,
        prepTime: serializeDuration(editValues.prepTime || 0),
        cookTime: serializeDuration(editValues.cookTime || 0),
        totalTime: serializeDuration(editValues.totalTime || 0),
        recipeCategory: editValues.recipeCategory.split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean),
        recipeCuisine: editValues.recipeCuisine.split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean),
        recipeIngredient: editValues.recipeIngredient.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean),
        recipeInstructions: editValues.recipeInstructions.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean),
      }

      const { data: updatedRecord, error: updateError } = await supabase
        .from('recipes')
        .update({ recipe_data: payload })
        .eq('id', recipeMeta.id)
        .select('id, slug, recipe_data')
        .single()

      if (updateError) throw updateError

      const updatedRecipe = updatedRecord.recipe_data as RecipeData
      setRecipeMeta({ id: updatedRecord.id, slug: updatedRecord.slug })
      setRecipe(updatedRecipe)
      setEditValues(buildEditValues(updatedRecipe))
      const recipePath = `${import.meta.env.BASE_URL || '/'}recipe/${encodeURIComponent(updatedRecord.slug)}`
      window.history.replaceState({}, '', recipePath)
      setEditMode(false)
      setSaveState({ type: 'success', message: 'Recipe updated successfully.' })
    } catch (saveError) {
      setSaveState({ type: 'error', message: saveError instanceof Error ? saveError.message : 'Unable to save the recipe edit.' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDescribeEdit = async () => {
    if (!recipeMeta) return
    setSaveState(null)
    setDescribeSaving(true)

    try {
      const trimmedText = describeText.trim()
      if (!trimmedText) {
        throw new Error('Write recipe directions or notes before saving the edit.')
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!sessionData.session?.access_token) throw new Error('Please sign in to update a recipe.')

      const endpoint = `${SUPABASE_FUNCTION_ROOT}/index-recipe/freeform-text/${encodeURIComponent(recipeMeta.slug)}?storageFile=${encodeURIComponent('recipes.json')}`
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: trimmedText, storageFile: 'recipes.json' }),
      })

      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error ?? 'Unable to apply the freeform recipe update.')
      }

      const updatedRecipe = (json?.recipe ?? recipe ?? {}) as RecipeData
      setRecipe(updatedRecipe)
      setEditValues(buildEditValues(updatedRecipe))
      setDescribeMode(false)
      setDescribeText('')
      setSaveState({ type: 'success', message: 'Recipe updated from your directions.' })
    } catch (describeError) {
      setSaveState({ type: 'error', message: describeError instanceof Error ? describeError.message : 'Unable to update the recipe from your directions.' })
    } finally {
      setDescribeSaving(false)
    }
  }

  if (loading) {
    return <section className="page-card recipe-detail-page"><div className="recipe-state">Loading recipe details…</div></section>
  }

  if (error || !recipe) {
    return (
      <section className="page-card recipe-detail-page">
        <div className="status error">{error ?? 'Recipe not found.'}</div>
      </section>
    )
  }

  return (
    <section className="page-card recipe-detail-page">
      <div className="recipe-detail-header">
        <div>
          <div className="eyebrow">Recipe</div>
          <h2>{recipeName}</h2>
        </div>

        <div className="recipe-detail-actions">
          <button type="button" className="secondary-button" onClick={shareCurrentRecipe}>Share</button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (!session) {
                setSaveState({ type: 'error', message: 'Please sign in to edit this recipe.' })
                return
              }
              setEditMode((current) => !current)
              setDescribeMode(false)
              setSaveState(null)
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (!session) {
                setSaveState({ type: 'error', message: 'Please sign in to describe edits for this recipe.' })
                return
              }
              setDescribeMode((current) => !current)
              setEditMode(false)
              setSaveState(null)
            }}
          >
            Describe Edits
          </button>
        </div>
      </div>

      {saveState ? <div className={saveState.type === 'success' ? 'status success' : 'status error'}>{saveState.message}</div> : null}

      {(recipe.description || recipe.sourceType || recipe.sourceLink || recipe.source_type || recipe.source_link) ? (
        <div className="recipe-summary-card">
          {recipe.description ? <p className="recipe-summary-text">{recipe.description}</p> : null}
          <div className="recipe-source-row">
            {recipe.sourceType || recipe.source_type ? <span className="recipe-source-badge">{recipe.sourceType ?? recipe.source_type}</span> : null}
            {(recipe.sourceLink || recipe.source_link) ? (
              <a href={recipe.sourceLink ?? recipe.source_link} target="_blank" rel="noreferrer" className="recipe-source-link">
                View source
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {servings || prepMinutes || cookMinutes || totalMinutes || recipeCategories.length || recipeCuisines.length ? (
        <div className="recipe-detail-metrics">
          {servings ? <div className="metric-card"><span>Servings</span><strong>{servings}</strong></div> : null}
          {prepMinutes ? <div className="metric-card"><span>Prep Time</span><strong>{formatDurationText(prepMinutes)}</strong></div> : null}
          {cookMinutes ? <div className="metric-card"><span>Cook Time</span><strong>{formatDurationText(cookMinutes)}</strong></div> : null}
          {totalMinutes ? <div className="metric-card"><span>Total Time</span><strong>{formatDurationText(totalMinutes)}</strong></div> : null}
          {recipeCategories.length ? <div className="metric-card wide"><span>Categories</span><strong>{recipeCategories.join(', ')}</strong></div> : null}
          {recipeCuisines.length ? <div className="metric-card wide"><span>Cuisine</span><strong>{recipeCuisines.join(', ')}</strong></div> : null}
        </div>
      ) : null}

      {describeMode ? (
        <div className="recipe-editor-card">
          <h3>Describe Edits</h3>
          <label className="field-group">
            <span>Recipe directions or notes</span>
            <textarea className="textarea-field" rows={10} value={describeText} onChange={(event) => setDescribeText(event.target.value)} placeholder="Describe the changes you want to make to this recipe..." />
          </label>
          <div className="compact-actions">
            <button type="button" className="secondary-button" onClick={() => setDescribeMode(false)}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={() => void handleDescribeEdit()} disabled={describeSaving}>
              {describeSaving ? 'Saving…' : 'Save direction update'}
            </button>
          </div>
        </div>
      ) : null}

      {editMode ? (
        <div className="recipe-editor-card">
          <h3>Edit Recipe</h3>
          <div className="recipe-edit-grid">
            <label className="field-group">
              <span>Name</span>
              <input className="input-field" value={editValues.name} onChange={handleEditField('name')} />
            </label>
            <label className="field-group">
              <span>Source type</span>
              <input className="input-field" value={editValues.sourceType} onChange={handleEditField('sourceType')} />
            </label>
            <label className="field-group full-width">
              <span>Description</span>
              <textarea className="textarea-field" rows={3} value={editValues.description} onChange={handleEditField('description')} />
            </label>
            <label className="field-group full-width">
              <span>Source link</span>
              <input className="input-field" value={editValues.sourceLink} onChange={handleEditField('sourceLink')} />
            </label>
            <label className="field-group">
              <span>Servings</span>
              <input className="input-field" value={editValues.recipeYield} onChange={handleEditField('recipeYield')} />
            </label>
            <label className="field-group">
              <span>Prep time (minutes)</span>
              <input className="input-field" type="number" min="0" value={editValues.prepTime} onChange={handleEditField('prepTime')} />
            </label>
            <label className="field-group">
              <span>Cook time (minutes)</span>
              <input className="input-field" type="number" min="0" value={editValues.cookTime} onChange={handleEditField('cookTime')} />
            </label>
            <label className="field-group">
              <span>Total time (minutes)</span>
              <input className="input-field" type="number" min="0" value={editValues.totalTime} onChange={handleEditField('totalTime')} />
            </label>
            <label className="field-group full-width">
              <span>Categories</span>
              <input className="input-field" value={editValues.recipeCategory} onChange={handleEditField('recipeCategory')} />
            </label>
            <label className="field-group full-width">
              <span>Cuisine</span>
              <input className="input-field" value={editValues.recipeCuisine} onChange={handleEditField('recipeCuisine')} />
            </label>
            <label className="field-group full-width">
              <span>Ingredients (one per line)</span>
              <textarea className="textarea-field" rows={6} value={editValues.recipeIngredient} onChange={handleEditField('recipeIngredient')} />
            </label>
            <label className="field-group full-width">
              <span>Instructions (one per line)</span>
              <textarea className="textarea-field" rows={8} value={editValues.recipeInstructions} onChange={handleEditField('recipeInstructions')} />
            </label>
          </div>
          <div className="compact-actions">
            <button type="button" className="secondary-button" onClick={() => setEditMode(false)}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={() => void handleSaveEdit()} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="recipe-detail-columns">
        <section className="recipe-detail-card">
          <h3>Ingredients</h3>
          {recipeIngredients.length ? (
            <ul>{recipeIngredients.map((ingredient, index) => <li key={`${ingredient}-${index}`}>{ingredient}</li>)}</ul>
          ) : (
            <p className="recipe-empty-detail">No ingredients have been added yet.</p>
          )}
        </section>

        <section className="recipe-detail-card">
          <h3>Instructions</h3>
          {recipeInstructions.length ? (
            <ol>{recipeInstructions.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol>
          ) : (
            <p className="recipe-empty-detail">No instructions have been added yet.</p>
          )}
        </section>
      </div>
    </section>
  )
}
