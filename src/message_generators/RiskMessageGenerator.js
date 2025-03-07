
import { ethers } from 'ethers';
import NoteMessageGenerator from './NoteMessageGenerator.js';
import { formatNumber } from '../utils.js';

/**
 * Generates risk-related messages for a note
 */
class RiskMessageGenerator extends NoteMessageGenerator {
  /**
   * @param {Object} options
   * @param {Object} options.vaultManager - The vault manager contract
   * @param {Object} options.dyad - The DYAD contract
   */
  constructor({ vaultManager, dyad }) {
    super();
    this.vaultManager = vaultManager;
    this.dyad = dyad;
    this.TARGET_CR = 2.75;
    this.LOWER_CR = 2.5;
    this.UPPER_CR = 3.0;
  }

  /**
   * Generate risk messages for a note
   * @param {string} noteId - The note ID
   * @returns {Promise<string[]>} Array of message lines
   */
  async generate(noteId) {
    const messages = [];
    
    const { cr } = await RiskMessageGenerator.lookupRisk(noteId, this.vaultManager, this.dyad);
    const crFloat = formatNumber(ethers.formatUnits(cr, 18), 3);
    messages.push(`CR: ${crFloat}`);
    
    return messages;
  }

  /**
   * Static method to lookup risk for a note
   * @param {string} noteId - The note ID
   * @param {Object} vaultManager - The vault manager contract
   * @param {Object} dyad - The DYAD contract
   * @returns {Promise<Object>} Risk information
   */
  static async lookupRisk(noteId, vaultManager, dyad) {
    const TARGET_CR = 2.75;
    const LOWER_CR = 2.5;
    const UPPER_CR = 3.0;
    
    const cr = await vaultManager.collatRatio(noteId);
    const crFloat = formatNumber(ethers.formatUnits(cr, 18), 3);

    const totalValue = await vaultManager.getTotalValue(noteId);
    const mintedDyad = await dyad.mintedDyad(noteId);
    const targetDebt = parseFloat(ethers.formatUnits(totalValue, 18)) / TARGET_CR;

    const dyadToBurn = parseFloat(ethers.formatUnits(mintedDyad, 18)) - targetDebt;
    const dyadToMint = targetDebt - parseFloat(ethers.formatUnits(mintedDyad, 18));

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
