import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { durationFromMinutes, durationInMinutes, normalizeStoredRecipe, RecipeCategorySchema, RecipeSchema, type Recipe } from '../lib/recipeSchema'
import { useNavigate } from 'react-router-dom'
import { Toast } from '../components/Toast'

type RecipeRecord = {
  id: string
  slug: string
  household_id: string | null
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
      .select('id, slug, household_id, recipe_data')
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
  recipeCategory: recipe.recipeCategory ?? '',
  recipeIngredient: normalizeListText(recipe.recipeIngredient ?? []),
  recipeInstructions: normalizeListText(recipe.recipeInstructions ?? []),
})

export function SingleRecipePage({ slug, session }: SingleRecipePageProps) {
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [recipeMeta, setRecipeMeta] = useState<Pick<RecipeRecord, 'id' | 'slug'> | null>(null)
  const [isHouseholdRecipe, setIsHouseholdRecipe] = useState(false)
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
    recipeCategory: '',
    recipeIngredient: '',
    recipeInstructions: '',
  })
  const [saveState, setSaveState] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [describeText, setDescribeText] = useState('')
  const [describeSaving, setDescribeSaving] = useState(false)
  const [isIngredientCopyMenuOpen, setIsIngredientCopyMenuOpen] = useState(false)
  const [isAddingIngredientsToList, setIsAddingIngredientsToList] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadRecipe = async () => {
      setLoading(true)
      setError(null)
      setIsHouseholdRecipe(false)

      const data = await loadRecipeRecord(slug)
      let householdId: string | null = null
      if (session) {
        const { data: currentHouseholdId, error: householdError } = await supabase.rpc('get_my_household_id')
        if (householdError) throw householdError
        householdId = currentHouseholdId
      }

      if (isMounted) {
        const normalizedRecipe = normalizeStoredRecipe(data.recipe_data)
        setRecipeMeta({ id: data.id, slug: data.slug })
        setRecipe(normalizedRecipe)
        setEditValues(buildEditValues(normalizedRecipe))
        setIsHouseholdRecipe(Boolean(householdId && data.household_id === householdId))
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
  }, [slug, session])

  const recipeName = useMemo(() => {
    if (!recipe) return 'Recipe'
    return recipe.name || 'Untitled recipe'
  }, [recipe])

  const recipeIngredients = useMemo(() => asStringArray(recipe?.recipeIngredient ?? []), [recipe])
  const recipeInstructions = useMemo(() => asStringArray(recipe?.recipeInstructions ?? []), [recipe])
  const recipeCategory = recipe?.recipeCategory
  const prepMinutes = useMemo(() => durationInMinutes(recipe?.prepTime), [recipe])
  const cookMinutes = useMemo(() => durationInMinutes(recipe?.cookTime), [recipe])
  const displayedPrepMinutes = editMode ? durationInMinutes(editValues.prepTime) : prepMinutes
  const displayedCookMinutes = editMode ? durationInMinutes(editValues.cookTime) : cookMinutes
  const totalMinutes = displayedPrepMinutes + displayedCookMinutes
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

  const addIngredientsToGroceryList = async () => {
    setIsIngredientCopyMenuOpen(false)
    if (!session) {
      setSaveState({ type: 'error', message: 'Please sign in to use your household grocery list.' })
      return
    }

    setIsAddingIngredientsToList(true)
    setSaveState(null)

    try {
      const { data: householdId, error: householdError } = await supabase.rpc('get_my_household_id')
      if (householdError) throw householdError
      if (!householdId) throw new Error('Join or create a household before adding ingredients to its grocery list.')

      const { error } = await supabase
        .from('grocery_items')
        .insert(recipeIngredients.map((name) => ({ household_id: householdId, name })))

      if (error) throw error
      setSaveState({ type: 'success', message: 'Ingredients added to your grocery list.' })
    } catch (addError) {
      setSaveState({
        type: 'error',
        message: addError instanceof Error ? addError.message : 'Unable to add ingredients to the grocery list.',
      })
    } finally {
      setIsAddingIngredientsToList(false)
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

  if (error) {
    return (
      <section className="page-card recipe-detail-page">
        <Toast message={error} type="error" onDismiss={() => setError(null)} />
      </section>
    )
  }

  if (!recipe) {
    return <section className="page-card recipe-detail-page"><div className="recipe-state">Recipe details are unavailable.</div></section>
  }

  return (
    <section className={editMode ? 'page-card recipe-detail-page is-editing' : 'page-card recipe-detail-page'}>
      <div className="recipe-detail-header">
        <div>
          <div className={`recipe-category-label category-${recipeCategory || editValues.recipeCategory || 'meal'}`}>
            {editMode ? (
              <select
                aria-label="Recipe category"
                value={editValues.recipeCategory}
                onChange={handleEditField('recipeCategory')}
              >
                <option value="">Uncategorized</option>
                {RecipeCategorySchema.options.map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}
              </select>
            ) : (
              <span>{recipeCategory ? recipeCategory[0].toUpperCase() + recipeCategory.slice(1) : 'Uncategorized'}</span>
            )}
          </div>
          {editMode ? (
            <label className="recipe-title-editor">
              <span className="sr-only">Recipe name</span>
              <input className="input-field" value={editValues.name} onChange={handleEditField('name')} />
            </label>
          ) : <h2>{recipeName}</h2>}
        </div>

        <div className="recipe-detail-actions">
          <button type="button" className="secondary-button" onClick={shareCurrentRecipe}>Share</button>
          {session && isHouseholdRecipe && !editMode ? (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditMode(true)
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
                  setDescribeMode((current) => !current)
                  setEditMode(false)
                  setSaveState(null)
                }}
              >
                Describe Edits
              </button>
            </>
          ) : null}
        </div>
      </div>

      {saveState ? <Toast message={saveState.message} type={saveState.type} onDismiss={() => setSaveState(null)} /> : null}

      {(editMode || recipe.description || (isHouseholdRecipe && (recipe.sourceType || recipe.sourceLink))) ? (
        <div className="recipe-summary-card">
          {editMode ? (
            <>
              <label className="field-group">
                <span>Description</span>
                <textarea className="textarea-field" rows={3} value={editValues.description} onChange={handleEditField('description')} />
              </label>
              {isHouseholdRecipe ? (
                <div className="recipe-source-edit-grid">
                  <label className="field-group">
                    <span>Source type</span>
                    <input className="input-field" value={editValues.sourceType} onChange={handleEditField('sourceType')} />
                  </label>
                  <label className="field-group">
                    <span>Source link</span>
                    <input className="input-field" value={editValues.sourceLink} onChange={handleEditField('sourceLink')} />
                  </label>
                </div>
              ) : null}
            </>
          ) : recipe.description ? <p className="recipe-summary-text">{recipe.description}</p> : null}
          {isHouseholdRecipe ? (
            editMode ? null : (
              <div className="recipe-source-row">
                {recipe.sourceType ? <span className="recipe-source-badge">{recipe.sourceType}</span> : null}
                {recipe.sourceLink ? (
                  <a href={recipe.sourceLink} target="_blank" rel="noreferrer" className="recipe-source-link">
                    View source
                  </a>
                ) : null}
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {editMode || servings || prepMinutes || cookMinutes || totalMinutes || recipeCategory ? (
        <div className="recipe-detail-metrics">
          <div className="metric-card">
            <span>Servings</span>
            {editMode ? <input className="input-field" type="number" min="0" value={editValues.recipeYield} onChange={handleEditField('recipeYield')} /> : <strong>{servings}</strong>}
          </div>
          <div className="metric-card">
            <span>Prep Time</span>
            {editMode ? <input className="input-field" type="number" min="0" value={editValues.prepTime} onChange={handleEditField('prepTime')} /> : <strong>{formatDurationText(prepMinutes)}</strong>}
          </div>
          <div className="metric-card">
            <span>Cook Time</span>
            {editMode ? <input className="input-field" type="number" min="0" value={editValues.cookTime} onChange={handleEditField('cookTime')} /> : <strong>{formatDurationText(cookMinutes)}</strong>}
          </div>
          {totalMinutes ? <div className="metric-card"><span>Total Time</span><strong>{formatDurationText(totalMinutes)}</strong></div> : null}
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

      <div className="recipe-detail-columns">
        <section className="recipe-detail-card">
          <div className="recipe-ingredients-heading">
            <h3>Ingredients</h3>
            {!editMode ? <div className="ingredient-copy-control">
              <button type="button" className="ingredient-copy-main" onClick={() => void copyIngredients()} disabled={!recipeIngredients.length}>
                Copy
              </button>
              <button
                type="button"
                className="ingredient-copy-toggle"
                aria-label="Ingredient actions"
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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void addIngredientsToGroceryList()}
                    disabled={!recipeIngredients.length || isAddingIngredientsToList}
                  >
                    {isAddingIngredientsToList ? 'Adding…' : 'Add to grocery list'}
                  </button>
                </div>
              ) : null}
            </div> : null}
          </div>
          {editMode ? (
            <label className="field-group">
              <span className="sr-only">Ingredients, one per line</span>
              <textarea className="textarea-field recipe-list-editor" rows={Math.max(6, Math.min(12, editValues.recipeIngredient.split('\n').length + 2))} value={editValues.recipeIngredient} onChange={handleEditField('recipeIngredient')} />
            </label>
          ) : recipeIngredients.length ? (
            <ul>{recipeIngredients.map((ingredient, index) => <li key={`${ingredient}-${index}`}>{ingredient}</li>)}</ul>
          ) : (
            <p className="recipe-empty-detail">No ingredients have been added yet.</p>
          )}
        </section>

        <section className="recipe-detail-card">
          <h3>Instructions</h3>
          {editMode ? (
            <label className="field-group">
              <span className="sr-only">Instructions, one per line</span>
              <textarea className="textarea-field recipe-list-editor" rows={Math.max(8, Math.min(16, editValues.recipeInstructions.split('\n').length + 2))} value={editValues.recipeInstructions} onChange={handleEditField('recipeInstructions')} />
            </label>
          ) : recipeInstructions.length ? (
            <ol>{recipeInstructions.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol>
          ) : (
            <p className="recipe-empty-detail">No instructions have been added yet.</p>
          )}
        </section>
      </div>
      {editMode ? (
        <div className="recipe-edit-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setEditValues(buildEditValues(recipe))
              setEditMode(false)
            }}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={() => void handleSaveEdit()} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : null}
    </section>
  )
}
