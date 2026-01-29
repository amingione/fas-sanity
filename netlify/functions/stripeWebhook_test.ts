import { describe, it, expect } from 'vitest';
import { updateCheckoutSessionOnComplete } from './stripeWebhook';

describe('Stripe Webhook Tests', () => {
    it('should handle checkout session updates', async () => {
        const response = await updateCheckoutSessionOnComplete();
        expect(response).toBeDefined();
    });
});