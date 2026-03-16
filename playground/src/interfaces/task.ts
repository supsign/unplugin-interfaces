import type { Base } from './base'

// Direct interface export
export interface Task extends Base {
  name: string
  user_id: number
  status: 'pending' | 'completed' | 'cancelled'
  priority: number
}

interface _TaskCategory {
  id: string
  name: string
  color: string
}
