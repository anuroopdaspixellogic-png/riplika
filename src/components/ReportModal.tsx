import { useState } from 'react'
import { Modal } from './Modal'
import { ShieldIcon } from './Icons'

export type ReportReason = 'nudity' | 'harassment' | 'minor' | 'spam' | 'violence' | 'other'

const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: 'nudity', label: 'Nudity or sexual content', hint: 'Exposure, sexual requests or gestures' },
  { value: 'harassment', label: 'Harassment or hate', hint: 'Threats, slurs, stalking or abuse' },
  { value: 'minor', label: 'Suspected minor', hint: 'Someone who may be under 18' },
  { value: 'spam', label: 'Spam or scam', hint: 'Ads, phishing links or solicitation' },
  { value: 'violence', label: 'Violence or self-harm', hint: 'Threats of harm or graphic content' },
  { value: 'other', label: 'Something else', hint: 'Anything that made you uncomfortable' },
]

interface ReportModalProps {
  partnerName: string
  onClose: () => void
  onSubmit: (reason: ReportReason, details: string) => void
}

export function ReportModal({ partnerName, onClose, onSubmit }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason>('nudity')
  const [details, setDetails] = useState('')

  return (
    <Modal
      title="Report this chat"
      subtitle={`${partnerName} won't be told. Reporting blocks them for you and skips the call.`}
      onClose={onClose}
    >
      <div className="report-list" role="radiogroup" aria-label="Reason for reporting">
        {REASONS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={reason === item.value}
            className={`report-option ${reason === item.value ? 'selected' : ''}`}
            onClick={() => setReason(item.value)}
          >
            <span className="report-radio" aria-hidden />
            <span>
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
            </span>
          </button>
        ))}
      </div>

      <label className="input-field report-details">
        <span className="field-label">
          Details <em>optional</em>
        </span>
        <textarea
          value={details}
          maxLength={300}
          rows={3}
          placeholder="Anything that helps a reviewer understand what happened?"
          onChange={(event) => setDetails(event.target.value)}
        />
      </label>

      <div className="report-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={() => onSubmit(reason, details.trim())}>
          <ShieldIcon size={17} /> Report &amp; block
        </button>
      </div>
      <p className="report-footnote">
        False reports are rare, but please only report behaviour that actually breaks the rules.
      </p>
    </Modal>
  )
}
