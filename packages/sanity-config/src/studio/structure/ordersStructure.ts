import {DocumentTextIcon} from '@sanity/icons'
import {ListItemBuilder, StructureBuilder} from 'sanity/structure'
import {ConfigContext} from 'sanity'
import defineStructure from '../../utils/defineStructure'
import ShopifyOrdersList from '../../components/studio/OrdersStructureList'

const API_VERSION = '2024-10-01'

type OrdersListConfig = {
  id: string
  title: string
  filter: string
  schemaType?: string
  shippingView?: boolean
  allowArchivedToggle?: boolean
  params?: Record<string, unknown>
}

const createOrdersPane = (S: StructureBuilder, config: OrdersListConfig) =>
  S.component()
    .id(`${config.id}-pane`)
    .title(config.title)
    .options({
      filter: config.filter,
      schemaType: config.schemaType ?? 'order',
      shippingView: config.shippingView ?? false,
      allowArchivedToggle: config.allowArchivedToggle ?? false,
      params: config.params ?? {},
      apiVersion: API_VERSION,
    })
    .component(ShopifyOrdersList as any)

const createOrdersListItem = (S: StructureBuilder, config: OrdersListConfig): ListItemBuilder =>
  S.listItem().id(config.id).title(config.title).child(createOrdersPane(S, config))

export default defineStructure<ListItemBuilder[]>((S: StructureBuilder, _context: ConfigContext) => [
  S.listItem()
    .id('orders-root')
    .title('Orders')
    .icon(DocumentTextIcon)
    .child(
      S.list()
        .title('Orders')
        .items([
          createOrdersListItem(S, {
            id: 'orders-all',
            title: 'All',
            filter: '_type == "order"',
            allowArchivedToggle: true,
          }),
          createOrdersListItem(S, {
            id: 'orders-unfulfilled',
            title: 'Unfulfilled',
            filter: '_type == "order" && fulfillmentStatus == "unfulfilled" && !defined(archivedAt)',
            shippingView: true,
          }),
          createOrdersListItem(S, {
            id: 'orders-unpaid',
            title: 'Unpaid',
            filter:
              '_type == "order" && paymentStatus in ["unpaid","pending","authorized"] && !defined(archivedAt)',
          }),
          createOrdersListItem(S, {
            id: 'orders-open',
            title: 'Open',
            filter: '_type == "order" && status == "open" && !defined(archivedAt)',
          }),
          createOrdersListItem(S, {
            id: 'orders-archived',
            title: 'Archived',
            filter: '_type == "order" && defined(archivedAt)',
          }),
          S.listItem()
            .id('orders-drafts')
            .title('Draft orders')
            .child(
              S.list()
                .title('Draft orders')
                .items([
                  createOrdersListItem(S, {
                    id: 'orders-draft-invoices',
                    title: 'Invoices',
                    filter:
                      '_type == "order" && status == "draft" && isInvoice == true && isQuote == false',
                  }),
                  createOrdersListItem(S, {
                    id: 'orders-draft-quotes',
                    title: 'Quotes',
                    filter: '_type == "order" && status == "draft" && isQuote == true',
                  }),
                ]),
            ),
          createOrdersListItem(S, {
            id: 'orders-abandoned',
            title: 'Abandoned checkouts',
            filter: '_type == "checkout" && status in ["abandoned","expired"]',
            schemaType: 'checkout',
          }),
        ]),
    ),
])
