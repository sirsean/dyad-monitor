
import { ethers } from 'ethers';
import ExecutionSchedule from './ExecutionSchedule.js';
import GraphNote from './GraphNote.js';

class BlockProcessor {
  constructor({
    provider,
    vaultManager,
    dyad,
    noteMessages,
    noteIds,
    schedule = new ExecutionSchedule({
      timeZone: 'America/Chicago',
      targetHour: 5,
      targetMinute: 0
    })
  }) {
    this.provider = provider;
    this.vaultManager = vaultManager;
    this.dyad = dyad;
    this.noteMessages = noteMessages;
    this.noteIds = noteIds;
    this.schedule = schedule;
    
    // State tracking
    this.initialCheckDone = false;
    this.lastNotesFetch = 0;
  }

  async processBlock(blockNumber) {
    let messages = [];
    
    try {
      const block = await this.provider.getBlock(blockNumber);
      const feeData = await this.provider.getFeeData();

      const blockTimestamp = block.timestamp * 1000; // Convert to milliseconds
      const currentDate = new Date(blockTimestamp);
      const timestamp = currentDate.toISOString();
      const gasPrice = ethers.formatUnits(feeData.gasPrice || 0, 'gwei');

      console.log(`Block #${blockNumber} | Time: ${timestamp} | Gas: ${gasPrice} gwei`);

      // Run initial check on startup if needed
      if (!this.initialCheckDone) {
        this.initialCheckDone = true;
        const initialMessages = await this.runDailyNoteCheck(currentDate);
        messages = messages.concat(initialMessages);
        // Mark execution as completed for today
        this.schedule.markExecuted(currentDate);
      }

      // Check if it's time for the daily note check
      const dailyRunMessages = await this.checkForDailyRun(currentDate, blockTimestamp);
      messages = messages.concat(dailyRunMessages);

      // Check for liquidatable notes if it's time
      const liquidatableMessages = await this.checkForLiquidatableNotes(blockTimestamp);
      messages = messages.concat(liquidatableMessages);
      
      return messages;
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error.message);
      return [`Error processing block ${blockNumber}: ${error.message}`];
    }
  }

  async checkForDailyRun(currentDate, blockTimestamp) {
    // Use the schedule to check if we should trigger the daily run
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
      // Get the first note ID from the environment variable
      const firstNoteId = this.noteIds.split(',')[0];
      console.log(`Checking note ID: ${firstNoteId}`);

      // Call noteMessages for the first note
      const message = await this.noteMessages(firstNoteId);

      console.log('Daily note check completed.');
      // Return the message instead of sending it directly
      return [message];
    } catch (error) {
      console.error('Error checking note:', error.message);
      console.error(error);
      return [`Error checking note: ${error.message}`];
    }
  }

  async checkForLiquidatableNotes(blockTimestamp) {
    // Check for liquidatable notes every ~1 minute
    if (blockTimestamp - this.lastNotesFetch > 60 * 1000) {
      this.lastNotesFetch = blockTimestamp;
      return await this.fetchLiquidatableNotes();
    }
    return [];
  }

  async fetchLiquidatableNotes() {
    console.log('Checking for liquidatable notes...');
    const messages = [];

    try {
      const notes = await this.GraphNote.search();
      const liquidatableNotes = notes
        .filter(note => note.collatRatio < ethers.parseUnits('1.75', 18))
        .filter(note => note.dyad >= ethers.parseUnits('100', 18))
        .sort((a, b) => Number(a.collatRatio) - Number(b.collatRatio));

      if (liquidatableNotes.length > 0) {
        console.log(`\n=== Found ${liquidatableNotes.length} potentially liquidatable notes ===`);

        // Process each liquidatable note
        for (const note of liquidatableNotes) {
          try {
            // Get vault values from the contract
            const [exoValue, keroValue] = await this.vaultManager.getVaultsValues(note.id);

            // Get collateral ratio directly from vault manager contract
            const actualCR = await this.vaultManager.collatRatio(note.id);

            // Format values for display
            const crFormatted = ethers.formatUnits(actualCR, 18);
            const dyadFormatted = ethers.formatUnits(note.dyad, 18);
            const exoValueFormatted = ethers.formatUnits(exoValue, 18);

            // Print only the required information
            console.log(`Note ID: ${note.id} | CR: ${crFormatted} | DYAD: ${dyadFormatted} | Exo Value: ${exoValueFormatted} USD`);

            // Check if note meets criteria for Discord notification:
            if (parseFloat(crFormatted) < 1.5 && exoValue > note.dyad) {
              const notificationMessage = [
                `🚨 Liquidation Opportunity 🚨`,
                `Note ID: ${note.id}`,
                `CR: ${crFormatted}`,
                `DYAD: ${dyadFormatted}`,
                `Exo Value: ${exoValueFormatted} USD`,
              ].join('\n');

              // Add message to the array instead of sending directly
              messages.push(notificationMessage);
            }
          } catch (error) {
            console.error(`Error getting values for note ${note.id}:`, error.message);
          }
        }

        console.log('===\n');
      } else {
        console.log('No liquidatable notes found.');
      }
    } catch (error) {
      console.error('Error fetching liquidatable notes:', error.message);
      messages.push(`Error fetching liquidatable notes: ${error.message}`);
    }
    
    return messages;
  }

  async fetchLiquidatableNotes() {
    console.log('Checking for liquidatable notes...');
    const messages = [];

    try {
      const notes = await GraphNote.search();
      const liquidatableNotes = notes
        .filter(note => note.collatRatio < ethers.parseUnits('1.75', 18))
        .filter(note => note.dyad >= ethers.parseUnits('100', 18))
        .sort((a, b) => Number(a.collatRatio) - Number(b.collatRatio));

      if (liquidatableNotes.length > 0) {
        console.log(`\n=== Found ${liquidatableNotes.length} potentially liquidatable notes ===`);

        // Process each liquidatable note
        for (const note of liquidatableNotes) {
          try {
            // Get vault values from the contract
            const [exoValue, keroValue] = await this.vaultManager.getVaultsValues(note.id);

            // Get collateral ratio directly from vault manager contract
            const actualCR = await this.vaultManager.collatRatio(note.id);

            // Format values for display
            const crFormatted = ethers.formatUnits(actualCR, 18);
            const dyadFormatted = ethers.formatUnits(note.dyad, 18);
            const exoValueFormatted = ethers.formatUnits(exoValue, 18);

            // Print only the required information
            console.log(`Note ID: ${note.id} | CR: ${crFormatted} | DYAD: ${dyadFormatted} | Exo Value: ${exoValueFormatted} USD`);

            // Check if note meets criteria for Discord notification:
            if (parseFloat(crFormatted) < 1.5 && exoValue > note.dyad) {
              const notificationMessage = [
                `🚨 Liquidation Opportunity 🚨`,
                `Note ID: ${note.id}`,
                `CR: ${crFormatted}`,
                `DYAD: ${dyadFormatted}`,
                `Exo Value: ${exoValueFormatted} USD`,
              ].join('\n');

              // Add message to the array instead of sending directly
              messages.push(notificationMessage);
            }
          } catch (error) {
            console.error(`Error getting values for note ${note.id}:`, error.message);
          }
        }

        console.log('===\n');
      } else {
        console.log('No liquidatable notes found.');
      }
    } catch (error) {
      console.error('Error fetching liquidatable notes:', error.message);
      messages.push(`Error fetching liquidatable notes: ${error.message}`);
    }
    
    return messages;
  }
}

export default BlockProcessor;
