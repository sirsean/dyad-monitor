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

      // Define the maximum range per query (RPC limit)
      const MAX_BLOCK_RANGE = 500;
      let allEvents = [];

      // If endBlock is 'latest', get the current block number
      if (endBlock === 'latest') {
        endBlock = await this.provider.getBlockNumber();
      }

      console.log(`Querying events from ${startBlock} to ${endBlock} in chunks of ${MAX_BLOCK_RANGE} blocks...`);

      // Query for events in chunks to avoid exceeding the RPC limit
      for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += MAX_BLOCK_RANGE) {
        const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, endBlock);

        const events = await this.vaultManager.queryFilter(filter, fromBlock, toBlock);
        if (events.length > 0) {
          console.log(`Found ${events.length} events in blocks ${fromBlock}-${toBlock}`);
        }

        // Add to our collection
        allEvents = allEvents.concat(events);
      }

      console.log(`Search complete. Total events found: ${allEvents.length}`);

      // Process and format the events
      return await Promise.all(allEvents.map(async (event) => {
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
   * Fetches Liquidate events for a specific noteId from the VaultManager contract
   * @param {string} noteId - The noteId to search for
   * @param {number} startBlock - The starting block to search from
   * @param {number} endBlock - The ending block to search to (defaults to 'latest')
   * @returns {Promise<Array>} - The liquidation events for the specified noteId
   */
  async fetchLiquidateEventsByNoteId(noteId, startBlock, endBlock = 'latest') {
    console.log(`Fetching Liquidate events for noteId ${noteId} from block ${startBlock} to ${endBlock}`);

    try {
      // Create a filter for the Liquidate event with the specific noteId
      const filter = this.vaultManager.filters.Liquidate(noteId);

      // Define the maximum range per query (RPC limit)
      const MAX_BLOCK_RANGE = 500;
      let allEvents = [];

      // If endBlock is 'latest', get the current block number
      if (endBlock === 'latest') {
        endBlock = await this.provider.getBlockNumber();
      }

      console.log(`Querying events from ${startBlock} to ${endBlock} in chunks of ${MAX_BLOCK_RANGE} blocks...`);

      // Query for events in chunks to avoid exceeding the RPC limit
      for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += MAX_BLOCK_RANGE) {
        const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, endBlock);

        const events = await this.vaultManager.queryFilter(filter, fromBlock, toBlock);
        if (events.length > 0) {
          console.log(`Found ${events.length} events in blocks ${fromBlock}-${toBlock}`);
        }

        // Add to our collection
        allEvents = allEvents.concat(events);
      }

      console.log(`Search complete. Total events found: ${allEvents.length}`);

      // Process and format the events
      return await Promise.all(allEvents.map(async (event) => {
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
      console.error(`Error fetching liquidation events for noteId ${noteId}:`, error.message);
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