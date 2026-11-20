import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'

type Difficulty = 'ง่าย' | 'ปานกลาง' | 'ยาก'
type SessionKind = 'study' | 'review' | 'break'

type Topic = {
  id: string
  title: string
}

type Subject = {
  id: string
  name: string
  examDate: string
  difficulty: Difficulty
  topics: Topic[]
}

type Availability = {
  weekdays: number[]
  start: string
  end: string
}

type StudySession = {
  id: string
  date: string
  start: string
  end: string
  kind: SessionKind
  subjectId?: string
  topicId?: string
  title: string
}

type PlannerState = {
  subjects: Subject[]
  availability: Availability
  schedule: StudySession[]
  completedTopicIds: string[]
  missedDates: string[]
}

const STORAGE_KEY = 'studyflow-planner-v1'
const WEEKDAYS = [
  { value: 1, label: 'จ.' },
  { value: 2, label: 'อ.' },
  { value: 3, label: 'พ.' },
  { value: 4, label: 'พฤ.' },
  { value: 5, label: 'ศ.' },
  { value: 6, label: 'ส.' },
  { value: 0, label: 'อา.' },
]
const SUBJECT_COLORS = ['purple', 'blue', 'green', 'orange', 'pink']
const DIFFICULTY_SCORE: Record<Difficulty, number> = {
  ง่าย: 1,
  ปานกลาง: 2,
  ยาก: 3,
}

function localDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateOffset(offset: number) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return localDate(date)
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('th-TH', options).format(dateFromKey(value))
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function timeFromMinutes(value: number) {
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function createSampleSubjects(): Subject[] {
  return [
    {
      id: 'subject-calculus',
      name: 'แคลคูลัส',
      examDate: dateOffset(5),
      difficulty: 'ยาก',
      topics: [
        { id: 'calculus-limits', title: 'ลิมิตและความต่อเนื่อง' },
        { id: 'calculus-derivatives', title: 'อนุพันธ์และการประยุกต์' },
        { id: 'calculus-integrals', title: 'ปริพันธ์' },
      ],
    },
    {
      id: 'subject-biology',
      name: 'ชีววิทยา',
      examDate: dateOffset(10),
      difficulty: 'ปานกลาง',
      topics: [
        { id: 'biology-cell', title: 'โครงสร้างเซลล์' },
        { id: 'biology-genetics', title: 'พันธุศาสตร์' },
        { id: 'biology-ecology', title: 'ระบบนิเวศ' },
      ],
    },
    {
      id: 'subject-english',
      name: 'ภาษาอังกฤษ',
      examDate: dateOffset(14),
      difficulty: 'ง่าย',
      topics: [
        { id: 'english-vocabulary', title: 'คำศัพท์และสำนวน' },
        { id: 'english-grammar', title: 'ไวยากรณ์' },
        { id: 'english-reading', title: 'Reading comprehension' },
      ],
    },
  ]
}

function createPlan(
  subjects: Subject[],
  availability: Availability,
  completedTopicIds: string[],
  startAfter = localDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
): StudySession[] {
  const startDate = startAfter < localDate(new Date()) ? localDate(new Date()) : dateOffset(1)
  const futureSubjects = subjects.filter((subject) => subject.examDate >= startDate)
  if (!futureSubjects.length || !availability.weekdays.length) return []

  const lastExamDate = futureSubjects.reduce(
    (latest, subject) => (subject.examDate > latest ? subject.examDate : latest),
    futureSubjects[0].examDate,
  )
  const pendingTopics = new Map(
    futureSubjects.map((subject) => [
      subject.id,
      subject.topics.filter((topic) => !completedTopicIds.includes(topic.id)),
    ]),
  )
  const reviewDays = new Map<string, Subject[]>()

  for (const subject of futureSubjects) {
    let reviewDate = ''
    const exam = dateFromKey(subject.examDate)
    for (let dayOffset = 1; dayOffset <= 7; dayOffset += 1) {
      const candidate = new Date(exam)
      candidate.setDate(exam.getDate() - dayOffset)
      const key = localDate(candidate)
      if (key >= startDate && availability.weekdays.includes(candidate.getDay())) {
        reviewDate = key
        break
      }
    }
    if (reviewDate) {
      reviewDays.set(reviewDate, [...(reviewDays.get(reviewDate) ?? []), subject])
    }
  }

  const sessions: StudySession[] = []
  const cursor = dateFromKey(startDate)
  const endDate = dateFromKey(lastExamDate)

  while (cursor <= endDate) {
    const date = localDate(cursor)
    if (availability.weekdays.includes(cursor.getDay())) {
      const reviews = (reviewDays.get(date) ?? []).filter((subject) => subject.examDate > date)
      const dayStart = minutesFromTime(availability.start)
      const dayEnd = minutesFromTime(availability.end)
      const reservedReviewTime = reviews.length * 30
      let minute = dayStart
      let studyCount = 0
      let breakCount = 0
      const studyEnd = dayEnd - reservedReviewTime

      while (minute + 50 <= studyEnd) {
        const availableSubjects = futureSubjects
          .filter((subject) => subject.examDate > date && (pendingTopics.get(subject.id)?.length ?? 0) > 0)
          .sort((left, right) => {
            const examPriority = left.examDate.localeCompare(right.examDate)
            return examPriority || DIFFICULTY_SCORE[right.difficulty] - DIFFICULTY_SCORE[left.difficulty]
          })
        const subject = availableSubjects[0]
        if (!subject) break

        const topic = pendingTopics.get(subject.id)?.shift()
        if (!topic) break

        sessions.push({
          id: makeId(),
          date,
          start: timeFromMinutes(minute),
          end: timeFromMinutes(minute + 50),
          kind: 'study',
          subjectId: subject.id,
          topicId: topic.id,
          title: topic.title,
        })
        minute += 50
        studyCount += 1

        if (studyCount % 2 === 0 && minute + 10 <= studyEnd) {
          sessions.push({
            id: makeId(),
            date,
            start: timeFromMinutes(minute),
            end: timeFromMinutes(minute + 10),
            kind: 'break',
            title: 'พักสายตาและยืดเส้น',
          })
          minute += 10
          breakCount += 1
        }
      }

      for (const subject of reviews) {
        if (minute + 30 <= dayEnd) {
          sessions.push({
            id: makeId(),
            date,
            start: timeFromMinutes(minute),
            end: timeFromMinutes(minute + 30),
            kind: 'review',
            subjectId: subject.id,
            title: `ทบทวนก่อนสอบ · ${subject.name}`,
          })
          minute += 30
        }
      }

      if (studyCount > 0 && breakCount === 0 && minute + 10 <= dayEnd) {
        sessions.push({
          id: makeId(),
          date,
          start: timeFromMinutes(minute),
          end: timeFromMinutes(minute + 10),
          kind: 'break',
          title: 'พักสายตาและยืดเส้น',
        })
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return sessions.sort((left, right) => left.date.localeCompare(right.date) || left.start.localeCompare(right.start))
}

function createInitialState(): PlannerState {
  const subjects = createSampleSubjects()
  const availability = { weekdays: [1, 2, 3, 4, 5, 6], start: '18:30', end: '21:00' }
  return {
    subjects,
    availability,
    schedule: createPlan(subjects, availability, []),
    completedTopicIds: [],
    missedDates: [],
  }
}

function loadInitialState() {
  const fallback = createInitialState()
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return { planner: fallback, message: '' }
    const parsed: unknown = JSON.parse(stored)
    return isPlannerState(parsed)
      ? { planner: parsed, message: '' }
      : { planner: fallback, message: 'ข้อมูลที่บันทึกไว้ไม่สมบูรณ์ จึงเริ่มด้วยแผนตัวอย่าง' }
  } catch {
    return {
      planner: fallback,
      message: 'อ่านข้อมูลที่บันทึกไว้ไม่สำเร็จ แผนนี้จะยังใช้งานได้ในเซสชันปัจจุบัน',
    }
  }
}

function isPlannerState(value: unknown): value is PlannerState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PlannerState>
  return (
    Array.isArray(candidate.subjects) &&
    Array.isArray(candidate.schedule) &&
    Array.isArray(candidate.completedTopicIds) &&
    Array.isArray(candidate.missedDates) &&
    !!candidate.availability &&
    Array.isArray(candidate.availability.weekdays) &&
    typeof candidate.availability.start === 'string' &&
    typeof candidate.availability.end === 'string'
  )
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  }

  switch (name) {
    case 'grid':
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
    case 'calendar':
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
    case 'book':
      return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z" /><path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H20" /></svg>
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
    case 'spark':
      return <svg {...common}><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></svg>
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
    case 'arrow':
      return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    case 'chevron':
      return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>
    case 'refresh':
      return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9A7 7 0 0 1 17 5l3 2M4 17l3 2a7 7 0 0 0 11.5-4" /></svg>
    case 'check':
      return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>
    case 'close':
      return <svg {...common}><path d="m18 6-12 12M6 6l12 12" /></svg>
    case 'target':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>
    case 'sun':
      return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>
  }
}

function App() {
  const [initialState] = useState(loadInitialState)
  const [planner, setPlanner] = useState<PlannerState>(initialState.planner)
  const [storageMessage, setStorageMessage] = useState(initialState.message)
  const [subjectName, setSubjectName] = useState('')
  const [examDate, setExamDate] = useState(dateOffset(7))
  const [difficulty, setDifficulty] = useState<Difficulty>('ปานกลาง')
  const [topicDraft, setTopicDraft] = useState('')
  const [formError, setFormError] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState(localDate(new Date()))
  const [viewMode, setViewMode] = useState<'week' | 'all'>('week')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(planner))
    } catch (error) {
      console.error('Studyflow could not save the plan to local storage.', error)
    }
  }, [planner])

  const subjectById = useMemo(
    () => new Map(planner.subjects.map((subject) => [subject.id, subject])),
    [planner.subjects],
  )
  const topicCount = planner.subjects.reduce((total, subject) => total + subject.topics.length, 0)
  const completedCount = planner.completedTopicIds.filter((id) =>
    planner.subjects.some((subject) => subject.topics.some((topic) => topic.id === id)),
  ).length
  const progress = topicCount ? Math.round((completedCount / topicCount) * 100) : 0
  const today = localDate(new Date())
  const studySessions = planner.schedule.filter((session) => session.kind === 'study')
  const scheduleHours = Math.round((studySessions.length * 50) / 60 * 10) / 10
  const weekStart = dateFromKey(today)
  weekStart.setDate(weekStart.getDate() + weekOffset * 7)
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart)
    day.setDate(weekStart.getDate() + index)
    return localDate(day)
  })
  const visibleSessions = planner.schedule.filter((session) =>
    viewMode === 'week' ? session.date === selectedDate : session.date >= today,
  )
  const daySessions = visibleSessions.filter((session) => session.date === selectedDate)
  const unscheduledTopics = planner.subjects.reduce(
    (total, subject) =>
      total +
      subject.topics.filter(
        (topic) =>
          !planner.completedTopicIds.includes(topic.id) &&
          !planner.schedule.some((session) => session.topicId === topic.id),
      ).length,
    0,
  )
  const nextExam = [...planner.subjects]
    .filter((subject) => subject.examDate >= today)
    .sort((left, right) => left.examDate.localeCompare(right.examDate))[0]

  function rebuildSchedule(
    subjects = planner.subjects,
    availability = planner.availability,
    completedTopicIds = planner.completedTopicIds,
    missedDates = planner.missedDates,
    startAfter?: string,
  ) {
    if (minutesFromTime(availability.end) <= minutesFromTime(availability.start)) {
      setPlanner((current) => ({ ...current, subjects, availability, completedTopicIds, missedDates }))
      setNotice('เวลาเลิกอ่านต้องอยู่หลังเวลาเริ่มอ่าน')
      return
    }
    if (!availability.weekdays.length) {
      setPlanner((current) => ({ ...current, subjects, availability, completedTopicIds, missedDates }))
      setNotice('เลือกวันว่างอย่างน้อย 1 วันเพื่อสร้างตาราง')
      return
    }

    const schedule = createPlan(subjects, availability, completedTopicIds, startAfter)
    setPlanner((current) => ({
      ...current,
      subjects,
      availability,
      completedTopicIds,
      schedule,
      missedDates,
    }))
    setNotice('จัดตารางอ่านตามวันสอบ ความยาก และเวลาว่างเรียบร้อยแล้ว')
  }

  function updatePlan(subjects: Subject[], availability: Availability, completedTopicIds = planner.completedTopicIds) {
    rebuildSchedule(subjects, availability, completedTopicIds)
  }

  function handleAddSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const topics = topicDraft
      .split(/\n|,/)
      .map((title) => title.trim())
      .filter(Boolean)

    if (!subjectName.trim()) {
      setFormError('กรอกชื่อวิชาก่อนเพิ่มลงในแผน')
      return
    }
    if (!topics.length) {
      setFormError('เพิ่มหัวข้อที่ต้องอ่านอย่างน้อย 1 หัวข้อ')
      return
    }
    if (examDate < today) {
      setFormError('วันสอบต้องเป็นวันนี้หรือวันถัดไป')
      return
    }

    const id = makeId()
    const subject: Subject = {
      id,
      name: subjectName.trim(),
      examDate,
      difficulty,
      topics: topics.map((title, index) => ({ id: `${id}-topic-${index}`, title })),
    }
    updatePlan([...planner.subjects, subject], planner.availability)
    setSubjectName('')
    setTopicDraft('')
    setDifficulty('ปานกลาง')
    setExamDate(dateOffset(7))
    setFormError('')
  }

  function removeSubject(subjectId: string) {
    const subjects = planner.subjects.filter((subject) => subject.id !== subjectId)
    const removedTopicIds = planner.subjects
      .find((subject) => subject.id === subjectId)?.topics.map((topic) => topic.id) ?? []
    const completed = planner.completedTopicIds.filter((id) => !removedTopicIds.includes(id))
    updatePlan(subjects, planner.availability, completed)
  }

  function setAvailability<K extends keyof Availability>(key: K, value: Availability[K]) {
    const availability = { ...planner.availability, [key]: value }
    setPlanner((current) => ({ ...current, availability }))
  }

  function toggleWeekday(day: number) {
    const weekdays = planner.availability.weekdays.includes(day)
      ? planner.availability.weekdays.filter((value) => value !== day)
      : [...planner.availability.weekdays, day]
    setAvailability('weekdays', weekdays)
  }

  function generateSchedule() {
    rebuildSchedule(
      planner.subjects,
      planner.availability,
      planner.completedTopicIds,
      [],
    )
  }

  function replanAfterMissedDay() {
    const missedDate = selectedDate < today ? today : selectedDate
    const nextStart = dateOffset(Math.max(0, Math.round((dateFromKey(missedDate).getTime() - dateFromKey(today).getTime()) / 86400000)))
    const missedDates = [...new Set([...planner.missedDates, missedDate])]
    setSelectedDate(dateOffset(1))
    setWeekOffset(0)
    rebuildSchedule(
      planner.subjects,
      planner.availability,
      planner.completedTopicIds,
      missedDates,
      nextStart,
    )
  }

  function toggleTopicCompleted(topicId: string) {
    const completedTopicIds = planner.completedTopicIds.includes(topicId)
      ? planner.completedTopicIds.filter((id) => id !== topicId)
      : [...planner.completedTopicIds, topicId]
    setPlanner((current) => ({ ...current, completedTopicIds }))
  }

  function moveToNextDay(session: StudySession) {
    if (!session.topicId || !session.subjectId) return
    const subject = subjectById.get(session.subjectId)
    if (!subject) return
    const nextDate = dateFromKey(session.date)
    let targetDate = ''
    let targetStart = 0
    for (let offset = 1; offset <= 60; offset += 1) {
      nextDate.setDate(nextDate.getDate() + 1)
      const candidate = localDate(nextDate)
      if (candidate >= subject.examDate) break
      if (!planner.availability.weekdays.includes(nextDate.getDay())) continue

      const daySessions = planner.schedule
        .filter((item) => item.date === candidate && item.id !== session.id)
        .sort((left, right) => left.start.localeCompare(right.start))
      const needsBreak = daySessions.filter((item) => item.kind === 'study').length === 1 &&
        !daySessions.some((item) => item.kind === 'break')
      const slotLength = needsBreak ? 60 : 50
      let minute = minutesFromTime(planner.availability.start)
      const dayEnd = minutesFromTime(planner.availability.end)
      for (const item of daySessions) {
        const itemStart = minutesFromTime(item.start)
        if (itemStart - minute >= slotLength) break
        minute = Math.max(minute, minutesFromTime(item.end))
      }
      if (minute + slotLength <= dayEnd) {
        targetDate = candidate
        targetStart = minute
        break
      }
    }
    if (!targetDate) {
      setNotice('ไม่มีวันว่างก่อนวันสอบ ลองปรับเวลาว่างหรือสร้างแผนใหม่')
      window.setTimeout(() => setNotice(''), 3500)
      return
    }

    const sourceDate = session.date
    const targetDayStudyCount = planner.schedule.filter(
      (item) => item.date === targetDate && item.kind === 'study',
    ).length
    const targetNeedsBreak = targetDayStudyCount === 1 &&
      !planner.schedule.some((item) => item.date === targetDate && item.kind === 'break')
    const moved = planner.schedule.map((item) =>
      item.id === session.id
        ? { ...item, date: targetDate, start: timeFromMinutes(targetStart), end: timeFromMinutes(targetStart + 50) }
        : item,
    )
    if (targetNeedsBreak) {
      moved.push({
        id: makeId(),
        date: targetDate,
        start: timeFromMinutes(targetStart + 50),
        end: timeFromMinutes(targetStart + 60),
        kind: 'break',
        title: 'พักสายตาและยืดเส้น',
      })
    }
    const sourceStudyCount = moved.filter((item) => item.date === sourceDate && item.kind === 'study').length
    const rescheduled = moved.filter(
      (item) => !(item.date === sourceDate && item.kind === 'break' && sourceStudyCount < 2),
    ).sort((left, right) => left.date.localeCompare(right.date) || left.start.localeCompare(right.start))
    setPlanner((current) => ({ ...current, schedule: rescheduled }))
    setNotice(`ย้าย “${session.title}” ไปวันที่ ${formatDate(targetDate, { day: 'numeric', month: 'short' })} แล้ว`)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const headingDate = viewMode === 'week'
    ? formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })
    : 'ตารางอ่านทั้งหมด'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Studyflow หน้าหลัก">
          <span className="brand-mark"><Icon name="book" size={21} /></span>
          <span>study<span>flow</span></span>
        </a>
        <div className="sidebar-label">เมนูหลัก</div>
        <nav className="side-nav" aria-label="เมนูหลัก">
          <a className="nav-item active" href="#overview"><Icon name="grid" /><span>ภาพรวม</span></a>
          <a className="nav-item" href="#schedule"><Icon name="calendar" /><span>ตารางอ่าน</span><span className="nav-count">{planner.schedule.length}</span></a>
          <a className="nav-item" href="#subjects"><Icon name="book" /><span>วิชาของฉัน</span></a>
        </nav>
        <div className="sidebar-bottom">
          <div className="focus-card">
            <div className="focus-icon"><Icon name="spark" size={18} /></div>
            <strong>อ่านทีละนิด<br />พิชิตทุกวิชา</strong>
            <p>แผนที่ดีเริ่มจากก้าวเล็ก ๆ ในทุกวัน</p>
            <div className="focus-dots"><i /><i /><i /><i /><i /><i /><i /></div>
          </div>
          <div className="profile">
            <div className="avatar">น</div>
            <div><strong>นักเรียน</strong><span>แผนการอ่านของฉัน</span></div>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>พื้นที่ของฉัน</span><Icon name="chevron" size={15} /><strong>ภาพรวม</strong></div>
          <div className="topbar-actions">
            <span className="today-label"><Icon name="sun" size={17} /> {formatDate(today, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <button type="button" className="button button-primary top-generate" onClick={generateSchedule}>
            <Icon name="spark" size={17} /> จัดตารางอ่าน
            </button>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> STUDY PLANNER</div>
              <h1>วางแผนดี มีเวลาไปได้ไกล <span>✦</span></h1>
              <p>จัดการเวลาอ่านให้พอดี แล้วค่อย ๆ ไปถึงวันสอบอย่างมั่นใจ</p>
            </div>
            <div className="welcome-decoration" aria-hidden="true">
              <div className="deco-orbit orbit-one" /><div className="deco-orbit orbit-two" />
              <div className="deco-spark">✦</div><div className="deco-dot" />
            </div>
          </section>

          {(storageMessage || notice) && (
            <div className={`notice ${storageMessage ? 'notice-warning' : ''}`} role="status">
              <span>{storageMessage || notice}</span>
              <button type="button" aria-label="ปิดข้อความ" onClick={() => { setStorageMessage(''); setNotice('') }}><Icon name="close" size={16} /></button>
            </div>
          )}

          <section className="stats-grid" aria-label="สรุปแผนการอ่าน">
            <article className="stat-card">
              <div className="stat-icon stat-purple"><Icon name="book" size={20} /></div>
              <div className="stat-label">วิชาที่ต้องอ่าน</div>
              <div className="stat-value">{planner.subjects.length}<small> วิชา</small></div>
              <div className="stat-foot"><span className="stat-dot purple-dot" /> {topicCount} หัวข้อทั้งหมด</div>
            </article>
            <article className="stat-card">
              <div className="stat-icon stat-blue"><Icon name="clock" size={20} /></div>
              <div className="stat-label">เวลาอ่านในแผน</div>
              <div className="stat-value">{scheduleHours}<small> ชม.</small></div>
              <div className="stat-foot"><span className="stat-dot blue-dot" /> ครั้งละ 50 นาที + พัก</div>
            </article>
            <article className="stat-card progress-stat">
              <div className="stat-icon stat-green"><Icon name="target" size={20} /></div>
              <div className="stat-label">ความคืบหน้ารวม</div>
              <div className="stat-value">{progress}<small>%</small></div>
              <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            </article>
            <article className="stat-card exam-stat">
              <div className="stat-icon stat-orange"><Icon name="calendar" size={20} /></div>
              <div className="stat-label">สอบวิชาถัดไป</div>
              <div className="stat-value exam-subject">{nextExam?.name ?? 'ยังไม่มี'}</div>
              <div className="stat-foot"><span className="stat-dot orange-dot" /> {nextExam ? `อีก ${Math.max(0, Math.ceil((dateFromKey(nextExam.examDate).getTime() - dateFromKey(today).getTime()) / 86400000))} วัน · ${formatDate(nextExam.examDate, { day: 'numeric', month: 'short' })}` : 'เพิ่มวิชาเพื่อเริ่มวางแผน'}</div>
            </article>
          </section>

          <div className="workspace-grid">
            <section className="schedule-panel panel" id="schedule">
              <div className="panel-heading schedule-heading">
                <div>
                  <div className="section-title-row"><h2>ตารางอ่านของคุณ</h2><span className="schedule-pill"><Icon name="check" size={13} /> จัดด้วยกฎ</span></div>
                  <p>เรียงหัวข้อตามวันสอบและความยาก พร้อมแบ่งเวลาอ่านและช่วงพักให้อัตโนมัติ</p>
                </div>
                <div className="view-switch" role="group" aria-label="รูปแบบตาราง">
                  <button className={viewMode === 'week' ? 'selected' : ''} onClick={() => setViewMode('week')} type="button">รายวัน</button>
                  <button className={viewMode === 'all' ? 'selected' : ''} onClick={() => setViewMode('all')} type="button">ทั้งหมด</button>
                </div>
              </div>

              {viewMode === 'week' && (
                <div className="week-strip">
                  <button
                    className="week-arrow"
                    type="button"
                    aria-label="สัปดาห์ก่อนหน้า"
                    onClick={() => { setWeekOffset((offset) => offset - 1); setSelectedDate((date) => { const next = dateFromKey(date); next.setDate(next.getDate() - 7); return localDate(next) }) }}
                  >‹</button>
                  <div className="week-days">
                    {weekDates.map((date) => {
                      const day = dateFromKey(date)
                      const hasSessions = planner.schedule.some((session) => session.date === date)
                      return (
                        <button
                          key={date}
                          className={`week-day ${selectedDate === date ? 'active-day' : ''} ${date === today ? 'today-day' : ''}`}
                          type="button"
                          onClick={() => setSelectedDate(date)}
                        >
                          <span>{new Intl.DateTimeFormat('th-TH', { weekday: 'short' }).format(day)}</span>
                          <strong>{day.getDate()}</strong>
                          <i className={hasSessions ? 'has-plan' : ''} />
                        </button>
                      )
                    })}
                  </div>
                  <button
                    className="week-arrow"
                    type="button"
                    aria-label="สัปดาห์ถัดไป"
                    onClick={() => { setWeekOffset((offset) => offset + 1); setSelectedDate((date) => { const next = dateFromKey(date); next.setDate(next.getDate() + 7); return localDate(next) }) }}
                  >›</button>
                </div>
              )}

              <div className="agenda-heading">
                <div>
                  <h3>{headingDate}</h3>
                  <span>{viewMode === 'week' ? `${daySessions.filter((session) => session.kind !== 'break').length} รายการในวันนี้` : `${visibleSessions.length} รายการที่กำลังจะมาถึง`}</span>
                </div>
                {viewMode === 'week' && daySessions.some((session) => session.kind === 'study' && !planner.completedTopicIds.includes(session.topicId ?? '')) && (
                  <button className="missed-button" type="button" onClick={replanAfterMissedDay}><Icon name="refresh" size={15} /> พลาดวันนี้ · จัดตารางใหม่</button>
                )}
              </div>

              <div className="agenda-list">
                {(viewMode === 'week' ? daySessions : visibleSessions).length > 0 ? (
                  (viewMode === 'week' ? daySessions : visibleSessions).map((session) => {
                    const subject = session.subjectId ? subjectById.get(session.subjectId) : undefined
                    const isCompleted = !!session.topicId && planner.completedTopicIds.includes(session.topicId)
                    return (
                      <article key={session.id} className={`agenda-item ${session.kind} ${isCompleted ? 'completed-item' : ''}`}>
                        <div className="agenda-time"><strong>{session.start}</strong><span>{session.end}</span></div>
                        <div className={`agenda-marker ${session.kind}`}><span /></div>
                        <div className="agenda-card-content">
                          <div className="agenda-card-top">
                            <span className={`session-label ${session.kind}`}>
                              {session.kind === 'study' ? 'อ่านหัวข้อ' : session.kind === 'review' ? 'ทบทวนก่อนสอบ' : 'พัก'}
                            </span>
                            {viewMode === 'all' && <span className="session-date">{formatDate(session.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
                          </div>
                          <h4>{session.title}</h4>
                          {subject && <span className={`subject-tag ${SUBJECT_COLORS[planner.subjects.indexOf(subject) % SUBJECT_COLORS.length]}`}>{subject.name}</span>}
                        </div>
                        {session.kind === 'study' && session.topicId && (
                          <div className="agenda-actions">
                            <button
                              className={`complete-button ${isCompleted ? 'done' : ''}`}
                              type="button"
                              aria-label={isCompleted ? 'ยกเลิกการอ่านหัวข้อนี้' : 'ทำเครื่องหมายว่าอ่านแล้ว'}
                              title={isCompleted ? 'อ่านแล้ว' : 'ทำเครื่องหมายว่าอ่านแล้ว'}
                              onClick={() => toggleTopicCompleted(session.topicId!)}
                            ><Icon name="check" size={16} /></button>
                            {!isCompleted && <button className="move-button" type="button" onClick={() => moveToNextDay(session)}>เลื่อน</button>}
                          </div>
                        )}
                      </article>
                    )
                  })
                ) : (
                  <div className="empty-agenda">
                    <div className="empty-icon"><Icon name="calendar" size={25} /></div>
                    <strong>{viewMode === 'all' ? 'ยังไม่มีตารางอ่าน' : 'วันนี้ยังไม่มีรายการอ่าน'}</strong>
                    <span>เพิ่มวิชาและเลือกวันว่าง แล้วกดจัดตารางอ่าน</span>
                    <button type="button" onClick={() => document.getElementById('subjects')?.scrollIntoView({ behavior: 'smooth' })}>เพิ่มวิชา <Icon name="arrow" size={15} /></button>
                  </div>
                )}
              </div>

              {unscheduledTopics > 0 && (
                <div className="schedule-warning"><Icon name="clock" size={16} /> มี {unscheduledTopics} หัวข้อที่ยังไม่ลงตาราง ลองเพิ่มเวลาว่างหรือขยายวันอ่าน</div>
              )}

              <div className="schedule-footer">
                <span><i className="legend-dot study-dot" /> อ่านหนังสือ <i className="legend-dot review-dot" /> ทบทวน <i className="legend-dot break-dot" /> พัก</span>
                <button type="button" onClick={generateSchedule}><Icon name="refresh" size={15} /> จัดตารางอีกครั้ง</button>
              </div>
            </section>

            <aside className="right-column">
              <section className="panel subject-panel" id="subjects">
                <div className="panel-heading compact-heading">
                  <div><div className="section-title-row"><h2>วิชาที่ต้องอ่าน</h2><span className="count-pill">{planner.subjects.length}</span></div><p>เพิ่มวิชาและหัวข้อที่ต้องเตรียม</p></div>
                  <span className="heading-book"><Icon name="book" size={19} /></span>
                </div>

                <div className="subject-list">
                  {planner.subjects.map((subject, index) => {
                    const done = subject.topics.filter((topic) => planner.completedTopicIds.includes(topic.id)).length
                    const color = SUBJECT_COLORS[index % SUBJECT_COLORS.length]
                    return (
                      <article key={subject.id} className={`subject-card ${color}`}>
                        <div className="subject-card-top">
                          <span className={`subject-avatar ${color}`}>{subject.name.trim().charAt(0)}</span>
                          <div className="subject-main">
                            <strong>{subject.name}</strong>
                            <span>สอบ {formatDate(subject.examDate, { day: 'numeric', month: 'short' })}</span>
                          </div>
                          <button className="remove-subject" type="button" aria-label={`ลบวิชา${subject.name}`} title="ลบวิชา" onClick={() => removeSubject(subject.id)}><Icon name="close" size={15} /></button>
                        </div>
                        <div className="subject-card-bottom">
                          <span className={`difficulty ${subject.difficulty === 'ยาก' ? 'hard' : subject.difficulty === 'ง่าย' ? 'easy' : 'medium'}`}>{subject.difficulty}</span>
                          <span>{done}/{subject.topics.length} หัวข้อ</span>
                        </div>
                        <div className="subject-progress"><span style={{ width: `${subject.topics.length ? done / subject.topics.length * 100 : 0}%` }} /></div>
                      </article>
                    )
                  })}
                  {!planner.subjects.length && <div className="no-subjects">ยังไม่มีวิชา เพิ่มวิชาแรกของคุณได้ด้านล่าง</div>}
                </div>

                <form className="add-subject-form" onSubmit={handleAddSubject}>
                  <div className="form-divider"><span>เพิ่มวิชาใหม่</span></div>
                  <label className="field-label" htmlFor="subject-name">ชื่อวิชา</label>
                  <input id="subject-name" value={subjectName} onChange={(event) => setSubjectName(event.target.value)} placeholder="เช่น ฟิสิกส์" />
                  <div className="form-two-col">
                    <div><label className="field-label" htmlFor="exam-date">วันสอบ</label><input id="exam-date" type="date" min={today} value={examDate} onChange={(event) => setExamDate(event.target.value)} /></div>
                    <div><label className="field-label" htmlFor="difficulty">ความยาก</label><select id="difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}><option>ง่าย</option><option>ปานกลาง</option><option>ยาก</option></select></div>
                  </div>
                  <label className="field-label" htmlFor="topic-list">หัวข้อที่ต้องอ่าน</label>
                  <textarea id="topic-list" rows={3} value={topicDraft} onChange={(event) => setTopicDraft(event.target.value)} placeholder={'พิมพ์หัวข้อละ 1 บรรทัด\nเช่น กลศาสตร์, คลื่น'} />
                  {formError && <p className="form-error" role="alert">{formError}</p>}
                  <button className="button button-outline add-subject-button" type="submit"><Icon name="plus" size={17} /> เพิ่มวิชา</button>
                </form>
              </section>

              <section className="panel availability-panel">
                <div className="panel-heading compact-heading">
                  <div><div className="section-title-row"><h2>เวลาว่างของฉัน</h2></div><p>เลือกวันที่สะดวกอ่านหนังสือ</p></div>
                  <span className="heading-clock"><Icon name="clock" size={18} /></span>
                </div>
                <div className="weekday-picker" role="group" aria-label="วันที่ว่าง">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day.value}
                      className={planner.availability.weekdays.includes(day.value) ? 'weekday-active' : ''}
                      type="button"
                      aria-pressed={planner.availability.weekdays.includes(day.value)}
                      onClick={() => toggleWeekday(day.value)}
                    >{day.label}</button>
                  ))}
                </div>
                <div className="time-range">
                  <label><span>เริ่มอ่าน</span><input aria-label="เวลาเริ่มอ่าน" type="time" value={planner.availability.start} onChange={(event) => setAvailability('start', event.target.value)} /></label>
                  <span className="time-dash">—</span>
                  <label><span>เลิกอ่าน</span><input aria-label="เวลาเลิกอ่าน" type="time" value={planner.availability.end} onChange={(event) => setAvailability('end', event.target.value)} /></label>
                </div>
                <div className="availability-note"><Icon name="spark" size={15} /> ปรับตามเวลาว่างจริงของคุณได้เลย</div>
                <button className="button button-primary availability-button" type="button" onClick={generateSchedule}><Icon name="refresh" size={16} /> จัดตารางอ่าน</button>
              </section>

              <section className="planner-note">
                <div className="planner-note-icon"><Icon name="check" size={17} /></div>
                <div><strong>จัดตารางในเครื่อง ไม่เรียก AI</strong><p>ระบบเรียงตามวันสอบก่อน และใช้ระดับความยากช่วยจัดลำดับเมื่อวันสอบใกล้กัน</p></div>
              </section>
            </aside>
          </div>
          <footer className="page-footer"><span>Studyflow <b>·</b> วางแผนอ่านในแบบของคุณ</span><span>ความคืบหน้าจะบันทึกไว้ในอุปกรณ์นี้โดยอัตโนมัติ</span></footer>
        </div>
      </main>
    </div>
  )
}

export default App
