import React, {JSX, useState} from 'react'
import {Button, Card, Code, Flex, Inline, Label, Select, Stack, Text, TextInput} from '@sanity/ui'
import {definePlugin} from 'sanity'

type SectionDraft = {
  id: string
  title: string
  schemaType: string | null
  parentId: string | null
}

type SectionNode = {
  id: string
  title: string
  schemaType: string | null
  children: SectionNode[]
}

const INDENT_STEP = 6

const escapeSingleQuotes = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

function buildTree(sections: SectionDraft[], parentId: string | null = null): SectionNode[] {
  return sections
    .filter((section) => section.parentId === parentId)
    .map((section) => ({
      id: section.id,
      title: section.title,
      schemaType: section.schemaType,
      children: buildTree(sections, section.id),
    }))
}

function renderStructure(node: SectionNode, indent: number = INDENT_STEP): string {
  const pad = ' '.repeat(indent)
  const title = escapeSingleQuotes(node.title)

  if (node.children.length > 0) {
    const childIndent = indent + INDENT_STEP
    const children = node.children.map((child) => renderStructure(child, childIndent)).join(',\n')

    return `${pad}S.listItem()
${pad}  .title('${title}')
${pad}  .child(
${pad}    S.list()
${pad}      .title('${title}')
${pad}      .items([
${children}
${pad}      ])
${pad}  )`
  }

  if (node.schemaType) {
    const schemaType = escapeSingleQuotes(node.schemaType)
    return `${pad}S.listItem()
${pad}  .title('${title}')
${pad}  .child(S.documentTypeList('${schemaType}').title('${title}'))`
  }

  return `${pad}S.divider()`
}

function renderStructureList(nodes: SectionNode[]): string {
  return nodes.map((node) => renderStructure(node, INDENT_STEP)).join(',\n')
}

function DeskStructureBuilder(): JSX.Element {
  const [sections, setSections] = useState<SectionDraft[]>([])
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [newSchemaType, setNewSchemaType] = useState('')
  const [newParentId, setNewParentId] = useState('')
  const [output, setOutput] = useState('')

  const resetInputs = () => {
    setNewSectionTitle('')
    setNewSchemaType('')
    setNewParentId('')
  }

  const addSection = () => {
    const title = newSectionTitle.trim()
    if (!title) return

    const draft: SectionDraft = {
      id: `${Date.now()}`,
      title,
      schemaType: newSchemaType.trim() ? newSchemaType.trim() : null,
      parentId: newParentId ? newParentId : null,
    }

    setSections((prev) => [...prev, draft])
    resetInputs()
  }

  const generateCode = () => {
    const tree = buildTree(sections)
    const body = renderStructureList(tree)
    const code = `export const deskStructure = (S) =>
  S.list()
    .title('Dashboard')
    .items([
${body}
    ])

export default deskStructure`

    setOutput(code)
  }

  return (
    <Card padding={4}>
      <Stack space={4}>
        <Text size={2} weight="semibold">
          Desk Structure Builder
        </Text>

        <Flex gap={3} wrap="wrap">
          <Stack space={2} style={{minWidth: 200}}>
            <Label>Title</Label>
            <TextInput
              value={newSectionTitle}
              onChange={(event) => setNewSectionTitle(event.currentTarget.value)}
              placeholder="e.g. Orders"
            />
          </Stack>

          <Stack space={2} style={{minWidth: 200}}>
            <Label>Document type (optional)</Label>
            <TextInput
              value={newSchemaType}
              onChange={(event) => setNewSchemaType(event.currentTarget.value)}
              placeholder="e.g. order"
            />
          </Stack>

          <Stack space={2} style={{minWidth: 200}}>
            <Label>Parent section (optional)</Label>
            <Select
              value={newParentId}
              onChange={(event) => setNewParentId(event.currentTarget.value)}
            >
              <option value="">Root</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </Select>
          </Stack>

          <Button
            text="Add section"
            tone="primary"
            onClick={addSection}
            style={{alignSelf: 'flex-end'}}
          />
        </Flex>

        <Card padding={4} radius={3} tone="transparent">
          <Text size={3} muted>
            Sections added:
          </Text>
          {sections.length === 0 && (
            <Text size={2} muted style={{marginTop: 12}}>
              No sections yet. Add a title to begin.
            </Text>
          )}
          <Stack space={6} marginTop={3}>
            {sections.map((section) => {
              const parent = section.parentId
                ? sections.find((candidate) => candidate.id === section.parentId)
                : null
              return (
                <Text key={section.id} size={2}>
                  {section.title}
                  {section.schemaType ? ` → ${section.schemaType}` : ''}
                  {parent ? ` (child of ${parent.title})` : ''}
                </Text>
              )
            })}
          </Stack>
        </Card>

        <Inline>
          <Button text="Generate code" tone="positive" onClick={generateCode} />
        </Inline>

        {output && (
          <Stack space={3}>
            <Text size={1} muted>
              Copy into <Code>deskStructure.ts</Code>
            </Text>
            <Card padding={3} radius={2} tone="default" border>
              <Code
                size={1}
                style={{
                  display: 'block',
                  whiteSpace: 'pre',
                  lineHeight: 1.6,
                  letterSpacing: '0.015em',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: '500px',
                }}
              >
                {output}
              </Code>
            </Card>
          </Stack>
        )}
      </Stack>
    </Card>
  )
}

export const deskStructureBuilderTool = definePlugin({
  name: 'desk-structure-builder',
  tools: [
    {
      name: 'desk-structure-builder',
      title: 'Desk Structure Builder',
      component: DeskStructureBuilder,
    },
  ],
})

export default deskStructureBuilderTool
