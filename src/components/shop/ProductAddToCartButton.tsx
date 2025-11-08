import type {ComponentPropsWithoutRef, ReactNode} from 'react'
import type {SanityClient} from '@sanity/client'

import type {ProductRequirements} from '../../lib/fetchProductRequirements'
import type {ProductSelections} from '../../hooks/useProductOptionValidation'
import {useProductOptionValidation} from '../../hooks/useProductOptionValidation'

export type ProductAddToCartButtonProps = {
  productId?: string
  productSlug?: string
  client?: SanityClient
  selections: ProductSelections
  initialRequirements?: ProductRequirements
  loading?: boolean
  helperText?: ReactNode
  blockedMessage?: ReactNode
  validatingMessage?: ReactNode
  containerClassName?: string
  projectId?: string
  dataset?: string
  apiVersion?: string
  perspective?: 'published' | 'previewDrafts'
} & Omit<ComponentPropsWithoutRef<'button'>, 'disabled'>

const DEFAULT_BLOCKED_MESSAGE = 'Select required options before adding to cart'
const DEFAULT_VALIDATING_MESSAGE = 'Checking required selections…'

export function ProductAddToCartButton({
  productId,
  productSlug,
  client,
  selections,
  initialRequirements,
  loading = false,
  helperText,
  blockedMessage = DEFAULT_BLOCKED_MESSAGE,
  validatingMessage = DEFAULT_VALIDATING_MESSAGE,
  containerClassName,
  projectId,
  dataset,
  apiVersion,
  perspective,
  children,
  className,
  ...buttonProps
}: ProductAddToCartButtonProps) {
  const {
    disabled,
    loading: validating,
    message,
    error,
  } = useProductOptionValidation({
    productId,
    productSlug,
    client,
    selections,
    initialRequirements,
    projectId,
    dataset,
    apiVersion,
    perspective,
  })

  const reason = validating ? validatingMessage : error ? blockedMessage : message || helperText

  const isDisabled = disabled || loading

  return (
    <div className={containerClassName} data-add-to-cart-state={isDisabled ? 'blocked' : 'ready'}>
      <button
        type="button"
        {...buttonProps}
        className={className}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={validating || loading || undefined}
        aria-live="polite"
      >
        {children ?? 'Add to Cart'}
      </button>
      {reason ? (
        <p role="status" aria-live="polite">
          {reason}
        </p>
      ) : null}
    </div>
  )
}

export default ProductAddToCartButton
