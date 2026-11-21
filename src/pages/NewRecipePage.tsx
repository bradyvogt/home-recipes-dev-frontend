import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { normalizeStoredRecipe, type Recipe } from '../lib/recipeSchema'

type RecipeMethod = 'url' | 'image' | 'describe' | 'json'

type NewRecipePageProps = {
  session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null
  onGoogleSignIn: () => Promise<void>
  onRecipeAdded?: (slug: string) => void
}

const SUPABASE_FUNCTION_ROOT = 'https://bpcvnedueofvttcvnvel.supabase.co/functions/v1'

type FeedbackState = {
  type: 'success' | 'error'
  message: string
}

type ImportEntry = {
  index: number
  recipe: Recipe | null
  error?: string
  status: 'pending' | 'imported' | 'failed'
  importError?: string
}

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function NewRecipePage({ session, onGoogleSignIn, onRecipeAdded }: NewRecipePageProps) {
  const [method, setMethod] = useState<RecipeMethod>('url')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importEntries, setImportEntries] = useState<ImportEntry[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  const getNewestRecipeSlug = async (name: string): Promise<string | null> => {
    const trimmedName = name.trim()
    if (!trimmedName) return null

    const { data, error } = await supabase
      .from('recipes')
      .select('slug')
      .eq('recipe_name', trimmedName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('Unable to resolve the saved recipe slug.', error)
      return null
    }

    return data?.slug ?? null
  }

  const methodOptions: { key: RecipeMethod; label: string; description: string }[] = [
    { key: 'url', label: 'By URL', description: 'Paste a recipe page or blog post URL' },
    { key: 'image', label: 'By image', description: 'Upload a photo of a handwritten or printed recipe' },
    { key: 'describe', label: 'Describe', description: 'Type the recipe ingredients and steps in plain English' },
    { key: 'json', label: 'Import JSON', description: 'Add recipes from a JSON file' },
  ]

  const getAuthHeaders = async (contentType?: string): Promise<Headers> => {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      throw new Error(error.message)
    }

    if (!data.session?.access_token) {
      throw new Error('Please sign in to add a recipe.')
    }

    const headers = new Headers()
    headers.set('Authorization', `Bearer ${data.session.access_token}`)

    if (contentType) {
      headers.set('Content-Type', contentType)
    }

    return headers
  }

  const invokeRecipeImport = async (route: 'url' | 'image' | 'describe', payload: BodyInit, headers?: Headers) => {
    const actualRoute = route === 'describe' ? 'freeform-text' : route
    const candidates = [
      `${SUPABASE_FUNCTION_ROOT}/index-recipe/${actualRoute}`,
      `${SUPABASE_FUNCTION_ROOT}/index-recipe/index-recipe/${actualRoute}`,
    ]

    let lastError: Error | null = null

    for (const endpoint of candidates) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: payload,
        })

        if (response.ok) {
          return await response.json()
        }

        const errorText = await response.text()
        let parsedError: { error?: string } | null = null
        try {
          parsedError = errorText ? JSON.parse(errorText) : null
        } catch {
          // Gateways can return plain-text or HTML errors instead of JSON.
        }
        const message = parsedError?.error ?? (response.status === 404
          ? 'Recipe import endpoint returned 404.'
          : `Recipe import failed (${response.status}).`)

        if (response.status !== 404) {
          throw new Error(message)
        }

        lastError = new Error(message)
      } catch (error) {
        if (error instanceof Error && error.message.includes('fetch')) {
          lastError = error
          continue
        }

        lastError = error as Error
        if (!(error instanceof Error && error.message.includes('404'))) {
          break
        }
      }
    }

    throw lastError ?? new Error('The recipe import endpoint is unavailable.')
  }

  const handleJsonFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setImportFileName(file?.name ?? '')
    setImportEntries([])
    setFeedback(null)

    if (!file) return
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      setFeedback({ type: 'error', message: 'Choose a JSON file smaller than 10 MB.' })
      return
    }

    try {
      const parsed: unknown = JSON.parse(await file.text())
      const rawRecipes = Array.isArray(parsed)
        ? parsed
        : isRecord(parsed) && Array.isArray(parsed.recipes)
          ? parsed.recipes
          : null

      if (!rawRecipes?.length) {
        throw new Error('The JSON file must contain a non-empty recipe array.')
      }

      const entries = rawRecipes.map((value, index): ImportEntry => {
        try {
          if (!isRecord(value)) {
            throw new Error('Expected a recipe object.')
          }

          const recipe = normalizeStoredRecipe(value)
          if (!recipe.name.trim()) {
            throw new Error('Recipe name is required.')
          }
          if (recipe.recipeYield < 1) {
            throw new Error('Servings must be a positive number.')
          }

          return { index: index + 1, recipe, status: 'pending' }
        } catch (error) {
          return {
            index: index + 1,
            recipe: null,
            error: error instanceof Error ? error.message : 'Recipe is not in a supported format.',
            status: 'pending',
          }
        }
      })

      setImportEntries(entries)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to read this JSON file.',
      })
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback(null)

    if (!session) {
      setFeedback({ type: 'error', message: 'Please sign in to add a recipe.' })
      return
    }

    setIsSubmitting(true)

    try {
      if (method === 'url') {
        if (!url.trim()) {
          throw new Error('Please paste a recipe URL first.')
        }

        const headers = await getAuthHeaders('application/json')
        const data = await invokeRecipeImport('url', JSON.stringify({ url }), headers)

        if (data?.recipe?.name) {
          const slug = await getNewestRecipeSlug(data.recipe.name)
          if (slug && onRecipeAdded) {
            onRecipeAdded(slug)
            return
          }

          setFeedback({ type: 'success', message: `Recipe added: ${data.recipe.name}` })
        } else {
          setFeedback({ type: 'success', message: 'Recipe added successfully.' })
        }

        setUrl('')
      }

      if (method === 'image') {
        if (!selectedFiles.length) {
          throw new Error('Please choose one or more recipe images.')
        }

        const formData = new FormData()
        selectedFiles.forEach((file) => formData.append('images', file))

        const headers = await getAuthHeaders()
        const data = await invokeRecipeImport('image', formData, headers)

        if (data?.recipe?.name) {
          const slug = await getNewestRecipeSlug(data.recipe.name)
          if (slug && onRecipeAdded) {
            onRecipeAdded(slug)
            return
          }

          setFeedback({ type: 'success', message: `Recipe added: ${data.recipe.name}` })
        } else {
          setFeedback({ type: 'success', message: 'Recipe added successfully from your image.' })
        }

        setSelectedFiles([])
      }

      if (method === 'describe') {
        if (!description.trim()) {
          throw new Error('Please describe the recipe you want to add.')
        }

        const headers = await getAuthHeaders('application/json')
        const data = await invokeRecipeImport('describe', JSON.stringify({ text: description }), headers)

        if (data?.recipe?.name) {
          const slug = await getNewestRecipeSlug(data.recipe.name)
          if (slug && onRecipeAdded) {
            onRecipeAdded(slug)
            return
          }

          setFeedback({ type: 'success', message: `Recipe added: ${data.recipe.name}` })
        } else {
          setFeedback({ type: 'success', message: 'Recipe added successfully from your description.' })
        }

        setDescription('')
      }

      if (method === 'json') {
        const validEntries = importEntries.filter((entry) => entry.recipe)
        if (!validEntries.length) {
          throw new Error('Choose a JSON file with at least one valid recipe.')
        }

        let importedCount = 0
        let failedCount = 0

        for (const entry of validEntries) {
          if (entry.status === 'imported' || !entry.recipe) continue

          try {
            const { error } = await supabase
              .from('recipes')
              .insert({ recipe_data: entry.recipe })

            if (error) throw error

            importedCount += 1
            setImportEntries((current) => current.map((item) =>
              item.index === entry.index ? { ...item, status: 'imported', importError: undefined } : item,
            ))
          } catch (error) {
            failedCount += 1
            setImportEntries((current) => current.map((item) =>
              item.index === entry.index
                ? { ...item, status: 'failed', importError: error instanceof Error ? error.message : 'Insert failed.' }
                : item,
            ))
          }
        }

        const invalidCount = importEntries.filter((entry) => !entry.recipe).length
        const message = [
          `Imported ${importedCount} recipe${importedCount === 1 ? '' : 's'}.`,
          failedCount ? `${failedCount} failed and can be retried.` : '',
          invalidCount ? `${invalidCount} invalid entr${invalidCount === 1 ? 'y was' : 'ies were'} skipped.` : '',
        ].filter(Boolean).join(' ')

        setFeedback({
          type: failedCount || invalidCount ? 'error' : 'success',
          message,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while adding the recipe.'
      setFeedback({ type: 'error', message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    setSelectedFiles(files)
  }

  if (!session) {
    return (
      <section className="page-card">
        <div className="page-header">
          <div>
            <div className="eyebrow">New recipe</div>
            <h2>Create a recipe</h2>
          </div>
        </div>

        <div className="sign-in-card">
          <h3>Please sign in</h3>
          <p>Save recipes to your kitchen from a URL, image, description, or JSON file.</p>
          <button type="button" className="primary-button" onClick={() => void onGoogleSignIn()}>
            Sign in with Google
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="page-card new-recipe-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">New recipe</div>
          <h2>Add a recipe</h2>
        </div>
      </div>

      <div className="new-recipe-layout">
        <div className="recipe-option-grid">
          {methodOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={method === option.key ? 'option-card active' : 'option-card'}
              onClick={() => setMethod(option.key)}
            >
              <span className="option-title">{option.label}</span>
              <span className="option-description">{option.description}</span>
            </button>
          ))}
        </div>

        <form className="recipe-form" onSubmit={handleSubmit}>
          {method === 'url' ? (
            <div className="field-group">
              <label htmlFor="recipe-url">Recipe URL</label>
              <input
                id="recipe-url"
                className="input-field"
                type="url"
                value={url}
                placeholder="https://example.com/recipe"
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
          ) : null}

          {method === 'image' ? (
            <div className="field-group">
              <label htmlFor="recipe-image">Recipe images</label>
              <input
                id="recipe-image"
                className="file-field"
                type="file"
                accept="image/*"
                multiple
                onChange={onFileChange}
              />
              {selectedFiles.length ? (
                <div className="file-list">
                  {selectedFiles.map((file) => (
                    <span key={`${file.name}-${file.size}`} className="file-pill">
                      {file.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {method === 'describe' ? (
            <div className="field-group">
              <label htmlFor="recipe-description">Describe the recipe</label>
              <textarea
                id="recipe-description"
                className="textarea-field"
                value={description}
                rows={10}
                placeholder="Example: 3 eggs, 1 cup flour, 1 tsp baking powder, mix until smooth and bake at 350F for 20 minutes..."
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          ) : null}

          {method === 'json' ? (
            <div className="field-group">
              <label htmlFor="recipe-json-file">Recipe JSON file</label>
              <input
                id="recipe-json-file"
                className="file-field"
                type="file"
                accept=".json,application/json"
                disabled={isSubmitting}
                onChange={(event) => void handleJsonFileChange(event)}
              />
              <p className="import-help">
                Choose a JSON array of recipes or an object with a recipes array. Recipes are validated
                before import and saved to your household. Importing the same file again creates duplicates.
              </p>
              {importFileName ? <span className="file-pill">{importFileName}</span> : null}
              {importEntries.length ? (
                <div className="import-preview" aria-live="polite">
                  <strong>
                    {importEntries.filter((entry) => entry.recipe).length} valid of {importEntries.length} recipes
                  </strong>
                  <ul className="import-recipe-list">
                    {importEntries.map((entry) => (
                      <li key={entry.index} className={entry.error ? 'import-recipe invalid' : 'import-recipe'}>
                        <span>
                          {entry.recipe?.name ?? `Recipe ${entry.index}`}
                          {entry.error ? <small>{entry.error}</small> : null}
                          {entry.importError ? <small>{entry.importError}</small> : null}
                        </span>
                        <span className={`import-status ${entry.error ? 'invalid' : entry.status}`}>
                          {entry.error ? 'Invalid' : entry.status === 'pending' ? 'Ready' : entry.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {feedback ? <Toast message={feedback.message} type={feedback.type} onDismiss={() => setFeedback(null)} /> : null}

          <div className="submit-row">
            <button
              type="submit"
              className="primary-button"
              disabled={isSubmitting || (method === 'json' && !importEntries.some((entry) => entry.recipe && entry.status !== 'imported'))}
            >
              {isSubmitting ? 'Adding…' : method === 'json' ? 'Import recipes' : 'Add recipe'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
