import type { Base } from './base'

interface User extends Base {
  name: string
  email: string
  isAdmin: boolean
}
export { User }
