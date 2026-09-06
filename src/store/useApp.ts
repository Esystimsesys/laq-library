import { useContext } from 'react'
import { AppContext, type ContextValue } from './context'

export function useApp(): ContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('AppProvider の外で useApp が呼ばれました')
  return value
}
