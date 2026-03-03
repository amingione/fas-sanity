/**
 * Ambient type declarations for packages that ship without bundled types
 * and for which @types/* packages are not installed.
 */

declare module 'bcryptjs' {
  export function hash(data: string, saltOrRounds: string | number): Promise<string>
  export function compare(data: string, encrypted: string): Promise<boolean>
  export function genSalt(rounds?: number): Promise<string>
  export function hashSync(data: string, saltOrRounds: string | number): string
  export function compareSync(data: string, encrypted: string): boolean
  export function genSaltSync(rounds?: number): string
  export function getRounds(encrypted: string): number
}
