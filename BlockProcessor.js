
import { ethers } from 'ethers';
import { format, getTimezoneOffset } from 'date-fns-tz';
import { getHours, getMinutes, addMilliseconds } from 'date-fns';

class BlockProcessor {
  constructor({
    provider,
    vaultManager,
    dyad,
    noteMessages,
    notify,
    noteIds,
    timeZone = 'America/Chicago',
    targetHourCT = 5,
    targetMinuteCT = 0
  }) {
    this.provider = provider;
    this.vaultManager = vaultManager;
    this.dyad = dyad;
    this.noteMessages = noteMessages;
    this.notify = notify;
    this.noteIds = noteIds;
    this.timeZone = timeZone;
    
    // State tracking
    this.lastDailyCheckDate = null;
    this.initialCheckDone = false;
    this.lastNotesFetch = 0;
    
    // Configuration
    this.targetHourCT = targetHourCT;
    this.targetMinuteCT = targetMinuteCT;
  }

  async processBlock(blockNumber) {
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
        await this.runDailyNoteCheck(currentDate);
        // Set the last check date in the processBlock method for the initial check
        this.lastDailyCheckDate = new Date(currentDate.toDateString());
      }

      // Check if it's time for the daily note check
      await this.checkForDailyRun(currentDate, blockTimestamp);

      // Check for liquidatable notes if it's time
      await this.checkForLiquidatableNotes(blockTimestamp);
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error.message);
    }
  }

  async checkForDailyRun(currentDate, blockTimestamp) {
    // Get the CT time info
    const dateCT = this.convertToCentralTime(currentDate);
    const hoursCT = getHours(dateCT);
    const minutesCT = getMinutes(dateCT);

    // Check if it's time to run the daily check (after target time) and we haven't run it today
    const isAfterTargetTime = (hoursCT > this.targetHourCT || 
                              (hoursCT === this.targetHourCT && minutesCT >= this.targetMinuteCT));

    const today = new Date(currentDate.toDateString());
    const needsCheck = !this.lastDailyCheckDate || this.lastDailyCheckDate.getTime() < today.getTime();

    if (isAfterTargetTime && needsCheck) {
      await this.runDailyNoteCheck(currentDate);
      
      // Update the last check date here in the state management method
      this.lastDailyCheckDate = today;
    }
  }

  convertToCentralTime(date) {
    // The timezone offset returns the difference between UTC and the specified timezone in milliseconds
    // We need to ADD this offset to convert UTC to local time
    const offsetMillis = getTimezoneOffset(this.timeZone, date);
    return addMilliseconds(date, offsetMillis);
  }

  async runDailyNoteCheck(currentDate) {
    console.log('Running daily note check...');
    try {
      // Get the first note ID from the environment variable
      const firstNoteId = this.noteIds.split(',')[0];
      console.log(`Checking note ID: ${firstNoteId}`);

      // Call noteMessages for the first note
      const message = await this.noteMessages(firstNoteId);

      // Send the result to Discord
      await this.notify(message);

      console.log('Daily note check completed.');
    } catch (error) {
      console.error('Error checking note:', error.message);
      console.error(error);
      await this.notify(`Error checking note: ${error.message}`);
    }
  }

  async checkForLiquidatableNotes(blockTimestamp) {
    // Check for liquidatable notes every ~1 minute
    if (blockTimestamp - this.lastNotesFetch > 60 * 1000) {
      this.lastNotesFetch = blockTimestamp;
      await this.fetchLiquidatableNotes();
    }
  }

  async fetchLiquidatableNotes() {
    console.log('Checking for liquidatable notes...');

    try {
      const notes = await this.GraphNote.search();
      const liquidatableNotes = notes
        .filter(note => note.collatRatio < ethers.parseUnits('1.5', 18))
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
            console.log(`Note ID: ${note.id}`);
            console.log(`CR: ${crFormatted}`);
            console.log(`DYAD: ${dyadFormatted}`);
            console.log(`Exo Value: ${exoValueFormatted} USD`);
            console.log('---');

            // Check if note meets criteria for Discord notification:
            if (parseFloat(crFormatted) < 1.62 && exoValue > note.dyad) {
              const notificationMessage = [
                `🚨 Liquidation Opportunity 🚨`,
                `Note ID: ${note.id}`,
                `CR: ${crFormatted}`,
                `DYAD: ${dyadFormatted}`,
                `Exo Value: ${exoValueFormatted} USD`,
              ].join('\n');

              // Send notification to Discord
              await this.notify(notificationMessage);
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
    }
  }

  get GraphNote() {
    return {
      search: async () => {
        const query = `{
          notes(limit: 1000) {
            items {
              id
              collatRatio
              kerosene
              dyad
              xp
              collateral
              __typename
            }
            __typename
          }
        }`;

        const response = await fetch('https://api.dyadstable.xyz/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query })
        });

        const data = await response.json();
        return data.data.notes.items.map(item => new GraphNote(item));
      }
    };
  }
}

class GraphNote {
  constructor(data) {
    this.id = data.id;
    this.collatRatio = BigInt(data.collatRatio);
    this.kerosene = BigInt(data.kerosene);
    this.dyad = BigInt(data.dyad);
    this.xp = BigInt(data.xp);
    this.collateral = BigInt(data.collateral);
  }

  toString() {
    return [
      `Note ID: ${this.id}`,
      `Collateral Ratio: ${ethers.formatUnits(this.collatRatio, 18)}`,
      `DYAD: ${ethers.formatUnits(this.dyad, 18)}`,
      `Collateral: ${ethers.formatUnits(this.collateral, 18)}`,
      '---'
    ].join('\n');
  }
}

export default BlockProcessor;
