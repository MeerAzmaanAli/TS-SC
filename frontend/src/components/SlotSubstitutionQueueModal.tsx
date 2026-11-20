import { useState } from 'react'
import { SlotSubstitutionQueueItem } from '../lib/substitutionQueue'
import { XIcon, CheckCircleIcon, ClockIcon } from './Icons'

interface SlotSubstitutionQueueModalProps {
  isOpen: boolean
  onClose: () => void
  slotTitle?: string
  slotDetails?: string
  queue: SlotSubstitutionQueueItem[]
  onCancelRequest?: (requestId: string) => Promise<void> | void
}

export default function SlotSubstitutionQueueModal({
  isOpen,
  onClose,
  slotTitle,
  slotDetails,
  queue,
  onCancelRequest,
}: SlotSubstitutionQueueModalProps) {
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  if (!isOpen || queue.length === 0) return null

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 1100,
        backgroundColor: 'rgba(28, 25, 23, 0.65)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: 600,
          width: '94%',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 12,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--bg-app)',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>🗓️</span>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Slot Substitution Queue
              </h3>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 99,
                  fontWeight: 700,
                  background: 'var(--primary-100)',
                  color: 'var(--primary-800)',
                }}
              >
                {queue.length} {queue.length === 1 ? 'Request' : 'Requests'}
              </span>
            </div>
            {slotTitle && (
              <div style={{ fontSize: 14, fontWeight: 600, color: '#292524' }}>
                {slotTitle}
              </div>
            )}
            {slotDetails && (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {slotDetails}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px', borderRadius: 6 }}
            aria-label="Close queue modal"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Informative Guidance Banner */}
        <div
          style={{
            padding: '10px 20px',
            background: '#FFFBEB',
            borderBottom: '1px solid #FDE68A',
            fontSize: 12,
            color: '#92400E',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>💡</span>
          <span>
            The weekly timetable displays the <strong>front element</strong> for the current active schedule. Future requests are queued chronologically.
          </span>
        </div>

        {/* Queue Items List */}
        <div
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {queue.map((item, index) => {
            const isFront = index === 0
            const canCancelItem = (item.status === 'open' || item.status === 'assigned' || item.status === 'unfilled' || item.status === 'cancelled') && Boolean(onCancelRequest)
            const isUnfilled = item.status === 'unfilled' || item.status === 'cancelled'

            return (
              <div
                key={item.id}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: isFront ? '#FEFCE8' : 'var(--bg-app)',
                  border: isFront ? '2px solid #F59E0B' : '1px solid var(--border-light)',
                  boxShadow: isFront ? '0 2px 8px rgba(245, 158, 11, 0.15)' : 'none',
                  position: 'relative',
                }}
              >
                {/* Priority / Queue Position Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 4,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        background: isFront ? '#F59E0B' : '#E7E5E4',
                        color: isFront ? '#FFFFFF' : '#44403C',
                      }}
                    >
                      {isFront ? '#1 Front of Queue' : `#${index + 1} in Queue`}
                    </span>
                    {isFront && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#065F46',
                          background: '#D1FAE5',
                          padding: '2px 6px',
                          borderRadius: 4,
                          border: '1px solid #A7F3D0',
                        }}
                      >
                        Active on Timetable
                      </span>
                    )}
                  </div>

                  {/* Status Pill and Cancel Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      className={`admin-tag ${
                        item.status === 'assigned'
                          ? 'assigned'
                          : item.status === 'open'
                          ? 'pending'
                          : 'unfilled'
                      }`}
                      style={{ fontSize: 11.5 }}
                    >
                      {item.status === 'assigned' && '✓ Substitute Assigned'}
                      {item.status === 'open' && '⏳ Seeking Substitute'}
                      {item.status === 'unfilled' && '✕ Free Period (Unfilled)'}
                      {item.status === 'expired' && '⏱ Request Expired'}
                      {item.status === 'cancelled' && '⊘ Cancelled'}
                    </span>

                    {canCancelItem && (
                      <button
                        type="button"
                        onClick={async () => {
                          const confirmMsg = isUnfilled
                            ? 'Are you sure you want to delete this unfilled request and restore the lecture to your schedule?'
                            : 'Are you sure you want to cancel this substitution request?'
                          if (window.confirm(confirmMsg)) {
                            setCancellingId(item.id)
                            try {
                              await onCancelRequest!(item.id)
                            } finally {
                              setCancellingId(null)
                            }
                          }
                        }}
                        disabled={cancellingId === item.id}
                        className="btn btn-secondary btn-sm"
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          color: '#DC2626',
                          borderColor: '#FECACA',
                          backgroundColor: '#FEF2F2',
                          cursor: cancellingId === item.id ? 'not-allowed' : 'pointer',
                        }}
                        title={isUnfilled ? 'Delete and restore regular teaching period' : 'Cancel this substitution request'}
                      >
                        {cancellingId === item.id
                          ? isUnfilled ? 'Restoring...' : 'Cancelling...'
                          : isUnfilled ? 'Restore Lecture' : 'Cancel Request'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Date Highlight */}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>📅</span>
                  <span>{item.targetDateFormatted}</span>
                  {item.isToday && (
                    <span style={{ fontSize: 11, background: '#DC2626', color: '#FFF', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>
                      TODAY
                    </span>
                  )}
                </div>

                {/* Details Breakdown */}
                <div
                  style={{
                    fontSize: 12.5,
                    color: '#57534E',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {item.substituteName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#047857', fontWeight: 600 }}>
                      <CheckCircleIcon size={14} />
                      <span>Covering Faculty: <strong>{item.substituteName}</strong></span>
                    </div>
                  )}

                  {item.requesterName && (
                    <div>
                      Original Faculty: <strong>{item.requesterName}</strong>
                    </div>
                  )}

                  {item.reason && (
                    <div style={{ fontStyle: 'italic', color: '#78716C' }}>
                      &ldquo;{item.reason}&rdquo;
                    </div>
                  )}

                  {item.deadline && (
                    <div style={{ fontSize: 11.5, color: '#854D0E', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <ClockIcon size={13} />
                      <span>
                        Deadline: {new Date(item.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on {new Date(item.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  )}

                  {/* Candidate responses summary if any */}
                  {item.candidates && item.candidates.length > 0 && (
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border-light)', fontSize: 11.5 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Dispatched to {item.candidates.length} peer candidates: </span>
                      {item.candidates.map((c) => (
                        <span
                          key={c.facultyId}
                          style={{
                            marginRight: 6,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: c.response === 'accepted' ? '#DCFCE7' : c.response === 'rejected' ? '#FEE2E2' : '#F5F5F4',
                            color: c.response === 'accepted' ? '#166534' : c.response === 'rejected' ? '#991B1B' : '#57534E',
                            fontWeight: 600,
                          }}
                        >
                          {c.facultyName} ({c.response})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            background: 'var(--bg-app)',
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ minWidth: 80 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
