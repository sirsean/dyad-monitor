
class DailyCheckProcessor {
  constructor({
    schedule,
    noteMessages,
    noteIds
  }) {
    this.schedule = schedule;
    this.noteMessages = noteMessages;
    this.noteIds = noteIds;
    this.lastExecutionDate = null;
  }

  async checkAndRun(currentDate) {
    // Check if it's time for the daily note check based on schedule
    if (this.schedule.shouldTrigger(currentDate)) {
      console.log(`Daily check triggered at ${this.schedule.getTimeZoneString(currentDate)}`);
      const messages = await this.runDailyNoteCheck(currentDate);
      
      // Mark the execution as completed
      this.schedule.markExecuted(currentDate);
      
      return messages;
    }
    
    return [];
  }

  async runDailyNoteCheck(currentDate) {
    console.log('Running daily note check...');
    try {
      // Get the first note ID from the provided list
      const firstNoteId = this.noteIds.split(',')[0];
      console.log(`Checking note ID: ${firstNoteId}`);

      // Call noteMessages for the first note with shouldClaim=true
      const message = await this.noteMessages(firstNoteId, true);

      console.log('Daily note check completed.');
      // Return the message instead of sending it directly
      return [message];
    } catch (error) {
      console.error('Error checking note:', error.message);
      console.error(error);
      return [`Error checking note: ${error.message}`];
    }
  }
}

export default DailyCheckProcessor;
