export const isDateNotInPast = (dateVal: string | Date | null | undefined): boolean => {
  if (!dateVal) return false

  let year: number
  let month: number
  let day: number

  if (dateVal instanceof Date) {
    year = dateVal.getFullYear()
    month = dateVal.getMonth()
    day = dateVal.getDate()
  } else if (typeof dateVal === 'string') {
    const dateOnlyMatch = dateVal.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (dateOnlyMatch) {
      year = Number(dateOnlyMatch[1])
      month = Number(dateOnlyMatch[2]) - 1
      day = Number(dateOnlyMatch[3])
    } else {
      const parsed = new Date(dateVal)
      if (isNaN(parsed.getTime())) return false
      year = parsed.getUTCFullYear()
      month = parsed.getUTCMonth()
      day = parsed.getUTCDate()
    }
  } else {
    return false
  }

  const bookingMidnight = new Date(year, month, day).getTime()
  const today = new Date()
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()

  return bookingMidnight >= todayMidnight
}
