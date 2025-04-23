import React, { useEffect, useState } from 'react';
import { useClient } from 'sanity';
import { useToast } from '@sanity/ui';
import { Button, Card, Checkbox, Stack, Text } from '@sanity/ui';

interface Order {
  _id: string;
  customerEmail: string;
  totalAmount: number;
  status: string;
}

export default function BulkFulfillmentConsole() {
  const client = useClient({ apiVersion: '2023-10-01' });
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchOrders = async () => {
      const data = await client.fetch(
        `*[_type == "order" && status != "fulfilled"]{_id, customerEmail, totalAmount, status}`
      );
      setOrders(data);
    };
    fetchOrders();
  }, [client]);

  const toggleSelection = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const fulfillSelected = async () => {
    if (!selected.size) return;

    setLoading(true);

    for (const id of selected) {
      try {
        const res = await fetch('/api/fulfill-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: id })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error || 'Unknown error');
      } catch (err: any) {
        toast.push({
          status: 'error',
          title: 'Error fulfilling order',
          description: err.message
        });
      }
    }

    toast.push({
      status: 'success',
      title: 'Orders fulfilled!',
      description: `${selected.size} orders processed.`
    });

    setSelected(new Set());
    setLoading(false);
  };

  const cancelSelected = async () => {
    if (!selected.size) return;

    setLoading(true);

    for (const id of selected) {
      try {
        await client.patch(id).set({ status: 'cancelled' }).commit();
      } catch (err: any) {
        toast.push({
          status: 'error',
          title: 'Error cancelling order',
          description: err.message
        });
      }
    }

    toast.push({
      status: 'warning',
      title: 'Orders cancelled',
      description: `${selected.size} orders were cancelled.`
    });

    setSelected(new Set());
    setLoading(false);
  };

  return (
    <Card padding={4}>
      <Stack space={4}>
        <Text size={2} weight="bold">
          Bulk Fulfillment Console
        </Text>

        {orders.map((order) => (
          <Card key={order._id} padding={3} shadow={1} radius={2} tone="default">
            <Stack space={3}>
              <Checkbox
                checked={selected.has(order._id)}
                onChange={() => toggleSelection(order._id)}
              />
              <Text>{order.customerEmail}</Text>
              <Text muted>${order.totalAmount.toFixed(2)}</Text>
            </Stack>
          </Card>
        ))}

        <Button
          text={`Fulfill ${selected.size} Selected Order(s)`}
          tone="positive"
          loading={loading}
          disabled={selected.size === 0}
          onClick={fulfillSelected}
        />
        <Button
          text={`Cancel ${selected.size} Selected Order(s)`}
          tone="critical"
          disabled={selected.size === 0}
          loading={loading}
          onClick={cancelSelected}
        />
      </Stack>
    </Card>
  );
}
