import React, {useMemo} from 'react'
import {Button, Stack} from '@sanity/ui'
import {useFormValue} from 'sanity'
import {useRouter} from 'sanity/router'

function formatTimestamp(value?: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const QuoteStripeSummary: React.FC = () => {
  const router = useRouter()

  const stripeQuoteId = (useFormValue(['stripeQuoteId']) as string) || ''
  const stripeQuoteNumber = (useFormValue(['stripeQuoteNumber']) as string) || ''
  const stripeQuoteStatus = (useFormValue(['stripeQuoteStatus']) as string) || ''
  const stripeCustomerId = (useFormValue(['stripeCustomerId']) as string) || ''
  const stripePaymentLinkId = (useFormValue(['stripePaymentLinkId']) as string) || ''
  const stripePaymentLinkUrl = (useFormValue(['stripePaymentLinkUrl']) as string) || ''
  const stripeQuotePdf = (useFormValue(['stripeQuotePdf']) as string) || ''
  const stripeLastSyncedAt = (useFormValue(['stripeLastSyncedAt']) as string) || ''
  const paymentLinkRef = (useFormValue(['paymentLinkRef']) as {_ref?: string} | null) || null

  const lastSyncedLabel = useMemo(() => formatTimestamp(stripeLastSyncedAt), [stripeLastSyncedAt])

  const paymentLinkDocumentId = paymentLinkRef?._ref

  const handleOpenPaymentLink = () => {
    if (!stripePaymentLinkUrl) return
    try {
      window.open(stripePaymentLinkUrl, '_blank', 'noopener')
    } catch {
      /* noop */
    }
  }

  const handleOpenPaymentLinkDoc = () => {
    if (!paymentLinkDocumentId) return
    router.navigateIntent('edit', {id: paymentLinkDocumentId, type: 'paymentLink'})
  }

  const handleOpenQuotePdf = () => {
    if (!stripeQuotePdf) return
    try {
      window.open(stripeQuotePdf, '_blank', 'noopener')
    } catch {
      /* noop */
    }
  }

  return (
    <div className="quote-stripe-card">
      <div className="quote-stripe-card__header">
        <div>
          <div className="quote-stripe-card__title">Stripe sync</div>
          <div className="quote-stripe-card__subtitle">
            {lastSyncedLabel ? `Last synced ${lastSyncedLabel}` : 'No Stripe sync recorded yet.'}
          </div>
        </div>
        {stripeQuoteStatus ? (
          <span className={`quote-stripe-status quote-stripe-status--${stripeQuoteStatus.toLowerCase()}`}>
            {stripeQuoteStatus}
          </span>
        ) : null}
      </div>

      <dl className="quote-stripe-card__grid">
        <div>
          <dt className="quote-stripe-card__label">Stripe quote</dt>
          <dd className="quote-stripe-card__value">
            {stripeQuoteNumber ? `#${stripeQuoteNumber}` : stripeQuoteId || 'Not linked'}
          </dd>
          {stripeQuoteId ? <div className="quote-stripe-card__muted">{stripeQuoteId}</div> : null}
        </div>
        <div>
          <dt className="quote-stripe-card__label">Stripe customer</dt>
          <dd className="quote-stripe-card__value">{stripeCustomerId || 'Not linked'}</dd>
        </div>
        <div>
          <dt className="quote-stripe-card__label">Payment link</dt>
          <dd className="quote-stripe-card__value">{stripePaymentLinkId || 'Not linked'}</dd>
        </div>
      </dl>

      {(stripePaymentLinkUrl || paymentLinkDocumentId || stripeQuotePdf) && (
        <div className="quote-stripe-card__actions">
          <Stack space={3}>
            {stripePaymentLinkUrl ? (
              <Button
                mode="bleed"
                tone="primary"
                text="Open payment link"
                onClick={handleOpenPaymentLink}
              />
            ) : null}
            {paymentLinkDocumentId ? (
              <Button
                mode="bleed"
                tone="default"
                text="View payment link document"
                onClick={handleOpenPaymentLinkDoc}
              />
            ) : null}
            {stripeQuotePdf ? (
              <Button mode="bleed" tone="default" text="View Stripe quote PDF" onClick={handleOpenQuotePdf} />
            ) : null}
          </Stack>
        </div>
      )}
    </div>
  )
}

export default QuoteStripeSummary
