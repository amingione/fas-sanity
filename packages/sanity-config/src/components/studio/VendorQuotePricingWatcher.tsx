import {useEffect, useMemo, useRef, useState} from 'react'
import {useClient, useDocumentOperation, useFormValue} from 'sanity'
import type {VendorPricingTier, VendorProductPricing} from '../../../../../shared/vendorPricing'
import {calculateVendorItemSubtotal} from '../../../../../shared/vendorPricing'

const sanitizeNumber = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

export default function VendorQuotePricingWatcher() {
  const documentId = (useFormValue(['_id']) as string) || ''
  const vendorRef = useFormValue(['vendor']) as {_ref?: string} | undefined
  const rawItems = useFormValue(['items']) as any[] | undefined
  const items = useMemo(() => rawItems || [], [rawItems])
  const shipping = useFormValue(['shipping']) as number | undefined
  const tax = useFormValue(['tax']) as number | undefined
  const explicitTier = (useFormValue(['pricingTier']) as string) || ''
  const customDiscount = useFormValue(['customDiscountPercentage']) as number | undefined
  const {patch} = useDocumentOperation(documentId, 'vendorQuote')
  const client = useClient({apiVersion: '2024-10-01'})
  const [vendorData, setVendorData] = useState<{pricingTier?: VendorPricingTier; customDiscountPercentage?: number | null} | null>(null)
  const [productCache, setProductCache] = useState<Record<string, VendorProductPricing>>({})
  const lastSignatureRef = useRef('')

  const vendorId = vendorRef?._ref

  useEffect(() => {
    if (!vendorId) {
      setVendorData(null)
      return
    }
    let cancelled = false
    client
      .fetch<{pricingTier?: VendorPricingTier; customDiscountPercentage?: number}>(
        `*[_id == $id][0]{pricingTier, customDiscountPercentage}`,
        {id: vendorId},
      )
      .then((result) => {
        if (!cancelled) setVendorData(result || null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [client, vendorId])

  useEffect(() => {
    const ids = Array.from(
      new Set(
        items
          .map((item) => item?.product?._ref)
          .filter((id: string | undefined): id is string => {
            if (!id) return false
            return !productCache[id]
          }),
      ),
    )
    if (!ids.length) return
    let cancelled = false
    client
      .fetch<Array<VendorProductPricing & {_id: string}>>(
        `*[_id in $ids]{_id, price, wholesalePriceStandard, wholesalePricePreferred, wholesalePricePlatinum, pricingTiers}`,
        {ids},
      )
      .then((docs) => {
        if (cancelled) return
        setProductCache((prev) => {
          const next = {...prev}
          docs?.forEach((doc) => {
            next[doc._id] = doc
          })
          return next
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [client, items, productCache])

  const effectiveTier = useMemo(() => {
    const tier = (explicitTier || vendorData?.pricingTier || 'standard').toLowerCase()
    if (tier === 'standard' || tier === 'preferred' || tier === 'platinum' || tier === 'custom') {
      return tier as VendorPricingTier
    }
    return 'standard'
  }, [explicitTier, vendorData?.pricingTier])

  const effectiveDiscount = useMemo(() => {
    if (effectiveTier !== 'custom') return undefined
    if (typeof customDiscount === 'number' && Number.isFinite(customDiscount)) return customDiscount
    if (typeof vendorData?.customDiscountPercentage === 'number') return vendorData.customDiscountPercentage
    return undefined
  }, [customDiscount, effectiveTier, vendorData?.customDiscountPercentage])

  useEffect(() => {
    if (!documentId) return
    if (!Array.isArray(items) || !items.length) {
      const signature = `${documentId}-empty-${sanitizeNumber(shipping)}-${sanitizeNumber(tax)}`
      if (signature === lastSignatureRef.current) return
      lastSignatureRef.current = signature
      const baseSet: Record<string, any> = {
        subtotal: 0,
        total: sanitizeNumber(shipping) + sanitizeNumber(tax),
      }
      if (!explicitTier && vendorData?.pricingTier) {
        baseSet.pricingTier = vendorData.pricingTier
      }
      patch.execute([{set: baseSet}])
      return
    }
    const nextItems = items.map((item) => {
      const productId = item?.product?._ref
      const product = productId ? productCache[productId] : undefined
      const {unitPrice, subtotal} = calculateVendorItemSubtotal(
        {
          product,
          quantity: item?.quantity,
          unitPrice: item?.unitPrice,
          tier: effectiveTier,
          customDiscountPercentage: effectiveDiscount,
        },
        effectiveTier,
        effectiveDiscount,
      )
      return {
        _key: item?._key || productId || Math.random().toString(36).slice(2),
        product: item?.product,
        description: item?.description,
        quantity: item?.quantity || 1,
        unitPrice,
        subtotal,
      }
    })

    const subtotal = nextItems.reduce((sum, item) => sum + sanitizeNumber(item.subtotal), 0)
    const shippingValue = sanitizeNumber(shipping)
    const taxValue = sanitizeNumber(tax)
    const total = subtotal + shippingValue + taxValue

    const payload = {
      items: nextItems,
      subtotal: Math.round(subtotal * 100) / 100,
      total: Math.round(total * 100) / 100,
    }
    const signature = JSON.stringify(payload)
    if (signature === lastSignatureRef.current) return
    lastSignatureRef.current = signature
    const setPayload: Record<string, any> = {
      items: nextItems,
      subtotal: payload.subtotal,
      total: payload.total,
      customDiscountPercentage: effectiveTier === 'custom' ? effectiveDiscount ?? null : null,
    }
    if (!explicitTier && vendorData?.pricingTier) {
      setPayload.pricingTier = vendorData.pricingTier
    }
    patch.execute([{set: setPayload}])
  }, [
    documentId,
    effectiveDiscount,
    effectiveTier,
    explicitTier,
    items,
    patch,
    productCache,
    shipping,
    tax,
    vendorData?.pricingTier,
  ])

  return null
}
