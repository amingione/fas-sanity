import {useCallback, useState} from 'react'
import {DocumentActionComponent, useDocumentOperation} from 'sanity'
import {PublishIcon} from '@sanity/icons'

export const BulkPublishAction: DocumentActionComponent = (props) => {
  const {publish} = useDocumentOperation(props.id, props.type)
  const [isPublishing, setIsPublishing] = useState(false)

  const handlePublish = useCallback(() => {
    if (publish.disabled) {
      return
    }

    setIsPublishing(true)
    publish.execute()

    setTimeout(() => {
      setIsPublishing(false)
      props.onComplete()
    }, 1000)
  }, [publish, props])

  return {
    label: isPublishing ? 'Publishing...' : 'Publish',
    icon: PublishIcon,
    disabled: publish.disabled || isPublishing,
    onHandle: handlePublish,
  }
}

export default BulkPublishAction
