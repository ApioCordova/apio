// Late-submission grade adjustment for class assignments.
//   rawAccuracy : 0–100 the student earned on the questions
//   assignment  : { due_date, lock_after_due, late_penalty, late_penalty_mode }
// Subtractive (Canvas-style): adjusted = max(0, raw − effectivePenalty).
// Per-day: any started day counts as a full day late (ceil), min 1, capped 100.
const DAY_MS = 24 * 60 * 60 * 1000

export function computeLatePenalty(rawAccuracy, assignment, now = Date.now()) {
  const due = assignment?.due_date ? new Date(assignment.due_date).getTime() : null
  const isLate = due != null && now > due

  // No due date, or the assignment locks after due (so late work can't happen):
  // never a penalty to apply here.
  if (!isLate || assignment?.lock_after_due !== false) {
    return { adjusted: rawAccuracy, penalty: 0, daysLate: 0, isLate: false }
  }

  const pct = Number(assignment?.late_penalty) || 0
  const mode = assignment?.late_penalty_mode || 'static'
  const daysLate = Math.max(1, Math.ceil((now - due) / DAY_MS))
  const penalty = mode === 'per_day' ? Math.min(100, pct * daysLate) : pct
  const adjusted = Math.max(0, Math.round(rawAccuracy - penalty))

  return { adjusted, penalty, daysLate, isLate: true }
}