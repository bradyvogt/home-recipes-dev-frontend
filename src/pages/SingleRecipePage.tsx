import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { durationFromMinutes, durationInMinutes, normalizeStoredRecipe, RecipeCategorySchema, RecipeSchema, type Recipe } from '../lib/recipeSchema'
import { useNavigate } from 'react-router-dom'

type RecipeRecord = {
  id: string
  slug: string
  recipe_data: Recipe
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
  recipeIngredient: string
  recipeInstructions: string
}

type SingleRecipePageProps = {
  slug: string
  session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null
}

const SUPABASE_FUNCTION_ROOT = 'https://bpcvnedueofvttcvnvel.supabase.co/functions/v1'
const recipeLoadRequests = new Map<string, Promise<RecipeRecord>>()

const loadRecipeRecord = (slug: string): Promise<RecipeRecord> => {
  const pendingRequest = recipeLoadRequests.get(slug)
  if (pendingRequest) return pendingRequest

  const request = Promise.resolve(
    supabase
      .from('recipes')
      .select('id, slug, recipe_data')
      .eq('slug', slug)
      .maybeSingle(),
  )
    .then(({ data, error }) => {
      if (error) throw error
      if (!data) throw new Error('Recipe not found.')
      return data as unknown as RecipeRecord
    })
    .finally(() => {
      if (recipeLoadRequests.get(slug) === request) {
        recipeLoadRequests.delete(slug)
      }
    })

  recipeLoadRequests.set(slug, request)
  return request
}

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

const formatDurationText = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours && remainder) return `${hours}h ${remainder}m`
  if (hours) return `${hours}h`
  return `${remainder}m`
}

const buildEditValues = (recipe: Recipe): EditValues => ({
  name: recipe.name,
  description: recipe.description ?? '',
  sourceType: recipe.sourceType ?? '',
  sourceLink: recipe.sourceLink ?? '',
  recipeYield: String(recipe.recipeYield),
  prepTime: String(durationInMinutes(recipe.prepTime)),
  cookTime: String(durationInMinutes(recipe.cookTime)),
  totalTime: String(durationInMinutes(recipe.totalTime)),
  recipeCategory: recipe.recipeCategory ?? '',
  recipeIngredient: normalizeListText(recipe.recipeIngredient ?? []),
  recipeInstructions: normalizeListText(recipe.recipeInstructions ?? []),
})

