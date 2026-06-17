import React, { useState, useCallback, useRef } from 'react';
import './App.css';

const API = process.env.REACT_APP_API_URL || '';

// ── Utility ──────────────────────────────────────────────────────────────────

function gradeColor(grade) {
  const g = parseFloat(grade);
  if (isNaN(g)) return 'var(--text-muted)';
  if (g <= 1.5) return '#5AC8FA';
  if (g <= 2.5) return '#34C759';
  if (g <= 3.0) return '#FFD60A';
  return '#FF453A';
}

function semesterLabel(sem) {
  if (!sem || sem === 'N/A') return '';
  const s = sem.toLowerCase();
  if (s.includes('1st') || s === '1') return '1st Semester';
  if (s.includes('2nd') || s === '2') return '2nd Semester';
  if (s.includes('summer')) return 'Summer';
  return sem;
}

function formatEnrollmentTitle(schoolYear, semester) {
  const sem = semesterLabel(semester) || semester;
  if (schoolYear && schoolYear !== 'N/A' && sem) {
    return `${schoolYear} | ${sem}`;
  }
  return schoolYear || sem || 'N/A';
}

function formatStudentName(name) {
  if (!name) return '';
  if (name.includes(',')) {
    const parts = name.split(',');
    if (parts.length === 2) {
      const lastName = parts[0].trim();
      const firstName = parts[1].trim();
      return `${firstName} ${lastName}`;
    }
  }
  return name;
}

function formatCourseAndYear(course, yearLevel) {
  const parts = [];
  if (course) parts.push(course);
  if (yearLevel) parts.push(yearLevel);
  return parts.length > 0 ? parts.join(' | ') : '';
}

// ── Components ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
    </div>
  );
}

function ErrorBanner({ message, onDismiss }) {
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <button className="error-dismiss" onClick={onDismiss} aria-label="Dismiss">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

// ── Request Copy Modal ──────────────────────────────────────────────────────

function RequestCopyModal({ isOpen, onClose, onSend, loading, error }) {
  const [email, setEmail] = useState('');
  const modalRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email.trim()) {
      onSend(email.trim());
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === modalRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" ref={modalRef} onClick={handleOverlayClick}>
      <div className="modal-content glass-card">
        <div className="modal-header">
          <h3 className="modal-title">Request Grade Copy</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-desc">
              Enter your email address to receive a copy of your grades in HTML format.
              The file will be sent as an attachment.
            </p>
            <div className="field-group">
              <label className="field-label" htmlFor="requestEmail">Email Address</label>
              <input
                id="requestEmail"
                className="field-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>
            {error && <ErrorBanner message={error} onDismiss={() => {}} />}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading || !email.trim()}>
              {loading ? <><Spinner /> Sending...</> : 'Send Copy'}
            </button>
          </div>
        </form>
        <div className="modal-disclaimer">
          <p>
            This system is used and created for students who forgot their login credentials. 
            All data is requested from the main BCC portal using GET requests. 
            Your email will only be used to send this grade copy.
          </p>
        </div>
      </div>
    </div>
  );
}

