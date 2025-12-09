import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'

const client = (() => {
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
  })
})()

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }
  if (!client) {
    return {statusCode: 500, body: JSON.stringify({error: 'Missing SANITY credentials'})}
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : {}
    const {workspaceId, connectorName, action} = body
    if (!workspaceId || !connectorName) {
      return {statusCode: 400, body: JSON.stringify({error: 'workspaceId and connectorName required'})}
    }
    if (!['install', 'uninstall'].includes(action)) {
      return {statusCode: 400, body: JSON.stringify({error: 'action must be install|uninstall'})}
    }

    if (action === 'install') {
      await client.create(
        {
          _type: 'connectorInstall',
          connectorName,
          workspace: {_type: 'reference', _ref: workspaceId},
          status: 'installed',
          installedAt: new Date().toISOString(),
        },
        {visibility: 'async'},
      )
    } else {
      const installs: string[] =
        (await client.fetch(
          `*[_type=="connectorInstall" && workspace._ref==$workspaceId && connectorName==$connectorName]._id`,
          {workspaceId, connectorName},
        )) || []
      const tx = client.transaction()
      installs.forEach((id) => tx.delete(id))
      await tx.commit({visibility: 'async'})
    }

    const installed: string[] =
      (await client.fetch(
        `*[_type=="connectorInstall" && workspace._ref==$workspaceId && status=="installed"].connectorName`,
        {workspaceId},
      )) || []

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({installed}),
    }
  } catch (err) {
    console.error('connector-install error', err)
    return {statusCode: 500, body: JSON.stringify({error: 'Internal error'})}
  }
}

export {handler}
