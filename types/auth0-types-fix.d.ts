 declare module '@auth0/nextjs-auth0' {
  import { Session } from '@auth0/nextjs-auth0';

  export function getSession(req: any, res?: any): Promise<Session | null>;
}