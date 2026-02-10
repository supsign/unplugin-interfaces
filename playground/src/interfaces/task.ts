import type { Base } from './base'

export interface Task extends Base {
  name: string
  user_id: number
}
