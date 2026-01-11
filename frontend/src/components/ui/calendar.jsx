import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const Calendar = ({ value, onChange, className, ...props }) => {
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    const date = value ? new Date(value) : new Date()
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })

  // Sync currentMonth when value changes
  React.useEffect(() => {
    if (value) {
      const date = new Date(value)
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    }
  }, [value])

  const selectedDate = value ? new Date(value) : null

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate()
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const handleDateClick = (day) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    const dateStr = date.toISOString().split('T')[0]
    onChange?.(dateStr)
  }

  const isToday = (day) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    return date.getTime() === today.getTime()
  }

  const isSelected = (day) => {
    if (!selectedDate || !value) return false
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    date.setHours(0, 0, 0, 0)
    const selected = new Date(value)
    selected.setHours(0, 0, 0, 0)
    return date.getTime() === selected.getTime()
  }

  const isPast = (day) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    return date < today
  }

  const days = []
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null)
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day)
  }

  return (
    <div className={cn("p-3", className)} {...props}>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="font-semibold">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </div>
        <button
          onClick={nextMonth}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map((day) => (
          <div key={day} className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          if (day === null) {
            return <div key={idx} className="h-8" />
          }
          const past = isPast(day)
          const todayClass = isToday(day)
          const selected = isSelected(day)
          return (
            <button
              key={day}
              onClick={() => !past && handleDateClick(day)}
              disabled={past}
              className={cn(
                "h-8 rounded-md text-sm transition-colors",
                past && "text-muted-foreground/50 cursor-not-allowed",
                !past && "hover:bg-accent cursor-pointer",
                todayClass && "font-semibold bg-accent/50",
                selected && "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { Calendar }
