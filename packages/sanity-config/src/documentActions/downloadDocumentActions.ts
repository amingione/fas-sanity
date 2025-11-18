import {
  type DocumentActionComponent,
  type DocumentActionProps,
  type DocumentActionsContext,
  type SanityDocument,
  useDocumentOperation,
} from 'sanity'
import {
  ArchiveIcon,
  CopyIcon,
  DownloadIcon,
  LinkIcon,
  RestoreIcon,
  SparkleIcon,
} from '@sanity/icons'

const API_VERSION = '2024-10-01'
const DOWNLOAD_ACTIONS_FLAG = Symbol.for('fas.downloadActionsApplied')

type DownloadDoc = SanityDocument & {
  title?: string
  description?: string
  file?: {asset?: {_ref?: string}}
  documentType?: 'download' | 'template' | 'reference' | 'guide'
  category?: 'marketing' | 'operations' | 'technical' | 'legal' | 'templates'
  accessLevel?: 'public' | 'internal' | 'admin'
  tags?: string[]
  relatedDocuments?: Array<{_ref: string}>
  version?: string
  isTemplate?: boolean
  isArchived?: boolean
}

const isDownloadDocument = (props: DocumentActionProps) => props.type === 'downloadResource'

const getActiveDoc = (props: DocumentActionProps): DownloadDoc | null =>
  (props.draft as DownloadDoc | null) ||
  (props.published as DownloadDoc | null) ||
  null

const toPublishedId = (id: string) => id.replace(/^drafts\./, '')

