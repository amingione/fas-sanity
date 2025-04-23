interface ActionProps {
  id: string;
  schemaType: string;
  onComplete?: () => void;
  toast: {
    push: (options: { status: 'success' | 'error'; title: string; description: string }) => void;
  };
}

const fulfillOrderAction = (props: ActionProps) => ({
  label: '📦 Fulfill Order',
  onHandle: async () => {
    const res = await fetch('/api/fulfill-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: props.id })
    });

    const result = await res.json();
    if (result.success) {
      props.onComplete?.();
      props.toast.push({
        status: 'success',
        title: 'Order fulfilled!',
        description: 'Label created and confirmation email sent.'
      });
    } else {
      props.toast.push({
        status: 'error',
        title: 'Fulfillment Failed',
        description: result.error || 'Something went wrong.'
      });
    }
  }
});

export default function resolveDocumentActions(props: ActionProps) {
  return props.schemaType === 'order'
    ? [fulfillOrderAction(props)]
    : [];
}