export function SingleRecipePage({ slug, session }: SingleRecipePageProps) {
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
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
    recipeIngredient: '',
    recipeInstructions: '',
  })
  const [saveState, setSaveState] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [describeText, setDescribeText] = useState('')
  const [describeSaving, setDescribeSaving] = useState(false)
  const [isIngredientCopyMenuOpen, setIsIngredientCopyMenuOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadRecipe = async () => {
      setLoading(true)
      setError(null)

      const data = await loadRecipeRecord(slug)

      if (isMounted) {
        const normalizedRecipe = normalizeStoredRecipe(data.recipe_data)
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
    return recipe.name || 'Untitled recipe'
  }, [recipe])

  const recipeIngredients = useMemo(() => asStringArray(recipe?.recipeIngredient ?? []), [recipe])
  const recipeInstructions = useMemo(() => asStringArray(recipe?.recipeInstructions ?? []), [recipe])
  const recipeCategories = useMemo(() => recipe?.recipeCategory ? [recipe.recipeCategory] : [], [recipe])
  const prepMinutes = useMemo(() => durationInMinutes(recipe?.prepTime), [recipe])
  const cookMinutes = useMemo(() => durationInMinutes(recipe?.cookTime), [recipe])
  const totalMinutes = useMemo(() => durationInMinutes(recipe?.totalTime), [recipe])
  const servings = useMemo(() => {
    return recipe?.recipeYield ?? 0
  }, [recipe])

  const handleEditField = (field: keyof EditValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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

  const copyIngredients = async () => {
    setIsIngredientCopyMenuOpen(false)

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard is unavailable in this browser.')
      }

      await navigator.clipboard.writeText(recipeIngredients.join('\n'))
      setSaveState({ type: 'success', message: 'Ingredients copied to clipboard.' })
    } catch {
      setSaveState({ type: 'error', message: 'Unable to copy ingredients to the clipboard.' })
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

      const validation = RecipeSchema.safeParse({
        name: editValues.name.trim() || recipeName,
        description: editValues.description.trim(),
        sourceType: editValues.sourceType.trim(),
        sourceLink: editValues.sourceLink.trim(),
        recipeYield: Number(editValues.recipeYield),
        prepTime: durationFromMinutes(editValues.prepTime || 0),
        cookTime: durationFromMinutes(editValues.cookTime || 0),
        totalTime: durationFromMinutes(editValues.totalTime || 0),
        recipeCategory: editValues.recipeCategory || undefined,
        recipeIngredient: editValues.recipeIngredient.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean),
        recipeInstructions: editValues.recipeInstructions.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean),
      })
      if (!validation.success) {
        throw new Error(validation.error.issues.map((issue) => `${issue.path.join('.') || 'Recipe'}: ${issue.message}`).join(' '))
      }
      const payload = validation.data

      const { data: updatedRecord, error: updateError } = await supabase
        .from('recipes')
        .update({ recipe_data: payload })
        .eq('id', recipeMeta.id)
        .select('id, slug, recipe_data')
        .single()

      if (updateError) throw updateError

      const updatedRecipe = normalizeStoredRecipe(updatedRecord.recipe_data)
      setRecipeMeta({ id: updatedRecord.id, slug: updatedRecord.slug })
      setRecipe(updatedRecipe)
      setEditValues(buildEditValues(updatedRecipe))
      navigate(`/recipe/${encodeURIComponent(updatedRecord.slug)}`, { replace: true })
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

      const updatedRecipe = normalizeStoredRecipe(json?.recipe ?? recipe ?? {})
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

      {(recipe.description || recipe.sourceType || recipe.sourceLink) ? (
        <div className="recipe-summary-card">
          {recipe.description ? <p className="recipe-summary-text">{recipe.description}</p> : null}
          <div className="recipe-source-row">
            {recipe.sourceType ? <span className="recipe-source-badge">{recipe.sourceType}</span> : null}
            {recipe.sourceLink ? (
              <a href={recipe.sourceLink} target="_blank" rel="noreferrer" className="recipe-source-link">
                View source
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {servings || prepMinutes || cookMinutes || totalMinutes || recipeCategories.length ? (
        <div className="recipe-detail-metrics">
          {servings ? <div className="metric-card"><span>Servings</span><strong>{servings}</strong></div> : null}
          {prepMinutes ? <div className="metric-card"><span>Prep Time</span><strong>{formatDurationText(prepMinutes)}</strong></div> : null}
          {cookMinutes ? <div className="metric-card"><span>Cook Time</span><strong>{formatDurationText(cookMinutes)}</strong></div> : null}
          {totalMinutes ? <div className="metric-card"><span>Total Time</span><strong>{formatDurationText(totalMinutes)}</strong></div> : null}
          {recipeCategories.length ? <div className="metric-card wide"><span>Categories</span><strong>{recipeCategories.join(', ')}</strong></div> : null}
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
              <span>Category</span>
              <select className="input-field" value={editValues.recipeCategory} onChange={handleEditField('recipeCategory')}>
                <option value="">No category</option>
                {RecipeCategorySchema.options.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
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
          <div className="recipe-ingredients-heading">
            <h3>Ingredients</h3>
            <div className="ingredient-copy-control">
              <button type="button" className="ingredient-copy-main" onClick={() => void copyIngredients()} disabled={!recipeIngredients.length}>
                Copy
              </button>
              <button
                type="button"
                className="ingredient-copy-toggle"
                aria-label="Choose ingredients to copy"
                aria-haspopup="menu"
                aria-expanded={isIngredientCopyMenuOpen}
                onClick={() => setIsIngredientCopyMenuOpen((isOpen) => !isOpen)}
              >
                <span aria-hidden="true">▾</span>
              </button>
              {isIngredientCopyMenuOpen ? (
                <div className="ingredient-copy-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void copyIngredients()}>Copy all</button>
                  <button type="button" role="menuitem" onClick={() => void copyIngredients()}>Copy required</button>
                </div>
              ) : null}
            </div>
          </div>
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
