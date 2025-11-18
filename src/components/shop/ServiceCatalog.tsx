import type {ReactNode} from 'react'
import type {CatalogProduct} from '../../lib/productQueries'
import ProductTypeBadge from './ProductTypeBadge'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const portableTextToPlain = (value: any): string => {
  if (!Array.isArray(value)) return ''
  return value
    .map((block) => {
      if (!block || typeof block !== 'object') return ''
      if (block._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children
        .map((child: any) => (typeof child?.text === 'string' ? child.text : ''))
        .join('')
    })
    .filter(Boolean)
    .join(' ')
    .trim()
}

export type ServiceCatalogProps = {
  services: CatalogProduct[]
  heading?: ReactNode
  emptyState?: ReactNode
  className?: string
  onSelectService?: (service: CatalogProduct) => void
}

export function ServiceCatalog({
  services,
  heading = 'Installation & Shop Services',
  emptyState = 'No services are available right now.',
  className,
  onSelectService,
}: ServiceCatalogProps) {
  if (!services || services.length === 0) {
    return <div className={className}>{emptyState}</div>
  }

  return (
    <section className={className}>
      {heading ? <header className="service-catalog__header">{heading}</header> : null}
      <div className="service-catalog__grid">
        {services.map((service) => {
          const description = portableTextToPlain(service.shortDescription) || service.promotionTagline
          const price =
            typeof service.price === 'number'
              ? currencyFormatter.format(service.price)
              : undefined
          return (
            <article
              key={service._id}
              className="service-card"
              data-product-type={service.productType || 'service'}
            >
              <div className="service-card__badge">
                <ProductTypeBadge productType="service" />
              </div>
              <h3 className="service-card__title">{service.title}</h3>
              {price ? <p className="service-card__price">{price}</p> : null}
              {description ? <p className="service-card__description">{description}</p> : null}
              <dl className="service-card__details">
                {service.serviceDuration ? (
                  <>
                    <dt>Duration</dt>
                    <dd>{service.serviceDuration}</dd>
                  </>
                ) : null}
                {service.serviceLocation ? (
                  <>
                    <dt>Location</dt>
                    <dd>{service.serviceLocation}</dd>
                  </>
                ) : null}
              </dl>
              <button
                type="button"
                className="service-card__cta"
                onClick={() => onSelectService?.(service)}
              >
                Request This Service
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default ServiceCatalog
