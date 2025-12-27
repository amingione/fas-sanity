import type {StructureBuilder} from 'sanity/desk'
import {SiStripe} from 'react-icons/si'
import {
  DiscountsListActive,
  DiscountsListAll,
  DiscountsListExpired,
  DiscountsListScheduled,
} from './discountsList'

const discountsStructure = (S: StructureBuilder) =>
  S.listItem()
    .title('Customer Coupons (Stripe)')
    .icon(SiStripe)
    .child(
      S.list()
        .title('Customer Coupons (Stripe)')
        .items([
          S.listItem()
            .title('All Stripe Coupons')
            .child(S.component(DiscountsListAll).title('All Stripe Coupons')),
          S.listItem()
            .title('Active Stripe Coupons')
            .child(S.component(DiscountsListActive).title('Active Stripe Coupons')),
          S.listItem()
            .title('Expired Stripe Coupons')
            .child(S.component(DiscountsListExpired).title('Expired Stripe Coupons')),
          S.listItem()
            .title('Scheduled Stripe Coupons')
            .child(S.component(DiscountsListScheduled).title('Scheduled Stripe Coupons')),
        ]),
    )

export default discountsStructure
