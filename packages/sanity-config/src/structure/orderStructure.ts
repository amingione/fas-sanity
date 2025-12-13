// /structure/orderStructure.ts
import {ListItemBuilder} from 'sanity/structure'
import defineStructure from '../utils/defineStructure'
import {PackageIcon, LaunchIcon, CheckmarkCircleIcon, WarningOutlineIcon} from '@sanity/icons'

const defaultOrdering = [{field: 'createdAt', direction: 'desc' as const}]

export default defineStructure<ListItemBuilder>((S) =>
  S.listItem()
    .title('📦 Orders')
    .icon(PackageIcon)
    .child(
      S.list()
        .title('Order Workflow')
        .items([
          S.listItem()
            .title('Needs Fulfillment')
            .icon(PackageIcon)
            .child(
              S.documentList()
                .apiVersion('2024-10-01')
                .title('Needs Fulfillment')
                .filter('_type == "order" && status == "paid"')
                .defaultOrdering(defaultOrdering),
            ),
          S.listItem()
            .title('Fulfilled')
            .icon(LaunchIcon)
            .child(
              S.documentList()
                .apiVersion('2024-10-01')
                .title('Fulfilled Orders')
                .filter('_type == "order" && status == "fulfilled"')
                .defaultOrdering(defaultOrdering),
            ),
          S.listItem()
            .title('Delivered')
            .icon(CheckmarkCircleIcon)
            .child(
              S.documentList()
                .apiVersion('2024-10-01')
                .title('Delivered Orders')
                .filter('_type == "order" && status == "delivered"')
                .defaultOrdering(defaultOrdering),
            ),
          S.listItem()
            .title('Issues')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .apiVersion('2024-10-01')
                .title('Orders With Issues')
                .filter('_type == "order" && status in ["canceled","refunded"]')
                .defaultOrdering(defaultOrdering),
            ),
          S.divider(),
          S.listItem()
            .title('All Orders')
            .icon(PackageIcon)
            .child(
              S.documentList()
                .apiVersion('2024-10-01')
                .title('All Orders')
                .schemaType('order')
                .defaultOrdering(defaultOrdering),
            ),
        ]),
    ),
)
