declare global {
  type Base = import('../interfaces/base').Base;
  type Contact = import('../interfaces/base').Contact;
  type HubMicrosoftLicense = import('../interfaces/base').HubMicrosoftLicense;
  type Task = import('../interfaces/task').Task;
  type User = import('../interfaces/user').User;
  type UserProfile = import('../interfaces/user').UserProfile;
}

export {};