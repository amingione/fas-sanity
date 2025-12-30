import type {StructureBuilder} from 'sanity/desk'
import {SiStripe} from 'react-icons/si'
import {DiscountsListActive, DiscountsListAll, DiscountsListExpired} from './discountsList'

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
            .child(
              S.component()
                .id('stripe-coupons-all')
                .title('All Coupons')
                .component(DiscountsListAll as any),
            ),
          S.listItem()
            .title('Active Coupons')
            .child(
              S.component()
                .id('stripe-coupons-active')
                .title('Active Coupons')
                .component(DiscountsListActive as any),
            ),
          S.listItem()
            .title('Expired Coupons')
            .child(
              S.component()
                .id('stripe-coupons-expired')
                .title('Expired Coupons')
                .component(DiscountsListExpired as any),
            ),
        ]),
    )

export default discountsStructure
