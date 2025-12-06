import React, {useState, type ComponentType} from 'react'
import {Card, Stack, Flex, Button, Text, Box} from '@sanity/ui'
import {ArrowLeftIcon, ArrowRightIcon, CheckmarkIcon} from '@sanity/icons'

interface WizardStep {
  id: string
  title: string
  component: ComponentType<WizardStepProps>
  validate?: (state: any) => string | null
}

interface WizardStepProps {
  state: any
  setState: (updater: (prev: any) => any) => void
  onNext: () => void
  onBack: () => void
  isFirstStep: boolean
  isLastStep: boolean
}

interface WizardProps {
  title: string
  initialState: any
  steps: WizardStep[]
  onFinish: (finalState: any) => Promise<void>
}

export const Wizard: React.FC<WizardProps> = ({title, initialState, steps, onFinish}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [state, setState] = useState(initialState)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const currentStep = steps[currentStepIndex]
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === steps.length - 1

  const handleNext = () => {
    setError(null)

    if (currentStep.validate) {
      const validationError = currentStep.validate(state)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    if (isLastStep) {
      setIsSubmitting(true)
      onFinish(state)
        .catch((err) => {
          setError(err.message || 'Failed to complete wizard')
        })
        .finally(() => {
          setIsSubmitting(false)
        })
    } else {
      setCurrentStepIndex((prev) => prev + 1)
    }
  }

  const handleBack = () => {
    setError(null)
    setCurrentStepIndex((prev) => Math.max(0, prev - 1))
  }

  const StepComponent = currentStep.component

  return (
    <Box padding={4}>
      <Stack space={4}>
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={3}>
            <Text size={3} weight="bold">
              {title}
            </Text>
            <Flex gap={2}>
              {steps.map((step, index) => (
                <Box
                  key={step.id}
                  style={{
                    flex: 1,
                    height: 4,
                    backgroundColor:
                      index <= currentStepIndex ? '#001F45' : '#e0e0e0',
                    borderRadius: 2,
                  }}
                />
              ))}
            </Flex>
            <Text size={1} muted>
              Step {currentStepIndex + 1} of {steps.length}: {currentStep.title}
            </Text>
          </Stack>
        </Card>

        {error && (
          <Card tone="critical" padding={3} radius={2}>
            <Text size={1}>{error}</Text>
          </Card>
        )}

        <Card padding={4} radius={2} shadow={1}>
          <StepComponent
            state={state}
            setState={setState}
            onNext={handleNext}
            onBack={handleBack}
            isFirstStep={isFirstStep}
            isLastStep={isLastStep}
          />
        </Card>

        <Flex gap={3} justify="space-between">
          <Button
            text="Back"
            icon={ArrowLeftIcon}
            mode="ghost"
            onClick={handleBack}
            disabled={isFirstStep || isSubmitting}
          />

          <Button
            text={isLastStep ? 'Finish' : 'Next'}
            icon={isLastStep ? CheckmarkIcon : ArrowRightIcon}
            tone="primary"
            onClick={handleNext}
            disabled={isSubmitting}
            loading={isSubmitting}
          />
        </Flex>
      </Stack>
    </Box>
  )
}
