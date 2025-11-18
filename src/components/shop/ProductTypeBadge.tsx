import type {HTMLAttributes} from 'react'

const TYPE_MAP: Record<
  string,
  {
    label: string
    icon: string
    toneClass: string
  }
> = {
  physical: {label: 'Ships to you', icon: '📦', toneClass: 'badge--physical'},
  service: {label: 'In-shop service', icon: '⚙️', toneClass: 'badge--service'},
  bundle: {label: 'Bundle', icon: '📦+', toneClass: 'badge--bundle'},
}

export type ProductTypeBadgeProps = {
  productType?: string | null
} & HTMLAttributes<HTMLSpanElement>

export function ProductTypeBadge({productType, className = '', ...rest}: ProductTypeBadgeProps) {
  const key = (productType || 'physical').toLowerCase()
  const config = TYPE_MAP[key] || TYPE_MAP.physical
  return (
    <span
      role="status"
      {...rest}
      data-product-type={key}
      className={`product-type-badge ${config.toneClass} ${className}`.trim()}
    >
      <span aria-hidden="true" className="product-type-badge__icon">
        {config.icon}
      </span>
      <span className="product-type-badge__label">{config.label}</span>
    </span>
  )
}

export default ProductTypeBadge
