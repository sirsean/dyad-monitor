
import { ethers } from 'ethers';
import NoteMessageGenerator from './NoteMessageGenerator.js';
import { formatNumber } from '../utils.js';
import { TARGET_CR, LOWER_CR, UPPER_CR } from '../constants.js';
import { getContracts } from '../contracts.js';

/**
 * Generates risk-related messages for a note
 */
class RiskMessageGenerator extends NoteMessageGenerator {
  /**
   * Constructor for RiskMessageGenerator
   */
  constructor() {
    super();
  }

  /**
   * Generate risk messages for a note
   * @param {string} noteId - The note ID
   * @returns {Promise<string[]>} Array of message lines
   */
  async generate(noteId) {
    const messages = [];
    
    const { cr } = await RiskMessageGenerator.lookupRisk(noteId);
    const crFloat = formatNumber(ethers.formatUnits(cr, 18), 3);
    messages.push(`CR: ${crFloat}`);
    
    return messages;
  }

  /**
   * Static method to lookup risk for a note
   * @param {string} noteId - The note ID
   * @returns {Promise<Object>} Risk information
   */
  static async lookupRisk(noteId) {
    const { vaultManager, dyad } = getContracts();
    
    const cr = await vaultManager.collatRatio(noteId);
    const crFloat = formatNumber(ethers.formatUnits(cr, 18), 3);

    const totalValue = await vaultManager.getTotalValue(noteId);
    const noteDebt = await vaultManager.getNoteDebt(noteId);
    const targetDebt = parseFloat(ethers.formatUnits(totalValue, 18)) / TARGET_CR;

    const dyadToBurn = parseFloat(ethers.formatUnits(noteDebt, 18)) - targetDebt;
    const dyadToMint = targetDebt - parseFloat(ethers.formatUnits(noteDebt, 18));

    return {
      cr,
      shouldMint: crFloat > UPPER_CR,
      dyadToMint,
      shouldBurn: crFloat < LOWER_CR,
      dyadToBurn,
    };
  }
}

export default RiskMessageGenerator;
