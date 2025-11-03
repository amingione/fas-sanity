import OrdersDocumentTable from './OrdersDocumentTable'
import {EXPIRED_SESSION_PANEL_TITLE, GROQ_FILTER_ONLY_EXPIRED} from '../../../utils/orderFilters'

const ABANDONED_ORDERINGS = [{field: 'coalesce(createdAt, _createdAt)', direction: 'desc' as const}]

export default function AbandonedOrdersDocumentTable() {
  return (
    <OrdersDocumentTable
      title={EXPIRED_SESSION_PANEL_TITLE}
      filter={`(${GROQ_FILTER_ONLY_EXPIRED})`}
      emptyState="No expired checkout sessions"
      orderings={ABANDONED_ORDERINGS}
      pageSize={12}
      excludeCheckoutSessionExpired={false}
    />
  )
}
