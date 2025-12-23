import {useState} from 'react'

type VerificationResult =
  | {
      verified: true
      code: string
    }
  | {
      verified: false
      requiresDocuments?: boolean
      uploadUrl?: string
      verificationId?: string
      status?: string
    }

export function MilitaryVerificationForm() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    birthDate: '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [error, setError] = useState('')
  const [statusLoading, setStatusLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/military-verify/start', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(formData),
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        setError(data.error || 'Verification failed.')
        return
      }
      setResult(data)
    } catch (err) {
      console.error('Military verification submit failed:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusCheck = async () => {
    if (!result || result.verified || !result.verificationId) return
    setStatusLoading(true)
    setError('')
    try {
      const response = await fetch('/api/military-verify/check-status', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({verificationId: result.verificationId}),
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        setError(data.error || 'Unable to check status.')
        return
      }
      setResult(data)
    } catch (err) {
      console.error('Military verification status failed:', err)
      setError('Unable to check status. Please try again.')
    } finally {
      setStatusLoading(false)
    }
  }

  return (
    <div className="military-verification">
      <div className="military-verification__header">
        <h2>Military Discount Verification</h2>
        <p>Verify your military status to receive 10% off.</p>
      </div>

      {!result && (
        <form onSubmit={handleSubmit} className="military-verification__form">
          <label>
            First Name
            <input
              type="text"
              value={formData.firstName}
              onChange={(event) => setFormData({...formData, firstName: event.target.value})}
              required
            />
          </label>
          <label>
            Last Name
            <input
              type="text"
              value={formData.lastName}
              onChange={(event) => setFormData({...formData, lastName: event.target.value})}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={formData.email}
              onChange={(event) => setFormData({...formData, email: event.target.value})}
              required
            />
          </label>
          <label>
            Birth Date
            <input
              type="date"
              value={formData.birthDate}
              onChange={(event) => setFormData({...formData, birthDate: event.target.value})}
              required
            />
          </label>
          {error && <div className="military-verification__error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify Military Status'}
          </button>
        </form>
      )}

      {result?.verified && (
        <div className="military-verification__success">
          <h3>Verification Successful</h3>
          <p>
            Your discount code: <strong>{result.code}</strong>
          </p>
          <p>Check your email for details.</p>
        </div>
      )}

      {result && !result.verified && (
        <div className="military-verification__pending">
          {result.requiresDocuments ? (
            <>
              <h3>Document Upload Required</h3>
              <p>Please upload your military ID or documentation.</p>
              {result.uploadUrl && (
                <a className="military-verification__button" href={result.uploadUrl} target="_blank">
                  Upload Documents
                </a>
              )}
            </>
          ) : (
            <>
              <h3>Verification In Progress</h3>
              <p>We are still reviewing your verification. Check again soon.</p>
            </>
          )}
          {result.verificationId && (
            <button
              type="button"
              onClick={handleStatusCheck}
              disabled={statusLoading}
              className="military-verification__button"
            >
              {statusLoading ? 'Checking...' : 'Check Status'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
