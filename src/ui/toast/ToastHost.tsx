import { dismissToast, useToasts } from './index'

export function ToastHost() {
  const items = useToasts()
  if (items.length === 0) return null
  return (
    <div className="toast-stack" role="status">
      {items.map((item) => (
        <div key={item.id} className="toast">
          {item.text}
          {item.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                item.action?.run()
                dismissToast(item.id)
              }}
            >
              {item.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
