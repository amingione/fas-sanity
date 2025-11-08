import {useEffect, useMemo, useState} from 'react'
import type {SanityClient} from '@sanity/client'

import type {SelectionEvaluation} from '../lib/evaluateProductSelections'
import {
  evaluateProductSelections,
  type ProductRequirementContext,
  type SelectionMaps,
} from '../lib/evaluateProductSelections'
import {
  fetchProductRequirements,
  type FetchProductRequirementsOptions,
  type ProductRequirements,
} from '../lib/fetchProductRequirements'

export type ProductSelections = SelectionMaps

export type UseProductOptionValidationOptions = {
  productId?: string
  productSlug?: string
  client?: SanityClient
  selections: ProductSelections
  initialRequirements?: ProductRequirements
} & Pick<FetchProductRequirementsOptions, 'projectId' | 'dataset' | 'apiVersion' | 'perspective'>

export type ProductOptionValidationState = {
  loading: boolean
  error?: Error
  requirements?: ProductRequirements
  evaluation: SelectionEvaluation
  disabled: boolean
  message?: string
}

function formatMessage(
  missingOptions: string[],
  missingCustomizations: string[],
): string | undefined {
  if (missingOptions.length && missingCustomizations.length) {
    return `Select ${missingOptions.join(', ')} and provide ${missingCustomizations.join(', ')}`
  }
  if (missingOptions.length) {
    return `Select ${missingOptions.join(', ')}`
  }
  if (missingCustomizations.length) {
    return `Provide ${missingCustomizations.join(', ')}`
  }
  return undefined
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(typeof error === 'string' ? error : 'Unknown validation error')
}

export function useProductOptionValidation({
  productId,
  productSlug,
  client,
  selections,
  initialRequirements,
  projectId,
  dataset,
  apiVersion,
  perspective,
}: UseProductOptionValidationOptions): ProductOptionValidationState {
  const [requirements, setRequirements] = useState<ProductRequirements | undefined>(
    initialRequirements,
  )
  const [loading, setLoading] = useState<boolean>(!initialRequirements)
  const [error, setError] = useState<Error | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (initialRequirements) {
        setRequirements(initialRequirements)
        setError(undefined)
        setLoading(false)
        return
      }

      if (!productId && !productSlug) {
        setError(new Error('Missing product identifier for option validation'))
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const result = await fetchProductRequirements({
          client,
          productId,
          productSlug,
          projectId,
          dataset,
          apiVersion,
          perspective,
        })

        if (cancelled) return
        setRequirements(result)
        setError(undefined)
      } catch (err) {
        if (cancelled) return
        setRequirements(undefined)
        setError(normalizeError(err))
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [
    initialRequirements,
    productId,
    productSlug,
    client,
    projectId,
    dataset,
    apiVersion,
    perspective,
  ])

  const evaluation = useMemo<SelectionEvaluation>(() => {
    const context: ProductRequirementContext | null = requirements
      ? {
          productTitle: requirements.title,
          options: requirements.options,
          customizations: requirements.customizations,
        }
      : null
    return evaluateProductSelections(context, selections)
  }, [requirements, selections])

  const disabled = loading || Boolean(error) || !evaluation.isValid
  const message = useMemo(() => {
    if (loading) return 'Select required options to continue'
    if (error) return 'Unable to verify required selections'
    return formatMessage(evaluation.missingOptions, evaluation.missingCustomizations)
  }, [loading, error, evaluation.missingOptions, evaluation.missingCustomizations])

  return {
    loading,
    error,
    requirements,
    evaluation,
    disabled,
    message,
  }
}
