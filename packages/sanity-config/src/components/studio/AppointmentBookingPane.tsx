import {useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Select,
  Spinner,
  Stack,
  Text,
  TextArea,
  TextInput,
  useToast,
} from '@sanity/ui'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'

const API_VERSION = '2024-10-01'

type CustomerOption = {_id: string; label: string}
type VehicleOption = {_id: string; label: string; customerId: string}
type ServiceOption = {_id: string; label: string; serviceType?: string; basePrice?: number}

type BookingFormState = {
  customerId: string
  vehicleId: string
  serviceId: string
  scheduledDate: string
  estimatedDuration: string
  status: string
  bay: string
  notes: string
  customerNotes: string
}

const defaultFormState: BookingFormState = {
  customerId: '',
  vehicleId: '',
  serviceId: '',
  scheduledDate: '',
  estimatedDuration: '2',
  status: 'needs_confirmation',
  bay: '',
  notes: '',
  customerNotes: '',
}

export default function AppointmentBookingPane() {
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<BookingFormState>(defaultFormState)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [services, setServices] = useState<ServiceOption[]>([])

  const fetchOptions = useCallback(async () => {
    setLoading(true)
    try {
      const result = await client.fetch<{
        customers: Array<{_id: string; firstName?: string; lastName?: string; email?: string}>
        vehicles: Array<{
          _id: string
          year?: number
          make?: string
          model?: string
          customerId?: string
        }>
        services: Array<{_id: string; title?: string; serviceType?: string; basePrice?: number}>
      }>(
        `{
          "customers": *[_type == "customer"] | order(name asc)[0...200]{
            _id,
            firstName,
            lastName,
            email
          },
          "vehicles": *[_type == "vehicle"]{
            _id,
            year,
            make,
            model,
            "customerId": customer->_id
          },
          "services": *[_type == "service"] | order(title asc){
            _id,
            title,
            serviceType,
            basePrice
          }
        }`,
      )
      setCustomers(
        (result?.customers ?? []).map((c) => ({
          _id: c._id,
          label: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Unnamed',
        })),
      )
      setVehicles(
        (result?.vehicles ?? []).map((v) => ({
          _id: v._id,
          label: [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle',
          customerId: v.customerId ?? '',
        })),
      )
      setServices(
        (result?.services ?? []).map((s) => ({
          _id: s._id,
          label: s.title || 'Service',
          serviceType: s.serviceType,
          basePrice: s.basePrice,
        })),
      )
    } catch (error) {
      console.error('appointment booking load failed', error)
      toast.push({
        status: 'error',
        title: 'Unable to load booking data',
        description: 'Reload the pane to try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [client, toast])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

  const filteredVehicles = useMemo(() => {
    if (!form.customerId) return vehicles
    return vehicles.filter((vehicle) => vehicle.customerId === form.customerId)
  }, [vehicles, form.customerId])

  const handleChange = (field: keyof BookingFormState, value: string) => {
    setForm((prev) => {
      const next = {...prev, [field]: value}
      if (field === 'customerId' && prev.vehicleId) {
        const belongs = vehicles.some((vehicle) => vehicle._id === prev.vehicleId && vehicle.customerId === value)
        if (!belongs) {
          next.vehicleId = ''
        }
      }
      return next
    })
  }

  const handleSubmit = async () => {
    if (!form.customerId || !form.serviceId || !form.scheduledDate) {
      toast.push({
        status: 'warning',
        title: 'Customer, service, and date are required',
      })
      return
    }
    setSubmitting(true)
    try {
      const appointmentNumber = await generateReferenceCode(client, {
        prefix: 'APT-',
        typeName: 'appointment',
        fieldName: 'appointmentNumber',
      })
      const doc: Record<string, any> = {
        _type: 'appointment',
        appointmentNumber,
        scheduledDate: new Date(form.scheduledDate).toISOString(),
        estimatedDuration: Number(form.estimatedDuration) || 1,
        status: form.status,
        bay: form.bay || undefined,
        notes: form.notes || undefined,
        customerNotes: form.customerNotes || undefined,
        customer: {_type: 'reference', _ref: form.customerId},
        service: {_type: 'reference', _ref: form.serviceId},
      }
      if (form.vehicleId) {
        doc.vehicle = {_type: 'reference', _ref: form.vehicleId}
      }
      const created = await client.create(doc)
      toast.push({status: 'success', title: 'Appointment booked'})
      setForm(defaultFormState)
      router.navigateIntent('edit', {id: created._id, type: 'appointment'})
    } catch (error) {
      console.error('appointment booking failed', error)
      toast.push({
        status: 'error',
        title: 'Unable to create appointment',
        description: 'Check required fields and try again.',
      })
    } finally {
      setSubmitting(false)
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
      <Stack space={4}>
        <Heading as="h2" size={3}>
          Appointment Booking
        </Heading>
        <Grid columns={[1, 1, 2]} gap={4}>
          <Card padding={4} radius={3} border>
            <Stack space={3}>
              <Heading as="h3" size={2}>
                Customer Details
              </Heading>
              <Stack space={2}>
                <Text size={1} muted>
                  Customer
                </Text>
                <Select
                  value={form.customerId}
                  onChange={(event) => handleChange('customerId', event.currentTarget.value)}
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer._id} value={customer._id}>
                      {customer.label}
                    </option>
                  ))}
                </Select>
              </Stack>
              <Stack space={2}>
                <Text size={1} muted>
                  Vehicle
                </Text>
                <Select
                  value={form.vehicleId}
                  onChange={(event) => handleChange('vehicleId', event.currentTarget.value)}
                >
                  <option value="">Select vehicle</option>
                  {filteredVehicles.map((vehicle) => (
                    <option key={vehicle._id} value={vehicle._id}>
                      {vehicle.label}
                    </option>
                  ))}
                </Select>
              </Stack>
            </Stack>
          </Card>

          <Card padding={4} radius={3} border>
            <Stack space={3}>
              <Heading as="h3" size={2}>
                Service Details
              </Heading>
              <Stack space={2}>
                <Text size={1} muted>
                  Service
                </Text>
                <Select
                  value={form.serviceId}
                  onChange={(event) => handleChange('serviceId', event.currentTarget.value)}
                >
                  <option value="">Select service</option>
                  {services.map((service) => (
                    <option key={service._id} value={service._id}>
                      {service.label}
                    </option>
                  ))}
                </Select>
              </Stack>
              <Grid columns={[1, 2]} gap={3}>
                <Stack space={2}>
                  <Text size={1} muted>
                    Date & Time
                  </Text>
                  <TextInput
                    type="datetime-local"
                    value={form.scheduledDate}
                    onChange={(event) => handleChange('scheduledDate', event.currentTarget.value)}
                  />
                </Stack>
                <Stack space={2}>
                  <Text size={1} muted>
                    Estimated Hours
                  </Text>
                  <TextInput
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={form.estimatedDuration}
                    onChange={(event) => handleChange('estimatedDuration', event.currentTarget.value)}
                  />
                </Stack>
              </Grid>
              <Grid columns={[1, 2]} gap={3}>
                <Stack space={2}>
                  <Text size={1} muted>
                    Status
                  </Text>
                  <Select
                    value={form.status}
                    onChange={(event) => handleChange('status', event.currentTarget.value)}
                  >
                    <option value="needs_confirmation">Needs Confirmation</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="confirmed">Confirmed</option>
                  </Select>
                </Stack>
                <Stack space={2}>
                  <Text size={1} muted>
                    Bay
                  </Text>
                  <Select
                    value={form.bay}
                    onChange={(event) => handleChange('bay', event.currentTarget.value)}
                  >
                    <option value="">Assign later</option>
                    <option value="bay1">Bay 1</option>
                    <option value="bay2">Bay 2</option>
                    <option value="bay3">Bay 3</option>
                    <option value="bay4">Bay 4</option>
                  </Select>
                </Stack>
              </Grid>
            </Stack>
          </Card>
        </Grid>

        <Card padding={4} radius={3} border>
          <Grid columns={[1, 2]} gap={4}>
            <Stack space={2}>
              <Text size={1} muted>
                Internal Notes
              </Text>
              <TextArea
                rows={4}
                value={form.notes}
                onChange={(event) => handleChange('notes', event.currentTarget.value)}
              />
            </Stack>
            <Stack space={2}>
              <Text size={1} muted>
                Customer Notes
              </Text>
              <TextArea
                rows={4}
                value={form.customerNotes}
                onChange={(event) => handleChange('customerNotes', event.currentTarget.value)}
              />
            </Stack>
          </Grid>
        </Card>

        <Flex justify="flex-end" gap={3}>
          <Button text="Reset" mode="bleed" onClick={() => setForm(defaultFormState)} />
          <Button
            text="Book Appointment"
            tone="primary"
            padding={4}
            loading={submitting}
            onClick={handleSubmit}
          />
        </Flex>
      </Stack>
    </Box>
  )
}
