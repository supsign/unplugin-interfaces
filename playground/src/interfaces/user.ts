import type { Base } from './base'

export interface User extends Base {
  name: string
  email: string
  isAdmin: boolean
}
