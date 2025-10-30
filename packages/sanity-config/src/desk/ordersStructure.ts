import type {StructureBuilder} from 'sanity/structure'
import OrdersShopifyListPane, {
  type OrdersPaneView,
} from '../components/studio/OrdersShopifyListPane'

const createOrdersListItem = (
  S: StructureBuilder,
  id: string,
  title: string,
  view: OrdersPaneView,
) =>
  S.listItem()
    .id(`orders-${id}`)
    .title(title)
    .child(
      S.component()
        .id(`orders-${id}-pane`)
        .title(title)
        .component(OrdersShopifyListPane as any)
        .options({view}),
    )

const ordersStructure = (S: StructureBuilder) =>
  S.listItem()
    .id('orders-root')
    .title('Orders')
    .child(
      S.list()
        .id('orders-root-list')
        .title('Orders')
        .items([
          createOrdersListItem(S, 'all', 'All', 'all'),
          createOrdersListItem(S, 'unfulfilled', 'Unfulfilled', 'unfulfilled'),
          createOrdersListItem(S, 'unpaid', 'Unpaid', 'unpaid'),
          createOrdersListItem(S, 'open', 'Open', 'open'),
          createOrdersListItem(S, 'archived', 'Archived', 'archived'),
          S.listItem()
            .id('orders-drafts')
            .title('Draft orders')
            .child(
              S.list()
                .id('orders-drafts-list')
                .title('Draft orders')
                .items([
                  createOrdersListItem(S, 'draft-invoices', 'Invoices', 'draftInvoices'),
                  createOrdersListItem(S, 'draft-quotes', 'Quotes', 'draftQuotes'),
                ]),
            ),
          createOrdersListItem(S, 'abandoned', 'Abandoned checkouts', 'abandoned'),
        ]),
    )

export default ordersStructure
