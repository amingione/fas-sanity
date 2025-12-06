import {Card, Stack, Box, Text, Flex, Badge, Button, Select} from '@sanity/ui'
import {useCallback, useEffect, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {AddIcon} from '@sanity/icons'

interface Appointment {
  _id: string
  appointmentNumber: string
  scheduledDate: string
  estimatedDuration: number
  status: string
  bay: string
  customer: {
    name: string
  }
  vehicle: {
    year: number
    make: string
    model: string
  }
  service: {
    title: string
  }
  notes?: string
}

type BadgeTone = 'default' | 'primary' | 'positive' | 'caution' | 'critical'

const BAYS = ['bay1', 'bay2', 'bay3', 'bay4'] // Match schema values
const BAY_LABELS: {[key: string]: string} = {
  bay1: 'Bay 1',
  bay2: 'Bay 2',
  bay3: 'Bay 3',
  bay4: 'Bay 4',
}
const HOURS = Array.from({length: 10}, (_, i) => i + 8) // 8 AM to 5 PM

export function AppointmentCalendarWidget() {
  const client = useClient({apiVersion: '2024-01-01'})
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'today' | 'week'>('today')
  const [selectedDate, setSelectedDate] = useState(new Date())

  const fetchAppointments = useCallback(() => {
    if (!client) return
    const startOfDay = new Date(selectedDate)
    startOfDay.setHours(0, 0, 0, 0)

    const endDate = new Date(selectedDate)
    if (viewMode === 'week') {
      endDate.setDate(endDate.getDate() + 7)
    } else {
      endDate.setDate(endDate.getDate() + 1)
    }
    endDate.setHours(23, 59, 59, 999)

    const query = `*[_type == "appointment" 
      && scheduledDate >= "${startOfDay.toISOString()}" 
      && scheduledDate <= "${endDate.toISOString()}"
    ] {
      _id,
      appointmentNumber,
      scheduledDate,
      estimatedDuration,
      status,
      bay,
      customer->{name},
      vehicle->{year, make, model},
      service->{title},
      notes
    } | order(scheduledDate asc)`

    client.fetch(query).then((result: Appointment[]) => {
      setAppointments(result)
      setLoading(false)
    })
  }, [client, selectedDate, viewMode])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const getStatusColor = (status: string): BadgeTone => {
    const colors: {[key: string]: BadgeTone} = {
      scheduled: 'primary',
      needs_confirmation: 'caution',
      confirmed: 'positive',
      in_progress: 'caution',
      completed: 'positive',
      cancelled: 'critical',
    }
    return colors[status] || 'default'
  }

  const openAppointment = (appointmentId: string) => {
    router.navigateIntent('edit', {id: appointmentId, type: 'appointment'})
  }

  const createNewAppointment = () => {
    router.navigateIntent('create', {type: 'appointment'})
  }

  const getAppointmentPosition = (scheduledDate: string, duration: number) => {
    const date = new Date(scheduledDate)
    const hour = date.getHours()
    const minutes = date.getMinutes()

    // Calculate position from 8 AM
    const startOffset = ((hour - 8) * 60 + minutes) / 60
    const height = duration || 1 // Default to 1 hour if no duration

    return {
      top: `${startOffset * 60}px`, // 60px per hour
      height: `${Math.max(height * 60, 40)}px`, // Minimum 40px height
    }
  }

  const getAppointmentsForBay = (bay: string) => {
    return appointments.filter((apt) => apt.bay === bay)
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})
  }

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + days)
    setSelectedDate(newDate)
  }

  const goToToday = () => {
    setSelectedDate(new Date())
  }

  if (loading) {
    return (
      <Card padding={4}>
        <Text>Loading appointments...</Text>
      </Card>
    )
  }

  const totalAppointments = appointments.length
  const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length
  const inProgressCount = appointments.filter((a) => a.status === 'in_progress').length

  return (
    <Card padding={4}>
      <Stack space={4}>
        {/* Header - FIXED: Better contrast and spacing */}
        <Flex justify="space-between" align="center" gap={3}>
          <Text size={3} weight="bold">
            Appointment Calendar
          </Text>
          <Flex gap={2} align="center">
            <Button
              icon={AddIcon}
              text="New Appointment"
              tone="primary"
              fontSize={1}
              padding={3}
              onClick={createNewAppointment}
            />
          </Flex>
        </Flex>

        {/* Stats Row - FIXED: Better spacing */}
        <Flex gap={3} wrap="wrap">
          <Badge tone="default" fontSize={1} padding={2}>
            {totalAppointments} total
          </Badge>
          <Badge tone="positive" fontSize={1} padding={2}>
            {confirmedCount} confirmed
          </Badge>
          {inProgressCount > 0 && (
            <Badge tone="caution" fontSize={1} padding={2}>
              {inProgressCount} in progress
            </Badge>
          )}
        </Flex>

        {/* Controls - FIXED: Better spacing and alignment */}
        <Flex gap={3} align="center" justify="space-between" wrap="wrap">
          <Flex gap={2} align="center">
            <Button
              fontSize={1}
              padding={3}
              text="◀"
              mode="ghost"
              onClick={() => changeDate(viewMode === 'today' ? -1 : -7)}
            />
            <Button fontSize={1} padding={3} text="Today" mode="ghost" onClick={goToToday} />
            <Button
              fontSize={1}
              padding={3}
              text="▶"
              mode="ghost"
              onClick={() => changeDate(viewMode === 'today' ? 1 : 7)}
            />
          </Flex>

          <Text size={2} weight="semibold">
            {formatDate(selectedDate)}
          </Text>

          <Select
            fontSize={1}
            padding={3}
            value={viewMode}
            onChange={(e) => setViewMode(e.currentTarget.value as 'today' | 'week')}
          >
            <option value="today">Day View</option>
            <option value="week">Week View</option>
          </Select>
        </Flex>

        {/* Calendar Grid */}
        {viewMode === 'today' ? (
          <Box style={{overflowX: 'auto'}}>
            <Flex gap={2} style={{minWidth: '900px'}}>
              {/* Time Column - FIXED: Better spacing */}
              <Box style={{width: '70px', flexShrink: 0}}>
                <Box style={{height: '50px', marginBottom: '8px'}} /> {/* Header spacer */}
                {HOURS.map((hour) => (
                  <Box
                    key={hour}
                    style={{
                      height: '60px',
                      borderTop: '1px solid #e8e8e8',
                      paddingTop: '4px',
                    }}
                  >
                    <Text size={1} style={{color: '#666'}}>
                      {hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? 'PM' : 'AM'}
                    </Text>
                  </Box>
                ))}
              </Box>

              {/* Bay Columns - FIXED: Better headers and spacing */}
              {BAYS.map((bay) => {
                const bayAppointments = getAppointmentsForBay(bay)

                return (
                  <Box key={bay} flex={1} style={{position: 'relative', minWidth: '200px'}}>
                    {/* Bay Header - FIXED: Dark background with white text */}
                    <Box
                      padding={3}
                      style={{
                        height: '50px',
                        marginBottom: '8px',
                        borderRadius: '4px',
                        backgroundColor: '#1f2937',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text size={2} weight="semibold" style={{color: '#ffffff'}}>
                        {BAY_LABELS[bay]}
                      </Text>
                    </Box>

                    {/* Time Grid - FIXED: Better borders and spacing */}
                    <Box style={{position: 'relative', height: `${HOURS.length * 60}px`}}>
                      {HOURS.map((hour) => (
                        <Box
                          key={hour}
                          style={{
                            position: 'absolute',
                            top: `${(hour - 8) * 60}px`,
                            width: '100%',
                            height: '60px',
                            borderTop: '1px solid #e8e8e8',
                            borderLeft: '1px solid #e8e8e8',
                            backgroundColor: '#fafafa',
                          }}
                        />
                      ))}

                      {/* Appointments - FIXED: Better spacing and no overlap */}
                      {bayAppointments.map((apt) => {
                        const position = getAppointmentPosition(
                          apt.scheduledDate,
                          apt.estimatedDuration,
                        )

                        return (
                          <Card
                            key={apt._id}
                            padding={2}
                            radius={2}
                            shadow={1}
                            tone={getStatusColor(apt.status)}
                            style={{
                              position: 'absolute',
                              ...position,
                              width: 'calc(100% - 16px)',
                              left: '8px',
                              cursor: 'pointer',
                              overflow: 'auto',
                              zIndex: 10,
                            }}
                            onClick={() => openAppointment(apt._id)}
                          >
                            <Stack space={2}>
                              <Text size={1} weight="bold" style={{lineHeight: '1.3'}}>
                                {formatTime(apt.scheduledDate)}
                              </Text>
                              <Text size={1} weight="semibold" style={{lineHeight: '1.3'}}>
                                {apt.customer?.name || 'No customer'}
                              </Text>
                              {apt.vehicle && (
                                <Text size={1} style={{lineHeight: '1.3', opacity: 0.8}}>
                                  {apt.vehicle.year} {apt.vehicle.make} {apt.vehicle.model}
                                </Text>
                              )}
                              {apt.service && (
                                <Text size={1} style={{lineHeight: '1.3', opacity: 0.8}}>
                                  {apt.service.title}
                                </Text>
                              )}
                              <Badge tone={getStatusColor(apt.status)} fontSize={0}>
                                {apt.status.replace('_', ' ')}
                              </Badge>
                            </Stack>
                          </Card>
                        )
                      })}
                    </Box>
                  </Box>
                )
              })}
            </Flex>
          </Box>
        ) : (
          // Week View - List Format - FIXED: Better spacing
          <Stack space={3}>
            {appointments.length === 0 ? (
              <Card padding={5} tone="transparent" radius={2} border>
                <Text align="center" muted size={2}>
                  No appointments scheduled for this week
                </Text>
              </Card>
            ) : (
              appointments.map((apt) => (
                <Card
                  key={apt._id}
                  padding={4}
                  radius={2}
                  shadow={1}
                  tone={getStatusColor(apt.status)}
                  style={{cursor: 'pointer'}}
                  onClick={() => openAppointment(apt._id)}
                >
                  <Flex justify="space-between" align="flex-start" gap={4}>
                    <Box flex={1}>
                      <Flex gap={2} align="center" marginBottom={3}>
                        <Badge tone="primary" fontSize={1} padding={2}>
                          {BAY_LABELS[apt.bay] || apt.bay}
                        </Badge>
                        <Badge tone={getStatusColor(apt.status)} fontSize={1} padding={2}>
                          {apt.status.replace('_', ' ')}
                        </Badge>
                      </Flex>
                      <Stack space={2}>
                        <Text size={2} weight="semibold">
                          {apt.customer?.name || 'No customer'}
                        </Text>
                        {apt.vehicle && (
                          <Text size={1} style={{color: '#666'}}>
                            {apt.vehicle.year} {apt.vehicle.make} {apt.vehicle.model}
                          </Text>
                        )}
                        {apt.service && (
                          <Text size={1} style={{color: '#666'}}>
                            {apt.service.title}
                          </Text>
                        )}
                      </Stack>
                    </Box>
                    <Box style={{textAlign: 'right', minWidth: '120px'}}>
                      <Stack space={2}>
                        <Text size={2} weight="bold">
                          {formatTime(apt.scheduledDate)}
                        </Text>
                        <Text size={1} style={{color: '#666'}}>
                          {formatDate(new Date(apt.scheduledDate))}
                        </Text>
                        <Text size={1} style={{color: '#666'}}>
                          {apt.estimatedDuration ? `${apt.estimatedDuration}h` : 'No duration'}
                        </Text>
                      </Stack>
                    </Box>
                  </Flex>
                </Card>
              ))
            )}
          </Stack>
        )}

        {totalAppointments === 0 && viewMode === 'today' && (
          <Card padding={5} tone="transparent" radius={2} border>
            <Text align="center" muted size={2}>
              No appointments scheduled for today
            </Text>
          </Card>
        )}
      </Stack>
    </Card>
  )
}
