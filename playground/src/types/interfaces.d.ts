import type * as Interfaces from '../interfaces';

declare global {
  export interface Task extends Interfaces.Task {}
  export interface User extends Interfaces.User {}
}

export {};