import { useEffect } from 'react'

type ToastProps = {
  message: string
  type?: 'success' | 'error' | 'info'
  onDismiss: () => void
}

export function Toast({ message, type = 'info', onDismiss }: ToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 4000)
    return () => window.clearTimeout(timeout)
  }, [message, onDismiss])

  return (
    <div className={`toast-notification toast-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span>{message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={onDismiss}>×</button>
    </div>
  )
}
