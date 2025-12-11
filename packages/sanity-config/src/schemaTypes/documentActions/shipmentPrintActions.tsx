import {useState} from 'react'
import {useToast} from '@sanity/ui'
import {DocumentsIcon, DocumentPdfIcon} from '@sanity/icons'
import {type DocumentActionComponent} from 'sanity'

type ShipmentDoc = {
  _id?: string
  labelUrl?: string | null
  postageLabel?: {
    labelPdfUrl?: string | null
    labelUrl?: string | null
  } | null
  order?: {
    _ref?: string
  } | null
}

const getShipmentLabelUrl = (doc?: ShipmentDoc | null) =>
  doc?.postageLabel?.labelPdfUrl ||
  doc?.postageLabel?.labelUrl ||
  doc?.labelUrl ||
  undefined

const openWindowAndPrint = (url: string) => {
  const printWindow = window.open(url, '_blank', 'noopener')
  if (!printWindow) {
    throw new Error('Popup blocked. Allow popups to print the label.')
  }

  try {
    const triggerPrint = () => {
      try {
        printWindow.focus()
        printWindow.print()
      } catch (err) {
        console.warn('Unable to trigger print dialog automatically', err)
      }
    }

    if ('addEventListener' in printWindow) {
      printWindow.addEventListener('load', triggerPrint, {once: true})
    } else {
      // Fallback for browsers without addEventListener on window instances
      ;(printWindow as Window & {onload?: () => void}).onload = triggerPrint
    }
  } catch (err) {
    console.warn('Unable to attach print handler', err)
  }
}

export const printShipmentLabelAction: DocumentActionComponent = (props) => {
  const {type, draft, published} = props
  const [isPrinting, setIsPrinting] = useState(false)

  if (type !== 'shipment') return null

  const doc = (draft || published) as ShipmentDoc | null
  const labelUrl = getShipmentLabelUrl(doc)

  return {
    label: 'Print Label',
    icon: DocumentPdfIcon,
    disabled: !labelUrl || isPrinting,
    onHandle: () => {
      if (!labelUrl) return
      setIsPrinting(true)
      try {
        openWindowAndPrint(labelUrl)
      } catch (error) {
        console.error('Unable to open label for printing', error)
        alert(
          'Unable to open the shipping label. Please allow popups or download the PDF manually.',
        )
      } finally {
        setIsPrinting(false)
      }
    },
  }
}

export const printMergedShipmentDocumentsAction: DocumentActionComponent = (props) => {
  const {type, draft, published} = props
  const toast = useToast()
  const [isMerging, setIsMerging] = useState(false)

  if (type !== 'shipment') return null

  const doc = (draft || published) as ShipmentDoc | null
  const labelUrl = getShipmentLabelUrl(doc)
  const orderId = doc?.order?._ref

  return {
    label: 'Print Label + Packing Slip',
    icon: DocumentsIcon,
    disabled: !labelUrl || !orderId || isMerging,
    tone: 'primary',
    onHandle: async () => {
      if (!labelUrl || !orderId) return

      setIsMerging(true)
      try {
        const response = await fetch('/api/merge-label-packing-slip', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            labelUrl,
            orderId,
            shipmentId: doc?._id,
          }),
        })

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(text || 'Failed to merge PDFs')
        }

        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)

        openWindowAndPrint(blobUrl)

        // Release the object URL after the new window starts loading
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)

        toast.push({
          status: 'success',
          title: 'Merged PDF ready',
          description: 'Packing slip merged with label.',
        })
      } catch (error) {
        console.error('Failed to merge shipment PDFs', error)
        toast.push({
          status: 'error',
          title: 'Unable to merge PDFs',
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        setIsMerging(false)
      }
    },
  }
}
