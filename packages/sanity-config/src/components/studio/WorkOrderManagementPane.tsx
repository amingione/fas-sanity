import {useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import type {DocumentStub} from '../../types/sanity'
import {useToast, Box, Button, Card, Flex, Grid, Heading, Select, Spinner, Stack, Text} from '@sanity/ui'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'

const API_VERSION = '2024-10-01'
const STATUS_OPTIONS = [
  {value: 'not_started', label: 'Not started'},
  {value: 'in_progress', label: 'In progress'},
  {value: 'waiting_parts', label: 'Waiting for parts'},
  {value: 'waiting_approval', label: 'Waiting for approval'},
  {value: 'completed', label: 'Completed'},
]

type WorkOrder = {
  _id: string
  workOrderNumber?: string
  status?: string
  bay?: string
  customerName?: string
  serviceTitle?: string
  appointmentNumber?: string
}

type Appointment = {
  _id: string
  appointmentNumber?: string
  scheduledDate?: string
  customerId?: string
  serviceId?: string
  vehicleId?: string
  bay?: string
  customerName?: string
  serviceTitle?: string
}

type QueryResult = {
  workOrders: WorkOrder[]
  appointments: Appointment[]
}

const formatAppointmentSummary = (appt: Appointment) => {
  const when = appt.scheduledDate
    ? new Date(appt.scheduledDate).toLocaleString([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})
    : 'TBD'
  return `${appt.appointmentNumber ?? 'Appointment'} • ${when}`
}

export default function WorkOrderManagementPane() {
  const client = useClient({apiVersion: API_VERSION})
  const toast = useToast()
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [creatingId, setCreatingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await client.fetch<QueryResult>(
        `{
          "workOrders": *[_type == "workOrder"] | order(dateTime(_updatedAt) desc)[0...120]{
            _id,
            workOrderNumber,
            status,
            bay,
            "customerName": coalesce(customer->firstName + ' ' + customer->lastName, customer->name),
            "serviceTitle": service->title,
            "appointmentNumber": appointment->appointmentNumber
          },
          "appointments": *[_type == "appointment" && !defined(workOrder)] | order(dateTime(scheduledDate) asc)[0...60]{
            _id,
            appointmentNumber,
            scheduledDate,
            bay,
            "customerId": customer->_id,
            "vehicleId": vehicle->_id,
            "serviceId": service->_id,
            "customerName": coalesce(customer->firstName + ' ' + customer->lastName, customer->name),
            "serviceTitle": service->title
          }
        }`,
      )
      setWorkOrders(result?.workOrders ?? [])
      setAppointments(result?.appointments ?? [])
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    loadData()
  }, [loadData])

  const grouped = useMemo(() => {
    return STATUS_OPTIONS.map((option) => ({
      status: option.value,
      label: option.label,
      items: workOrders.filter((wo) => wo.status === option.value),
    }))
  }, [workOrders])

  const handleStatusChange = async (id: string, status: string) => {
    setUpdatingId(id)
    try {
      await client.patch(id).set({status}).commit()
      toast.push({status: 'success', title: 'Status updated'})
      await loadData()
    } catch (error) {
      console.error('status update failed', error)
      toast.push({status: 'error', title: 'Unable to update status'})
    } finally {
      setUpdatingId(null)
    }
  }

  const handleBayChange = async (id: string, bay: string) => {
    setUpdatingId(id)
    try {
      await client.patch(id).set({bay: bay || null}).commit()
      toast.push({status: 'success', title: 'Bay updated'})
      await loadData()
    } catch (error) {
      console.error('bay update failed', error)
      toast.push({status: 'error', title: 'Unable to update bay'})
    } finally {
      setUpdatingId(null)
    }
  }

  const createFromAppointment = async (appointment: Appointment) => {
    if (!appointment.customerId || !appointment.serviceId) {
      toast.push({
        status: 'warning',
        title: 'Appointment missing customer or service',
      })
      return
    }
    setCreatingId(appointment._id)
    try {
      const workOrderNumber = await generateReferenceCode(client, {
        prefix: 'WO-',
        typeName: 'workOrder',
        fieldName: 'workOrderNumber',
      })
      const payload: DocumentStub<Record<string, any>> = {
        _type: 'workOrder',
        workOrderNumber,
        status: 'not_started',
        appointment: {_type: 'reference', _ref: appointment._id},
        customer: {_type: 'reference', _ref: appointment.customerId},
        service: {_type: 'reference', _ref: appointment.serviceId},
        bay: appointment.bay,
      }
      if (appointment.vehicleId) {
        payload.vehicle = {_type: 'reference', _ref: appointment.vehicleId}
      }
      const created = await client.create(payload)
      await client.patch(appointment._id).set({workOrder: {_type: 'reference', _ref: created._id}}).commit()
      toast.push({status: 'success', title: 'Work order created'})
      await loadData()
    } catch (error) {
      console.error('create work order failed', error)
      toast.push({status: 'error', title: 'Unable to create work order'})
    } finally {
      setCreatingId(null)
    }
  }

  if (loading) {
    return (
      <Flex align="center" justify="center" height="fill">
        <Spinner muted />
      </Flex>
    )
  }

  return (
    <Box padding={4}>
      <Stack space={5}>
        <Heading as="h2" size={3}>
          Work Order Management
        </Heading>

        <Grid columns={[1, 1, 2, 3]} gap={4}>
          {grouped.map((column) => (
            <Card key={column.status} padding={4} radius={3} border style={{minHeight: 200}}>
              <Stack space={3}>
                <Text weight="medium">{column.label}</Text>
                <Stack space={3}>
                  {column.items.length === 0 ? (
                    <Text size={1} muted>
                      No work orders in this stage.
                    </Text>
                  ) : (
                    column.items.map((workOrder) => (
                      <Card key={workOrder._id} padding={3} radius={2} tone="transparent" border>
                        <Stack space={2}>
                          <Text weight="medium">{workOrder.workOrderNumber}</Text>
                          <Text size={1} muted>
                            {workOrder.customerName || 'Customer'} • {workOrder.serviceTitle || 'Service'}
                          </Text>
                          {workOrder.appointmentNumber && (
                            <Text size={1}>Appointment: {workOrder.appointmentNumber}</Text>
                          )}
                          <Stack space={1}>
                            <Text size={1} muted>
                              Status
                            </Text>
                            <Select
                              value={workOrder.status}
                              disabled={updatingId === workOrder._id}
                              onChange={(event) =>
                                handleStatusChange(workOrder._id, event.currentTarget.value)
                              }
                            >
                              {STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                          </Stack>
                          <Stack space={1}>
                            <Text size={1} muted>
                              Bay
                            </Text>
                            <Select
                              value={workOrder.bay || ''}
                              disabled={updatingId === workOrder._id}
                              onChange={(event) =>
                                handleBayChange(workOrder._id, event.currentTarget.value)
                              }
                            >
                              <option value="">Unassigned</option>
                              <option value="bay1">Bay 1</option>
                              <option value="bay2">Bay 2</option>
                              <option value="bay3">Bay 3</option>
                              <option value="bay4">Bay 4</option>
                            </Select>
                          </Stack>
                        </Stack>
                      </Card>
                    ))
                  )}
                </Stack>
              </Stack>
            </Card>
          ))}
        </Grid>

        <Card padding={4} radius={3} border>
          <Stack space={3}>
            <Heading as="h3" size={2}>
              Waiting on Work Orders
            </Heading>
            {appointments.length === 0 ? (
              <Text size={1} muted>
                All appointments already have work orders.
              </Text>
            ) : (
              <Stack space={3}>
                {appointments.map((appointment) => (
                  <Flex key={appointment._id} align="center" justify="space-between" wrap="wrap" gap={3}>
                    <Stack space={1}>
                      <Text weight="medium">{formatAppointmentSummary(appointment)}</Text>
                      <Text size={1} muted>
                        {appointment.customerName || 'Customer'} • {appointment.serviceTitle || 'Service'}
                      </Text>
                    </Stack>
                    <Button
                      text="Create Work Order"
                      tone="primary"
                      loading={creatingId === appointment._id}
                      onClick={() => createFromAppointment(appointment)}
                    />
                  </Flex>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
}
