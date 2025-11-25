// /structure/orderStructure.ts
import {ListItemBuilder} from 'sanity/structure'
import defineStructure from '../utils/defineStructure'
import {DocumentTextIcon} from '@sanity/icons'

export default defineStructure<ListItemBuilder>((S) =>
  S.listItem()
    .title('Orders')
    .icon(DocumentTextIcon)
    .child(
      S.list()
        .title('Stripe Invoices')
        .items([
          S.listItem()
            .title('All Invoices')
            .schemaType('order')
            .child(S.documentTypeList('order').apiVersion('2024-10-01').title('All Orders')),

          S.listItem()
            .title('Unfulfilled Orders')
            .child(
              S.documentList()
                .apiVersion('2024-10-01')
                .title('Unfulfilled Invoices')
                .filter('_type == "order" && status != "fulfilled"')
            ),

          S.listItem()
            .title('Paid Invoices')
            .child(
              S.documentList()
                .apiVersion('2024-10-01')
                .title('Paid Invoices')
                .filter('_type == "order" && status == "paid"')
            ),

          S.listItem()
            .title('Pending Invoices')
            .child(
              S.documentList()
                .apiVersion('2024-10-01')
                .title('Pending Invoices')
                .filter('_type == "order" && status == "paid" && !defined(fulfilledAt)')
            ),

          S.listItem()
            .title('Fulfillment Workflow')
            .icon(() => '📦')
            .child(
              S.list()
                .title('Fulfillment Workflow')
                .items([
                  S.listItem()
                    .title('Ready to Pick')
                    .icon(() => '🎯')
                    .child(
                      S.documentList()
                        .title('Ready to Pick')
                        .filter('_type == "order" && fulfillmentWorkflow.currentStage == "ready_to_pick"')
                        .defaultOrdering([{field: 'fulfillmentWorkflow.sla.priority', direction: 'desc'}])
                    ),
                  S.listItem()
                    .title('Picking in Progress')
                    .icon(() => '👷')
                    .child(
                      S.documentList()
                        .title('Picking in Progress')
                        .filter('_type == "order" && fulfillmentWorkflow.currentStage == "picking"')
                    ),
                  S.listItem()
                    .title('Ready to Pack')
                    .icon(() => '📦')
                    .child(
                      S.documentList()
                        .title('Ready to Pack')
                        .filter('_type == "order" && fulfillmentWorkflow.currentStage == "picked"')
                    ),
                  S.listItem()
                    .title('Packing in Progress')
                    .icon(() => '🎁')
                    .child(
                      S.documentList()
                        .title('Packing in Progress')
                        .filter('_type == "order" && fulfillmentWorkflow.currentStage == "packing"')
                    ),
                  S.listItem()
                    .title('Ready to Ship')
                    .icon(() => '🚚')
                    .child(
                      S.documentList()
                        .title('Ready to Ship')
                        .filter('_type == "order" && fulfillmentWorkflow.currentStage in ["packed", "label_created", "ready_to_ship"]')
                    ),
                  S.divider(),
                  S.listItem()
                    .title('On Hold')
                    .icon(() => '⚠️')
                    .child(
                      S.documentList()
                        .title('Orders on Hold')
                        .filter('_type == "order" && fulfillmentWorkflow.currentStage == "on_hold"')
                    ),
                  S.listItem()
                    .title('Behind Schedule')
                    .icon(() => '🔴')
                    .child(
                      S.documentList()
                        .title('Behind Schedule')
                        .filter('_type == "order" && fulfillmentWorkflow.sla.isLate == true')
                        .defaultOrdering([{field: 'fulfillmentWorkflow.sla.daysUntilDue', direction: 'asc'}])
                    ),
                  S.listItem()
                    .title('Urgent Orders')
                    .icon(() => '🚨')
                    .child(
                      S.documentList()
                        .title('Urgent Orders')
                        .filter('_type == "order" && fulfillmentWorkflow.sla.priority == "urgent"')
                    ),
                ])
            ),
        ])
    )
)
