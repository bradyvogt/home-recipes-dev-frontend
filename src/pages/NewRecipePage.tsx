import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type RecipeMethod = 'url' | 'image' | 'describe'

type NewRecipePageProps = {
  session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null
  onGoogleSignIn: () => Promise<void>
}

const SUPABASE_FUNCTION_ROOT = 'https://bpcvnedueofvttcvnvel.supabase.co/functions/v1'

type FeedbackState = {
  type: 'success' | 'error'
  message: string
}

export function NewRecipePage({ session, onGoogleSignIn }: NewRecipePageProps) {
  const [method, setMethod] = useState<RecipeMethod>('url')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  const methodOptions: { key: RecipeMethod; label: string; description: string }[] = [
    { key: 'url', label: 'By URL', description: 'Paste a recipe page or blog post URL' },
    { key: 'image', label: 'By image', description: 'Upload a photo of a handwritten or printed recipe' },
    { key: 'describe', label: 'Describe', description: 'Type the recipe ingredients and steps in plain English' },
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
        const parsedError = errorText ? JSON.parse(errorText) : null
        const message = parsedError?.error ?? 'Recipe import failed.'

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
          setFeedback({ type: 'success', message: `Recipe added: ${data.recipe.name}` })
        } else {
          setFeedback({ type: 'success', message: 'Recipe added successfully from your description.' })
        }

        setDescription('')
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
          <p>Save your recipe to your kitchen and use AI to pull details from a URL, image, or description.</p>
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

          {feedback ? <div className={feedback.type === 'success' ? 'status success' : 'status error'}>{feedback.message}</div> : null}

          <div className="submit-row">
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add recipe'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
