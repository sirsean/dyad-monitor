
import { ethers } from 'ethers';
import NoteMessageGenerator from './NoteMessageGenerator.js';
import { formatNumber, openContract } from '../utils.js';
import { LP_TOKENS } from '../constants.js';

/**
 * Generates messages about the liquidity pool balances
 */
class LpBalanceMessageGenerator extends NoteMessageGenerator {
  /**
   * Constructor for LpBalanceMessageGenerator
   * @param {Object} options
   * @param {Object} options.provider - The ethers provider
   */
  constructor({ provider }) {
    super();
    this.provider = provider;
  }

  /**
   * Generate messages showing LP balances
   * @param {string} noteId - The note ID
   * @returns {Promise<string[]>} Array of message lines
   */
  async generate(noteId) {
    const messages = [];
    
    try {
      messages.push('--- LP Balances ---');
      
      for (const [lpAddress, lpName] of Object.entries(LP_TOKENS)) {
        // Open the CurveStableSwapNG contract
        const lpContract = await openContract(lpAddress, 'abi/CurveStableSwapNG.json', this.provider);
        
        // Get balances from the pool
        const balances = await lpContract.get_balances();
        
        // Log the balances in a more readable format
        console.log(`LP ${lpName} balances:`, 
          balances.map((bal, i) => `[${i}]: ${bal.toString()}`));
        
        if (balances.length >= 2) {
          // Get the address of each coin in the pool
          const coin0Address = await lpContract.coins(0);
          const coin1Address = await lpContract.coins(1);
          
          // Get token contracts
          const token0 = await openContract(coin0Address, 'abi/ERC20.json', this.provider);
          const token1 = await openContract(coin1Address, 'abi/ERC20.json', this.provider);
          
          // Get token symbols
          const symbol0 = await token0.symbol();
          const symbol1 = await token1.symbol();
          
          // Format balance values
          const balance0Formatted = formatNumber(ethers.formatUnits(balances[0], 18), 2);
          const balance1Formatted = formatNumber(ethers.formatUnits(balances[1], 18), 2);
          
          // Determine which token has more balance
          const balance0Value = parseFloat(ethers.formatUnits(balances[0], 18));
          const balance1Value = parseFloat(ethers.formatUnits(balances[1], 18));
          const ratio = balance0Value / balance1Value;
          
          let comparisonMessage;
          if (ratio > 1.1) {
            comparisonMessage = `Pool has ${formatNumber(ratio, 2)}x more ${symbol0} than ${symbol1}`;
          } else if (ratio < 0.9) {
            comparisonMessage = `Pool has ${formatNumber(1/ratio, 2)}x more ${symbol1} than ${symbol0}`;
          } else {
            comparisonMessage = `Pool has roughly equal amounts of both assets`;
          }
          
          // Add messages for this LP
          messages.push(`LP: ${lpName}`);
          messages.push(`${symbol0}: ${balance0Formatted}`);
          messages.push(`${symbol1}: ${balance1Formatted}`);
          messages.push(comparisonMessage);
          messages.push('---');
        }
      }
      
      if (messages.length <= 1) {
        messages.push('No LP balances found');
      }
    } catch (error) {
      console.error('Error generating LP balance messages:', error);
      messages.push(`Error fetching LP balances: ${error.message}`);
    }
    
    return messages;
  }
}

export default LpBalanceMessageGenerator;
