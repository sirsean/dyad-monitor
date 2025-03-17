
import { ethers } from 'ethers';
import GraphNote from './GraphNote.js';

class LiquidationMonitor {
  constructor({
    provider,
    vaultManager,
    dyad
  }) {
    this.provider = provider;
    this.vaultManager = vaultManager;
    this.dyad = dyad;
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

            // Get collateral ratio and debt directly from vault manager contract
            const actualCR = await this.vaultManager.collatRatio(note.id);
            const noteDebt = await this.vaultManager.getNoteDebt(note.id);

            // Format values for display
            const crFormatted = ethers.formatUnits(actualCR, 18);
            const dyadFormatted = ethers.formatUnits(noteDebt, 18);
            const exoValueFormatted = ethers.formatUnits(exoValue, 18);

            // Print only the required information
            console.log(`Note ID: ${note.id} | CR: ${crFormatted} | DYAD: ${dyadFormatted} | Exo Value: ${exoValueFormatted} USD`);

            // Check if note meets criteria for Discord notification:
            if (parseFloat(crFormatted) < 1.5 && exoValue > 0) {
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

export default LiquidationMonitor;
