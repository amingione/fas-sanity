import React, {useMemo, useState} from 'react'
import {AddIcon, DocumentTextIcon} from '@sanity/icons'
import {Box, Button, Card, Flex, Inline, Stack, Text} from '@sanity/ui'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'

const API_VERSION = '2024-10-01'

type QuickCreatePreset = {
  id: string
  title: string
  helper: string
  documentType: 'download' | 'template' | 'reference'
  category?: 'marketing' | 'operations' | 'technical' | 'legal' | 'templates'
  accessLevel?: 'public' | 'internal' | 'admin'
}

const PRESETS: QuickCreatePreset[] = [
  {
    id: 'download',
    title: '📥 New Download',
    helper: 'Customer-facing PDFs, install guides, or ZIPs.',
    documentType: 'download',
    accessLevel: 'public',
  },
  {
    id: 'template',
    title: '📋 New Template',
    helper: 'Reusable template that teammates can duplicate.',
    documentType: 'template',
    category: 'templates',
    accessLevel: 'internal',
  },
  {
    id: 'reference',
    title: '📖 New Reference Doc',
    helper: 'Internal SOPs, reference manuals, or guides.',
    documentType: 'reference',
    accessLevel: 'internal',
  },
]

function getDefaultTitle(documentType: QuickCreatePreset['documentType']) {
  switch (documentType) {
    case 'template':
      return 'Untitled Template'
    case 'reference':
      return 'Untitled Reference Doc'
    default:
      return 'Untitled Download'
  }
}

export default function DownloadsQuickCreatePane() {
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const helpers = useMemo(
    () =>
      PRESETS.map((preset) => ({
        ...preset,
        defaultTitle: getDefaultTitle(preset.documentType),
      })),
    [],
  )

  const handleCreate = async (preset: (typeof helpers)[number]) => {
    setLoadingId(preset.id)
    try {
      const now = new Date().toISOString()
      const created = await client.create({
        _type: 'downloadResource',
        title: preset.defaultTitle,
        documentType: preset.documentType,
        category: preset.category,
        accessLevel: preset.accessLevel ?? 'internal',
        isTemplate: preset.documentType === 'template',
        lastUpdated: now,
      })
      router.navigateIntent('edit', {id: created._id, type: 'downloadResource'})
    } catch (error) {
      console.error('downloads quick create failed', error)
      window.alert('Unable to create the document. Please try again.')
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <Box padding={4}>
      <Stack space={4}>
        <Box>
          <Text size={2} weight="bold">
            Create a document
          </Text>
          <Text size={1} muted>
            Choose the document type you need. We&apos;ll prefill the document type, access level,
            and template settings for you.
          </Text>
        </Box>
        <Stack space={3}>
          {helpers.map((preset) => (
            <Card key={preset.id} padding={3} radius={3} border>
              <Flex align="center" justify="space-between" gap={4}>
                <Stack space={2} flex={1}>
                  <Inline space={2} align="center">
                    <DocumentTextIcon />
                    <Text weight="medium">{preset.title}</Text>
                  </Inline>
                  <Text size={1} muted>
                    {preset.helper}
                  </Text>
                </Stack>
                <Button
                  tone="primary"
                  mode="ghost"
                  icon={AddIcon}
                  disabled={loadingId !== null}
                  loading={loadingId === preset.id}
                  onClick={() => handleCreate(preset)}
                  text="Create"
                />
              </Flex>
            </Card>
          ))}
        </Stack>
      </Stack>
    </Box>
  )
}
