
import { format, getTimezoneOffset } from 'date-fns-tz';
import { getHours, getMinutes, addMilliseconds } from 'date-fns';

class ExecutionSchedule {
  constructor({ 
    timeZone = 'America/Chicago',
    targetHour = 5,
    targetMinute = 0
  }) {
    this.timeZone = timeZone;
    this.targetHour = targetHour;
    this.targetMinute = targetMinute;
    this.lastExecutionDate = null;
  }

  shouldTrigger(currentDate) {
    // Convert the date to the specified timezone
    const dateInTimeZone = this.convertToTimeZone(currentDate);
    const hoursInTZ = getHours(dateInTimeZone);
    const minutesInTZ = getMinutes(dateInTimeZone);

    // Check if it's after the target time
    const isAfterTargetTime = (
      hoursInTZ > this.targetHour || 
      (hoursInTZ === this.targetHour && minutesInTZ >= this.targetMinute)
    );

    // Check if we already ran today
    const today = new Date(currentDate.toDateString());
    const needsExecution = !this.lastExecutionDate || 
                           this.lastExecutionDate.getTime() < today.getTime();

    // If it's after the target time and we haven't run today, trigger the execution
    if (isAfterTargetTime && needsExecution) {
      return true;
    }
    
    return false;
  }

  markExecuted(date) {
    // Store just the date part (without time) for comparing days
    this.lastExecutionDate = new Date(date.toDateString());
  }

  convertToTimeZone(date) {
    // Get timezone offset in milliseconds
    const offsetMillis = getTimezoneOffset(this.timeZone, date);
    // Add offset to get the date in the target timezone
    return addMilliseconds(date, offsetMillis);
  }

  getTimeZoneString(date) {
    return format(this.convertToTimeZone(date), 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: this.timeZone });
  }
}

export default ExecutionSchedule;
