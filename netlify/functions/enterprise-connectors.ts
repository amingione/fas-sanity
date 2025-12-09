import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'

type Connector = {
  name: string
  system: string
  version: string
  description: string
  capabilities: string[]
  syncModes: string[]
}

const FALLBACK: Connector[] = [
  {
    name: 'salesforce-crm',
    system: 'Salesforce',
    version: '0.1.0',
    description: 'Sync leads, contacts, opportunities, and custom objects.',
    capabilities: ['webhook', 'batch', 'incremental', 'bi-directional'],
    syncModes: ['realtime', 'hourly', 'daily'],
  },
  {
    name: 'netsuite-erp',
    system: 'NetSuite',
    version: '0.1.0',
    description: 'ERP sync for orders, inventory, and customers.',
    capabilities: ['batch', 'incremental'],
    syncModes: ['hourly', 'daily'],
  },
  {
    name: 'dynamics-crm',
    system: 'Microsoft Dynamics',
    version: '0.1.0',
    description: 'CRM sync for contacts and opportunities.',
    capabilities: ['webhook', 'batch'],
    syncModes: ['realtime', 'daily'],
  },
]

const requireClient = () => {
  const projectId =
    process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || process.env.SANITY_PROJECT
  const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
  const token =
    process.env.SANITY_API_TOKEN ||
    process.env.SANITY_STUDIO_API_TOKEN ||
    process.env.SANITY_AI_FEEDBACK_TOKEN

  if (!projectId || !dataset || !token) return null

  return createClient({
    projectId,
    dataset,
    token,
    apiVersion: '2024-10-01',
    useCdn: false,
    perspective: 'published',
  })
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  const workspaceId = event.queryStringParameters?.workspaceId
  const client = requireClient()

  if (!client) {
    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({connectors: FALLBACK, installed: []}),
    }
  }

  try {
    const connectorDocs =
      (await client.fetch(
        `*[_type=="integrationPack"]{_id,name,version,description,category,tags,documentation,repository,endpoints}`,
      )) || []

    const connectors: Connector[] = connectorDocs.map((doc: any) => ({
      name: doc.name,
      system: doc.category || doc.name,
      version: doc.version || '1.0.0',
      description: doc.description || 'Connector',
      capabilities: doc.tags || [],
      syncModes: ['realtime', 'daily'],
    }))

    let installed: string[] = []
    if (workspaceId) {
      installed =
        (await client.fetch(
          `*[_type=="connectorInstall" && workspace._ref==$workspaceId && status=="installed"].connectorName`,
          {workspaceId},
        )) || []
    }

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({connectors: connectors.length ? connectors : FALLBACK, installed}),
    }
  } catch (err) {
    console.error('enterprise-connectors error', err)
    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({connectors: FALLBACK, installed: []}),
    }
  }
}

export {handler}
