declare module '@stripe/stripe-js' {
  interface CollectFinancialConnectionsAccountsResult {
    error?: {message?: string}
    financialConnectionsSession?: {id: string}
  }

  export interface Stripe {
    collectFinancialConnectionsAccounts(params: {
      clientSecret: string
    }): Promise<CollectFinancialConnectionsAccountsResult>
  }

  export function loadStripe(publishableKey: string): Promise<Stripe | null>
}
