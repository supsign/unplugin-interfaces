// Direct interface export
export interface Base {
  id: string;
  created_at: string;
  updated_at: string;
}

// Type alias for testing
interface Contact {
  name: string;
  email: string;
  phone?: string;
}

// Another type for testing
interface HubMicrosoftLicense {
  type: 'Basic' | 'Premium' | 'Enterprise';
  expires_at: string;
  features: string[];
}

// Export types using export type syntax
export type { Contact, HubMicrosoftLicense };
