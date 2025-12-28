import type {StructureBuilder} from 'sanity/desk'
import {SiStripe} from 'react-icons/si'
import {
  DiscountsListActive,
  DiscountsListAll,
  DiscountsListExpired,
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
            .title('All Coupons')
            .child(S.component(DiscountsListAll).title('All Coupons')),
          S.listItem()
            .title('Active Coupons')
            .child(S.component(DiscountsListActive).title('Active Coupons')),
          S.listItem()
            .title('Expired Coupons')
            .child(S.component(DiscountsListExpired).title('Expired Coupons')),
        ]),
    )

export default discountsStructure
