import {useEffect, useMemo, useState} from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Label,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
  Switch,
} from '@sanity/ui'
import {DatabaseIcon, PlayIcon, SparklesIcon} from '@sanity/icons'
import {schemaTypes} from '../../schemaTypes'
import {SchemaScanner} from '../core/schemaScanner'
import {MappingEngine} from '../core/mappingEngine'
import {generateMappingFromCommand} from '../nlp/commandParser'
import {
  DataSourceType,
  MappingCandidate,
  MappingSuggestion,
  SchemaIndex,
  SourceField,
} from '../types'
import {stripeSourceTemplates, StripeObjectType} from '../integrations/stripe'

type Step = 0 | 1 | 2 | 3 | 4

const SOURCE_PRESETS: Record<Exclude<DataSourceType, 'stripe'>, SourceField[]> = {
  csv: [
    {name: 'row_id', type: 'string', semanticTags: ['identifier']},
    {name: 'name', type: 'string'},
    {name: 'price', type: 'number', semanticTags: ['monetary']},
    {name: 'created_at', type: 'datetime', semanticTags: ['temporal']},
  ],
  json: [
    {name: 'id', type: 'string', semanticTags: ['identifier']},
    {name: 'title', type: 'string'},
    {name: 'status', type: 'string', semanticTags: ['status']},
    {name: 'metadata', type: 'object', semanticTags: ['metadata']},
  ],
  api: [
    {name: 'uuid', type: 'string', semanticTags: ['identifier']},
    {name: 'payload', type: 'object'},
    {name: 'timestamp', type: 'datetime', semanticTags: ['temporal']},
  ],
}

const ConfidenceBadge = ({candidate}: {candidate: MappingCandidate}) => {
  const tone = candidate.status === 'high' ? 'positive' : candidate.status === 'medium' ? 'caution' : 'critical'
  return (
    <Badge tone={tone} padding={2} fontSize={1}>
      {candidate.status.toUpperCase()} · {Math.round(candidate.breakdown.total * 100)}%
    </Badge>
  )
}

const StepHeader = ({title, subtitle}: {title: string; subtitle: string}) => (
  <Stack space={2}>
    <Heading size={2}>{title}</Heading>
    <Text size={1} muted>
      {subtitle}
    </Text>
  </Stack>
)

const Stepper = ({step}: {step: Step}) => {
  const steps = ['Source', 'Schema', 'Mapping', 'Review', 'Import']
  return (
    <Flex gap={3} paddingBottom={3} wrap="wrap">
      {steps.map((label, index) => {
        const active = index === step
        const completed = index < step
        const tone = active ? 'primary' : completed ? 'positive' : 'default'
        return (
          <Badge key={label} tone={tone} padding={3} fontSize={1}>
            {index + 1}. {label}
          </Badge>
        )
      })}
    </Flex>
  )
}

const emptyMapping: Record<string, string> = {}