function LookupScreen({ onResult }) {
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    const id = studentId.trim();
    if (!id) { setError('Enter your student ID to continue.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/enrollments/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      onResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [studentId, onResult]);

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div className="screen lookup-screen">
      <div className="lookup-inner">
        <div className="brand">
          <div className="brand-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="3" y="3" width="9" height="9" rx="2" fill="currentColor" opacity="0.9"/>
              <rect x="16" y="3" width="9" height="9" rx="2" fill="currentColor" opacity="0.5"/>
              <rect x="3" y="16" width="9" height="9" rx="2" fill="currentColor" opacity="0.5"/>
              <rect x="16" y="16" width="9" height="9" rx="2" fill="currentColor" opacity="0.9"/>
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-name">BCC Portal</span>
            <span className="brand-sub">Buenavista Community College</span>
          </div>
        </div>

        <div className="glass-card lookup-card">
          <h1 className="lookup-title">Student Records</h1>
          <p className="lookup-desc">Enter your student ID to view your enrollment history and grades.</p>

          <div className="field-group">
            <label className="field-label" htmlFor="studentId">Student ID</label>
            <input
              id="studentId"
              className="field-input"
              type="text"
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              onKeyDown={handleKey}
              placeholder="e.g. ****-****"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={loading}
            />
          </div>

          {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading || !studentId.trim()}
          >
            {loading ? <><Spinner /> Retrieving records</> : 'View Records'}
          </button>
        </div>

        <p className="footer-note">Data is fetched directly from the BCC portal.</p>
      </div>
    </div>
  );
}

function EnrollmentCard({ enrollment, onViewGrades }) {
  const title = formatEnrollmentTitle(enrollment.schoolYear, enrollment.semester);
  const courseAndYear = formatCourseAndYear(enrollment.course, enrollment.yearLevel);
  
  return (
    <div className="glass-card enrollment-card">
      <div className="enrollment-meta">
        <div className="enrollment-year">{title}</div>
      </div>
      {courseAndYear && (
        <div className="enrollment-course">{courseAndYear}</div>
      )}
      <div className="enrollment-footer">
        <span className="enrollment-id-label">ID {enrollment.enrollmentId}</span>
        <button
          className="btn-secondary"
          onClick={() => onViewGrades(enrollment)}
        >
          View Grades
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function EnrollmentsScreen({ data, onViewGrades, onBack }) {
  const { studentId, studentName, enrollments } = data;
  const displayName = formatStudentName(studentName) || studentId;
  
  const getAvatarLetter = () => {
    if (studentName && studentName !== 'Student') {
      if (studentName.includes(',')) {
        const parts = studentName.split(',');
        if (parts.length === 2) {
          const firstName = parts[1].trim();
          return firstName.charAt(0).toUpperCase();
        }
      }
      return studentName.charAt(0).toUpperCase();
    }
    return studentId.charAt(0).toUpperCase();
  };

  const avatarLetter = getAvatarLetter();

  return (
    <div className="screen enrollments-screen">
      <div className="top-bar">
        <button className="back-btn" onClick={onBack} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="top-bar-title">BCC Portal</span>
        <div style={{width: 40}} />
      </div>

      <div className="screen-content">
        <div className="student-header">
          <div className="student-avatar">
            {avatarLetter}
          </div>
          <div className="student-info">
            <div className="student-name">{displayName}</div>
            <div className="student-id">{studentId}</div>
          </div>
        </div>

        <div className="section-label">{enrollments.length} enrollment{enrollments.length !== 1 ? 's' : ''} found</div>

        <div className="enrollments-list">
          {enrollments.map(e => (
            <EnrollmentCard
              key={e.enrollmentId}
              enrollment={e}
              onViewGrades={onViewGrades}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GradesScreen({ enrollment, studentName, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);

  React.useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`${API}/api/grades/${enrollment.enrollmentId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [enrollment.enrollmentId]);

  const getStudentInfoLine = () => {
    const parts = [];
    
    let name = data?.studentInfo?.name || studentName || '';
    if (name) {
      name = formatStudentName(name);
    }
    
    const course = data?.studentInfo?.course || enrollment.course || '';
    const schoolYear = enrollment.schoolYear || '';
    const semester = semesterLabel(enrollment.semester) || enrollment.semester || '';

    if (name) parts.push(name);
    if (course) parts.push(course);
    if (schoolYear && schoolYear !== 'N/A') parts.push(schoolYear);
    if (semester) parts.push(semester);

    return parts.length > 0 ? parts.join(' | ') : 'Student Grades';
  };

  const handleRequestCopy = async (email) => {
    setSending(true);
    setSendError('');
    setSendSuccess(false);
    
    try {
      // Prepare the data for the email
      const payload = {
        email,
        enrollmentId: enrollment.enrollmentId,
        studentName: data?.studentInfo?.name || studentName || 'Student',
        course: data?.studentInfo?.course || enrollment.course || '',
        schoolYear: enrollment.schoolYear || '',
        semester: semesterLabel(enrollment.semester) || enrollment.semester || '',
        grades: data?.grades || [],
        gwa: data?.gwa || 'N/A',
        remarks: data?.remarks || 'N/A',
        studentInfo: data?.studentInfo || {},
        enrollment: enrollment
      };
      
      const res = await fetch(`${API}/api/send-grade-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to send email.');
      
      setSendSuccess(true);
      setTimeout(() => {
        setModalOpen(false);
        setSendSuccess(false);
      }, 2000);
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="screen grades-screen">
      <div className="top-bar">
        <button className="back-btn" onClick={onBack} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="top-bar-title">BCC Portal</span>
        <div style={{width: 40}} />
      </div>

      <div className="screen-content">
        <div className="grades-header glass-card">
          <div className="grades-meta-row">
            <div>
              <div className="grades-period" style={{ fontSize: '16px', fontWeight: '600' }}>
                {getStudentInfoLine()}
              </div>
            </div>
            <div className="enrollment-id-chip">ID {enrollment.enrollmentId}</div>
          </div>
        </div>

        {loading && (
          <div className="loading-state">
            <Spinner />
            <span>Loading grades</span>
          </div>
        )}

        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

        {data && !loading && (
          <>
            {data.gwa && (
              <div className="gwa-card glass-card">
                <span className="gwa-label">General Weighted Average</span>
                <span className="gwa-value" style={{ color: gradeColor(data.gwa) }}>
                  {data.gwa}
                </span>
                {data.remarks && (
                  <span className={`gwa-remarks ${data.remarks.toLowerCase().includes('pass') ? 'passed' : 'failed'}`}>
                    {data.remarks}
                  </span>
                )}
              </div>
            )}

            {data.grades && data.grades.length > 0 ? (
              <>
                <div className="grades-list">
                  <div className="section-label">Subjects</div>
                  {data.grades.map((g, i) => (
                    <div className="glass-card grade-row" key={i}>
                      <div className="grade-subject">
                        <span className="grade-code">{g.subjectCode}</span>
                        {g.subjectTitle && (
                          <span className="grade-title">{g.subjectTitle}</span>
                        )}
                      </div>
                      <div className="grade-scores">
                        {g.units && (
                          <div className="grade-stat">
                            <span className="grade-stat-label">Units</span>
                            <span className="grade-stat-value">{g.units}</span>
                          </div>
                        )}
                        {g.midterm && (
                          <div className="grade-stat">
                            <span className="grade-stat-label">Midterm</span>
                            <span className="grade-stat-value" style={{ color: gradeColor(g.midterm) }}>
                              {g.midterm}
                            </span>
                          </div>
                        )}
                        {g.finals && (
                          <div className="grade-stat">
                            <span className="grade-stat-label">Finals</span>
                            <span className="grade-stat-value" style={{ color: gradeColor(g.finals) }}>
                              {g.finals}
                            </span>
                          </div>
                        )}
                        {g.finalGrade && (
                          <div className="grade-stat final">
                            <span className="grade-stat-label">Final</span>
                            <span className="grade-stat-value" style={{ color: gradeColor(g.finalGrade) }}>
                              {g.finalGrade}
                            </span>
                          </div>
                        )}
                      </div>
                      {g.remarks && (
                        <div className={`grade-remark ${g.remarks.toLowerCase().includes('pass') ? 'passed' : g.remarks.toLowerCase().includes('fail') ? 'failed' : ''}`}>
                          {g.remarks}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* ── Request Copy Button ── */}
                <button
                  className="btn-primary request-copy-btn"
                  onClick={() => setModalOpen(true)}
                >
                  Request Copy
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <rect x="2" y="2" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M6 6h8v10a1 1 0 01-1 1H7a1 1 0 01-1-1V6z" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M9 3V1M12 3V1M15 3V1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </>
            ) : (
              <div className="empty-state glass-card">
                <div className="empty-icon">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="6" y="4" width="20" height="24" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M11 11h10M11 16h10M11 21h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="empty-text">Grade details are not available for this enrollment. The portal may require authentication to display them.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Request Copy Modal ── */}
      <RequestCopyModal
        isOpen={modalOpen}
        onClose={() => { if (!sending) { setModalOpen(false); setSendError(''); setSendSuccess(false); } }}
        onSend={handleRequestCopy}
        loading={sending}
        error={sendError}
        success={sendSuccess}
      />
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState('lookup');
  const [enrollmentData, setEnrollmentData] = useState(null);
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);

  const handleResult = (data) => {
    setEnrollmentData(data);
    setScreen('enrollments');
  };

  const handleViewGrades = (enrollment) => {
    setSelectedEnrollment(enrollment);
    setScreen('grades');
  };

  return (
    <div className="app">
      <div className="bg-gradient" />
      <div className="bg-mesh" />

      {screen === 'lookup' && (
        <LookupScreen onResult={handleResult} />
      )}
      {screen === 'enrollments' && enrollmentData && (
        <EnrollmentsScreen
          data={enrollmentData}
          onViewGrades={handleViewGrades}
          onBack={() => setScreen('lookup')}
        />
      )}
      {screen === 'grades' && selectedEnrollment && (
        <GradesScreen
          enrollment={selectedEnrollment}
          studentName={enrollmentData?.studentName}
          onBack={() => setScreen('enrollments')}
        />
      )}
    </div>
  );
}
