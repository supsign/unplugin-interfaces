import type { Base } from './base'

// Interface defined separately, exported via named export
interface User extends Base {
  name: string
  email: string
  isAdmin: boolean
}

// Another interface for testing
interface UserProfile {
  userId: string
  avatar?: string
  bio?: string
  preferences: Record<string, any>
}

// Using standard named export syntax
export { User, UserProfile }
