/**
 * FIELD MAPPING NOTE
 * This file must conform to:
 * .docs/reports/field-to-api-map.md
 *
 * Do not introduce new field names or mappings
 * without updating and authorizing changes
 * to the canonical field-to-API map.
 */
import {handler as easypostHandler} from './easypostWebhook'

export const handler = easypostHandler

export default handler