const openDocumentIntent = (id: string) => {
  if (typeof window === 'undefined') return
  const base = window.location.origin ?? ''
  const intentUrl = '#/intent/edit/mode=edit'
  const url = `${base}/${intentUrl}?type=downloadResource&id=${encodeURIComponent(id)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

const fetchFileMeta = async (
  context: DocumentActionsContext,
  docId: string,
): Promise<{url?: string; fileName?: string} | null> => {
  const client = context.getClient({apiVersion: API_VERSION})
  const ids = [docId, toPublishedId(docId)].filter(Boolean)
  return client.fetch(
    '*[_id in $ids][0]{ "url": file.asset->url, "fileName": file.asset->originalFilename }',
    {ids},
  )
}

const patchDownloadDocument = async (
  context: DocumentActionsContext,
  props: DocumentActionProps,
  fields: Record<string, unknown>,
): Promise<void> => {
  const client = context.getClient({apiVersion: API_VERSION})
  const now = new Date().toISOString()
  const payload = {...fields, lastUpdated: now}
  const tx = client.transaction()
  let hasMutations = false

  if (props.draft?._id) {
    tx.patch(props.draft._id, (patch) => patch.set(payload))
    hasMutations = true
  }
  if (props.published?._id) {
    tx.patch(props.published._id, (patch) => patch.set(payload))
    hasMutations = true
  }

  if (!hasMutations) return

  await tx.commit({autoGenerateArrayKeys: true})
}

const createDownloadFileAction =
  (context: DocumentActionsContext): DocumentActionComponent =>
  (props) => {
    if (!isDownloadDocument(props)) return null
    const doc = getActiveDoc(props)
    if (!doc?._id || !doc.file?.asset?._ref) return null

    return {
      label: 'Download File',
      icon: DownloadIcon,
      tone: 'primary',
      onHandle: async () => {
        const info = await fetchFileMeta(context, doc._id!)
        if (info?.url) {
          window.open(info.url, '_blank', 'noopener,noreferrer')
        } else {
          window.alert('No file to download yet. Upload a file first.')
        }
        props.onComplete()
      },
    }
  }

const createCopyUrlAction =
  (context: DocumentActionsContext): DocumentActionComponent =>
  (props) => {
    if (!isDownloadDocument(props) || !props.published?._id) return null
    const doc = props.published as DownloadDoc
    if (!doc.file?.asset?._ref) return null

    return {
      label: 'Copy Public URL',
      icon: LinkIcon,
      onHandle: async () => {
        const info = await fetchFileMeta(context, doc._id!)
        if (!info?.url) {
          window.alert('No published file URL yet. Publish the document first.')
          props.onComplete()
          return
        }
        try {
          await navigator.clipboard.writeText(info.url)
          window.alert('Public URL copied to clipboard.')
        } catch (error) {
          console.error('clipboard write failed', error)
          window.prompt('Copy this URL', info.url)
        }
        props.onComplete()
      },
    }
  }

const createMarkAsTemplateAction =
  (context: DocumentActionsContext): DocumentActionComponent =>
  (props) => {
    if (!isDownloadDocument(props)) return null
    const doc = getActiveDoc(props)
    if (!doc || doc.documentType === 'template') return null

    return {
      label: 'Mark as Template',
      icon: SparkleIcon,
      onHandle: async () => {
        await patchDownloadDocument(context, props, {
          documentType: 'template',
          isTemplate: true,
          category: doc.category ?? 'templates',
        })
        props.onComplete()
      },
    }
  }

const createArchiveAction =
  (context: DocumentActionsContext): DocumentActionComponent =>
  (props) => {
    if (!isDownloadDocument(props)) return null
    const doc = getActiveDoc(props)
    if (!doc?._id) return null
    const isArchived = doc.isArchived === true

    return {
      label: isArchived ? 'Restore Document' : 'Archive Document',
      icon: isArchived ? RestoreIcon : ArchiveIcon,
      tone: isArchived ? 'positive' : 'critical',
      onHandle: async () => {
        await patchDownloadDocument(context, props, {
          isArchived: !isArchived,
          archivedAt: isArchived ? null : new Date().toISOString(),
        })
        props.onComplete()
      },
    }
  }

const createDuplicateTemplateAction =
  (context: DocumentActionsContext): DocumentActionComponent =>
  (props) => {
    if (!isDownloadDocument(props)) return null
    const doc = getActiveDoc(props)
    if (!doc || (doc.documentType !== 'template' && !doc.isTemplate)) return null

    return {
      label: 'Duplicate Template',
      icon: CopyIcon,
      onHandle: async () => {
        const client = context.getClient({apiVersion: API_VERSION})
        const now = new Date().toISOString()
        const title = doc.title ? `${doc.title} - Copy` : 'Template Copy'

        const newDoc = {
          _type: 'downloadResource',
          title,
          description: doc.description,
          documentType: doc.documentType ?? 'template',
          category: doc.category ?? 'templates',
          accessLevel: doc.accessLevel ?? 'internal',
          tags: doc.tags,
          relatedDocuments: doc.relatedDocuments,
          version: doc.version,
          isTemplate: true,
          lastUpdated: now,
        }

        try {
          const created = await client.create(newDoc, {autoGenerateArrayKeys: true})
          openDocumentIntent(created._id)
        } catch (error) {
          console.error('Template duplication failed', error)
          window.alert('Unable to duplicate the template. Please try again.')
        } finally {
          props.onComplete()
        }
      },
    }
  }

const withLastUpdatedPublish = (ActionComponent: DocumentActionComponent): DocumentActionComponent => {
  const Wrapped: DocumentActionComponent = (props) => {
    const operations = useDocumentOperation(props.id, props.type)
    const original = ActionComponent(props)
    if (!original || !isDownloadDocument(props)) return original
    const actionName =
      (original as any)?.action || (ActionComponent as any)?.action || original?.label
    if (actionName !== 'publish' && actionName !== 'Publish') return original

    const {patch} = operations
    return {
      ...original,
      onHandle: async () => {
        patch.execute([{set: {lastUpdated: new Date().toISOString()}}])
        const result = original.onHandle?.()
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          await result
        }
      },
    }
  }

  return Object.assign(Wrapped, ActionComponent)
}

export const resolveDownloadDocumentActions = (
  prev: DocumentActionComponent[],
  context: DocumentActionsContext,
): DocumentActionComponent[] => {
  if (context.schemaType !== 'downloadResource') return prev
  const tagged = prev as DocumentActionComponent[] & {[DOWNLOAD_ACTIONS_FLAG]?: boolean}
  if (tagged[DOWNLOAD_ACTIONS_FLAG]) return prev

  const publishWrapped = prev.map((action) => (action ? withLastUpdatedPublish(action) : action))

  const downloadActions = [
    createDownloadFileAction(context),
    createCopyUrlAction(context),
    createMarkAsTemplateAction(context),
    createArchiveAction(context),
    createDuplicateTemplateAction(context),
  ]

  const next: DocumentActionComponent[] & {[DOWNLOAD_ACTIONS_FLAG]?: boolean} = [
    ...publishWrapped,
    ...downloadActions,
  ]
  Object.defineProperty(next, DOWNLOAD_ACTIONS_FLAG, {value: true})

  return next
}
