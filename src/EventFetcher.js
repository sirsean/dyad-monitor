
import { ethers } from 'ethers';
import { formatNumber } from './utils.js';

class EventFetcher {
  constructor({ provider, vaultManager }) {
    this.provider = provider;
    this.vaultManager = vaultManager;
  }

  /**
   * Fetches Liquidate events from the VaultManager contract
   * @param {number} startBlock - The starting block to search from
   * @param {number} endBlock - The ending block to search to (defaults to 'latest')
   * @returns {Promise<Array>} - The liquidation events
   */
  async fetchLiquidateEvents(startBlock, endBlock = 'latest') {
    console.log(`Fetching Liquidate events from block ${startBlock} to ${endBlock}`);
    
    try {
      // Get the Liquidate event filter
      const filter = this.vaultManager.filters.Liquidate();
      
      // Query for events
      const events = await this.vaultManager.queryFilter(filter, startBlock, endBlock);
      
      // Process and format the events
      return await Promise.all(events.map(async (event) => {
        const { id, from, to, amount } = event.args;
        const block = await event.getBlock();
        
        return {
          id: id.toString(),
          from: from.toString(),
          to: to.toString(),
          amount: amount,
          amountFormatted: ethers.formatUnits(amount, 18),
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          timestamp: new Date(block.timestamp * 1000).toISOString()
        };
      }));
    } catch (error) {
      console.error('Error fetching liquidation events:', error.message);
      throw error;
    }
  }

  /**
   * Converts a date string to a block number
   * @param {string} dateString - The date string in YYYY-MM-DD format
   * @returns {Promise<number>} - The approximate block number
   */
  async dateToBlock(dateString) {
    try {
      const targetDate = new Date(dateString);
      if (isNaN(targetDate.getTime())) {
        throw new Error(`Invalid date format: ${dateString}. Use YYYY-MM-DD format.`);
      }
      
      const targetTimestamp = Math.floor(targetDate.getTime() / 1000);
      const currentBlock = await this.provider.getBlockNumber();
      const currentBlockData = await this.provider.getBlock(currentBlock);
      const currentTimestamp = currentBlockData.timestamp;
      
      // Ethereum average block time is ~13 seconds
      const AVERAGE_BLOCK_TIME = 13;
      
      // Calculate approximate blocks difference
      const timestampDiff = currentTimestamp - targetTimestamp;
      const blockDiff = Math.floor(timestampDiff / AVERAGE_BLOCK_TIME);
      
      // Calculate the target block
      const targetBlock = Math.max(1, currentBlock - blockDiff);
      
      return targetBlock;
    } catch (error) {
      console.error('Error converting date to block:', error.message);
      throw error;
    }
  }
}

export default EventFetcher;