export function AutoMapperTool() {
  const schemaIndex: SchemaIndex = useMemo(() => new SchemaScanner(schemaTypes as any).scan(), [])
  const mappingEngine = useMemo(() => new MappingEngine(schemaIndex), [schemaIndex])
  const documentTypes = useMemo(
    () =>
      (schemaTypes as any[])
        .filter((type) => type.type === 'document')
        .map((type) => ({name: type.name, title: type.title || type.name})),
    [],
  )

  const [step, setStep] = useState<Step>(0)
  const [sourceType, setSourceType] = useState<DataSourceType>('stripe')
  const [stripeObject, setStripeObject] = useState<StripeObjectType>('product')
  const [targetDocument, setTargetDocument] = useState<string>(documentTypes[0]?.name || '')
  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([])
  const [aiSuggestions, setAiSuggestions] = useState<MappingSuggestion[] | null>(null)
  const [selectedMappings, setSelectedMappings] = useState<Record<string, string>>(emptyMapping)
  const [command, setCommand] = useState('')
  const [nlpMessage, setNlpMessage] = useState<string>()
  const [importProgress, setImportProgress] = useState(0)
  const [importState, setImportState] = useState<'idle' | 'running' | 'done'>('idle')
  const [useAi, setUseAi] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string>()
  const [aiInfo, setAiInfo] = useState<string>()
  const [aiRequestId, setAiRequestId] = useState<string>()
  const [aiModel, setAiModel] = useState<string>()
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string>()
  const [feedbackInfo, setFeedbackInfo] = useState<string>()

  const sourceFields = useMemo<SourceField[]>(() => {
    if (sourceType === 'stripe') {
      return stripeSourceTemplates[stripeObject] || []
    }
    return SOURCE_PRESETS[sourceType] || []
  }, [sourceType, stripeObject])

  useEffect(() => {
    const next = mappingEngine.suggestMappings(sourceFields, {
      targetDocument,
      limit: 12,
    })
    setSuggestions(next)
    setAiSuggestions(null)
    setAiError(undefined)
    setAiInfo(undefined)
  }, [mappingEngine, sourceFields, targetDocument])

  useEffect(() => {
    // Populate defaults without clobbering user selections.
    setSelectedMappings((prev) => {
      const next = {...prev}
      const activeSuggestions = useAi && aiSuggestions ? aiSuggestions : suggestions
      activeSuggestions.forEach((entry) => {
        if (next[entry.source.name]) return
        const top =
          entry.suggestions.find((s) => s.status === 'high') ||
          entry.suggestions.find((s) => s.status === 'medium') ||
          entry.suggestions[0]
        if (top) next[entry.source.name] = top.target.path
      })
      return next
    })
  }, [suggestions, aiSuggestions, useAi])

  useEffect(() => {
    if (step !== 4) {
      setImportState('idle')
      setImportProgress(0)
      return
    }

    setImportState('running')
    const interval = setInterval(() => {
      setImportProgress((value) => {
        const next = Math.min(100, value + Math.random() * 18)
        if (next >= 100) {
          clearInterval(interval)
          setImportState('done')
        }
        return next
      })
    }, 400)

    return () => clearInterval(interval)
  }, [step])

  const handleMappingChange = (sourceName: string, targetPath: string) => {
    setSelectedMappings((prev) => ({...prev, [sourceName]: targetPath}))
  }

  const applyCommand = () => {
    const result = generateMappingFromCommand(command, {
      sourceFields,
      engine: mappingEngine,
      targetDocument,
      schemaIndex,
    })

    if (!result?.suggestion) {
      setNlpMessage(result?.message || 'Could not understand that command')
      return
    }

    const top = result.suggestion.suggestions[0]
    if (top) {
      handleMappingChange(result.suggestion.source.name, top.target.path)
      setNlpMessage(result.message || 'Applied mapping suggestion')
    } else {
      setNlpMessage('No matches available for that command')
    }
  }

  const fetchAiSuggestions = async () => {
    setAiLoading(true)
    setAiError(undefined)
    setAiInfo(undefined)
    setFeedbackError(undefined)
    setFeedbackInfo(undefined)
    try {
      const targetFields = schemaIndex.getDocumentFields(targetDocument).map((field) => ({
        name: field.name,
        path: field.path,
        type: field.type,
        documentType: field.documentType,
        semanticTags: field.metadata.semanticTags,
        depth: field.metadata.depth,
      }))

      const endpoint =
        process.env.SANITY_STUDIO_AI_SUGGEST_ENDPOINT ||
        process.env.VITE_SANITY_STUDIO_AI_SUGGEST_ENDPOINT ||
        '/.netlify/functions/ai-suggest-mappings'

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sourceFields,
          targetFields,
          targetDocument,
          existingMappings: selectedMappings,
        }),
      })

      if (!response.ok) {
        throw new Error(`AI request failed: ${response.status}`)
      }
      const payload = await response.json()
      if (Array.isArray(payload?.suggestions)) {
        setAiSuggestions(payload.suggestions)
        setAiInfo(payload?.meta?.message || 'Applied AI-assisted suggestions')
        setAiRequestId(payload?.meta?.requestId)
        setAiModel(payload?.meta?.model)
        setSelectedMappings((prev) => {
          const next = {...prev}
          payload.suggestions.forEach((entry: MappingSuggestion) => {
            const top = entry.suggestions?.[0]
            if (top) next[entry.source.name] = top.target.path
          })
          return next
        })
      } else {
        throw new Error('AI response missing suggestions')
      }
    } catch (err: any) {
      setAiError(err?.message || 'Failed to fetch AI suggestions')
      setAiSuggestions(null)
    } finally {
      setAiLoading(false)
    }
  }

  const activeSuggestions = useAi && aiSuggestions ? aiSuggestions : suggestions

  const sendFeedback = async () => {
    if (!useAi || !aiSuggestions || !aiRequestId) return
    setFeedbackSending(true)
    setFeedbackError(undefined)
    setFeedbackInfo(undefined)

    const feedback = aiSuggestions
      .map((entry) => {
        const targetPath = selectedMappings[entry.source.name]
        if (!targetPath) return null
        const match = entry.suggestions.find((item) => item.target.path === targetPath)
        if (!match) return null
        return {
          source: entry.source.name,
          target: targetPath,
          accepted: true,
          confidence: match.breakdown.total,
          strategy: 'ai',
          requestId: aiRequestId,
          model: aiModel,
          targetDocument,
          rationale: match.rationale,
        }
      })
      .filter(Boolean)

    if (!feedback.length) {
      setFeedbackSending(false)
      return
    }

    try {
      const endpoint =
        process.env.SANITY_STUDIO_AI_SUGGEST_ENDPOINT ||
        process.env.VITE_SANITY_STUDIO_AI_SUGGEST_ENDPOINT ||
        '/.netlify/functions/ai-suggest-mappings'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          feedback,
          requestId: aiRequestId,
          strategy: 'ai',
          model: aiModel,
        }),
      })
      if (!res.ok) {
        throw new Error(`Feedback failed: ${res.status}`)
      }
      setFeedbackInfo('Feedback recorded for learning')
    } catch (err: any) {
      setFeedbackError(err?.message || 'Failed to send feedback')
    } finally {
      setFeedbackSending(false)
    }
  }

  const renderSourceStep = () => (
    <Card padding={4} radius={3} shadow={1}>
      <StepHeader title="Select source" subtitle="Choose the data source you want to map into Sanity" />
      <Grid columns={[1, 2]} gap={4} marginTop={4}>
        <Stack space={3}>
          <Label size={1}>Source type</Label>
          <Select
            value={sourceType}
            onChange={(event) => setSourceType(event.currentTarget.value as DataSourceType)}
          >
            <option value="stripe">Stripe</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="api">API</option>
          </Select>
        </Stack>
        {sourceType === 'stripe' && (
          <Stack space={3}>
            <Label size={1}>Stripe object</Label>
            <Select
              value={stripeObject}
              onChange={(event) => setStripeObject(event.currentTarget.value as StripeObjectType)}
            >
              <option value="product">Products</option>
              <option value="price">Prices</option>
              <option value="customer">Customers</option>
              <option value="subscription">Subscriptions</option>
            </Select>
          </Stack>
        )}
      </Grid>
      <Box marginTop={4}>
        <Text size={1} muted>
          Templates include pre-tagged fields for faster matching. You can refine mappings in the next steps.
        </Text>
      </Box>
    </Card>
  )

  const renderSchemaStep = () => (
    <Card padding={4} radius={3} shadow={1}>
      <StepHeader title="Select schema" subtitle="Pick the Sanity document type you want to map into" />
      <Stack space={3} marginTop={4}>
        <Label size={1}>Target schema</Label>
        <Select
          value={targetDocument}
          onChange={(event) => setTargetDocument(event.currentTarget.value)}
        >
          {documentTypes.map((doc) => (
            <option key={doc.name} value={doc.name}>
              {doc.title}
            </option>
          ))}
        </Select>
      </Stack>
      <Box marginTop={4}>
        <Text size={1} muted>
          Schema scanner indexed {schemaIndex.fields.length} fields across {schemaIndex.snapshot().documents.length}{' '}
          document types.
        </Text>
      </Box>
    </Card>
  )

  const renderMappingStep = () => (
    <Stack space={4}>
      <Card padding={4} radius={3} shadow={1}>
        <StepHeader
          title="Field mapping"
          subtitle="Review AI suggestions, adjust as needed, or use a command like “Map price to rate”."
        />
        <Flex justify="space-between" align="center" marginTop={3} gap={3} wrap="wrap">
          <Flex gap={2} align="center">
            <Switch id="use-ai" checked={useAi} onChange={(event) => setUseAi(event.currentTarget.checked)} />
            <Label htmlFor="use-ai" size={1}>
              Enable AI suggestions
            </Label>
          </Flex>
          <Flex gap={2} align="center">
            <Button
              text={aiLoading ? 'Fetching AI...' : 'Fetch AI suggestions'}
              tone="primary"
              disabled={!useAi || aiLoading}
              icon={SparklesIcon}
              onClick={fetchAiSuggestions}
            />
            {aiInfo && (
              <Badge tone="positive" padding={2} fontSize={1}>
                {aiInfo}
              </Badge>
            )}
            {aiError && (
              <Badge tone="critical" padding={2} fontSize={1}>
                {aiError}
              </Badge>
            )}
            {feedbackInfo && (
              <Badge tone="positive" padding={2} fontSize={1}>
                {feedbackInfo}
              </Badge>
            )}
            {feedbackError && (
              <Badge tone="critical" padding={2} fontSize={1}>
                {feedbackError}
              </Badge>
            )}
          </Flex>
        </Flex>
        <Stack space={3} marginTop={4}>
          <Label size={1}>Command input</Label>
          <Flex gap={3} align="center">
            <TextInput
              value={command}
              onChange={(event) => setCommand(event.currentTarget.value)}
              placeholder='e.g. "Map unit_amount to price.rate"'
              flex={1}
            />
            <Button text="Apply" tone="primary" icon={SparklesIcon} onClick={applyCommand} />
          </Flex>
          {nlpMessage && (
            <Text size={1} muted>
              {nlpMessage}
            </Text>
          )}
        </Stack>
      </Card>

      <Card padding={4} radius={3} shadow={1}>
        <Stack space={3}>
          <Flex justify="space-between" align="center">
            <StepHeader title="Suggestions" subtitle="Confidence-weighted matches per source field" />
            <Badge tone="default" padding={2} fontSize={1}>
              {activeSuggestions.length} source fields
            </Badge>
          </Flex>

          <Stack space={3}>
            {activeSuggestions.map((entry) => {
              const targetPath = selectedMappings[entry.source.name] || ''
              return (
                <Card key={entry.source.name} padding={3} radius={2} shadow={1} tone="transparent">
                  <Flex justify="space-between" align="center" gap={3} wrap="wrap">
                    <Stack space={2} style={{minWidth: 200}}>
                      <Text weight="semibold">{entry.source.name}</Text>
                      <Text size={1} muted>
                        Type: {entry.source.type}
                      </Text>
                    </Stack>
                    <Flex gap={3} align="center" style={{flex: 1}}>
                      <Select
                        value={targetPath}
                        onChange={(event) => handleMappingChange(entry.source.name, event.currentTarget.value)}
                        style={{flex: 1}}
                      >
                        <option value="">Unmapped</option>
                        {entry.suggestions.map((candidate) => (
                          <option key={candidate.target.path} value={candidate.target.path}>
                            {candidate.target.path} ({candidate.target.type})
                          </option>
                        ))}
                      </Select>
                      {targetPath ? (
                        <ConfidenceBadge
                          candidate={
                            entry.suggestions.find((item) => item.target.path === targetPath) ||
                            entry.suggestions[0]
                          }
                        />
                      ) : (
                        <Badge tone="caution" padding={2} fontSize={1}>
                          Pending
                        </Badge>
                      )}
                    </Flex>
                  </Flex>
                </Card>
              )
            })}
          </Stack>
        </Stack>
      </Card>
    </Stack>
  )

  const renderReviewStep = () => {
    const mappedCount = Object.values(selectedMappings).filter(Boolean).length
    const unmapped = activeSuggestions.length - mappedCount
    return (
      <Card padding={4} radius={3} shadow={1}>
        <StepHeader title="Review mappings" subtitle="Confirm matches and finalize the import plan" />
        <Stack space={3} marginTop={4}>
          <Flex gap={3} wrap="wrap">
            <Badge tone="positive" padding={2} fontSize={1}>
              {mappedCount} mapped
            </Badge>
            <Badge tone={unmapped > 0 ? 'caution' : 'positive'} padding={2} fontSize={1}>
              {unmapped} unmapped
            </Badge>
          </Flex>
          <Stack space={2}>
            {activeSuggestions.map((entry) => {
              const targetPath = selectedMappings[entry.source.name]
              return (
                <Flex key={entry.source.name} justify="space-between" align="center">
                  <Text weight="semibold">{entry.source.name}</Text>
                  {targetPath ? (
                    <Text size={1} muted>
                      ➜ {targetPath}
                    </Text>
                  ) : (
                    <Badge tone="caution" padding={2} fontSize={1}>
                      Pending
                    </Badge>
                  )}
                </Flex>
              )
            })}
          </Stack>
        </Stack>
      </Card>
    )
  }

  const renderImportStep = () => (
    <Card padding={4} radius={3} shadow={1}>
      <StepHeader title="Import" subtitle="Simulated import with progress feedback" />
      <Flex align="center" gap={3} marginTop={4}>
        {importState === 'running' && <Spinner muted />}
        <Text>
          {importState === 'done'
            ? 'Import complete'
            : `Preparing import... ${Math.round(importProgress)}%`}
        </Text>
      </Flex>
      <Box marginTop={3} style={{height: 8, background: '#e4e6ea', borderRadius: 4}}>
        <Box
          style={{
            width: `${importProgress}%`,
            background: importState === 'done' ? '#16a34a' : '#2563eb',
            height: '100%',
            borderRadius: 4,
            transition: 'width 200ms ease',
          }}
        />
      </Box>
    </Card>
  )

  const renderStep = () => {
    switch (step) {
      case 0:
        return renderSourceStep()
      case 1:
        return renderSchemaStep()
      case 2:
        return renderMappingStep()
      case 3:
        return renderReviewStep()
      case 4:
        return renderImportStep()
      default:
        return null
    }
  }

  const canGoNext =
    (step === 0 && sourceType !== undefined) ||
    (step === 1 && Boolean(targetDocument)) ||
    (step === 2 && activeSuggestions.length > 0) ||
    step >= 3

  const primaryLabel = step === 4 ? 'Done' : step === 3 ? 'Start Import' : 'Next'

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <DatabaseIcon />
        <Heading size={3}>Auto-Mapper</Heading>
      </Flex>

      <Stepper step={step} />

      {renderStep()}

      <Flex justify="space-between" marginTop={2}>
        <Button text="Back" disabled={step === 0} mode="ghost" onClick={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))} />
        <Flex gap={2}>
          <Button
            text="Cancel"
            mode="ghost"
            onClick={() => {
              setStep(0)
              setSelectedMappings(emptyMapping)
              setImportState('idle')
              setImportProgress(0)
            }}
          />
          <Button
            tone="primary"
            icon={step === 3 ? PlayIcon : SparklesIcon}
            text={primaryLabel}
            disabled={!canGoNext || (step === 3 && feedbackSending)}
            onClick={async () => {
              if (step === 4) return
              if (step === 3) {
                await sendFeedback()
              }
              const nextStep = (step + 1) as Step
              setStep(nextStep)
            }}
          />
        </Flex>
      </Flex>
    </Stack>
  )
}
