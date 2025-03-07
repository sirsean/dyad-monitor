
import NoteMessageGenerator from './NoteMessageGenerator.js';
import { formatNumber } from '../utils.js';
import RiskMessageGenerator from './RiskMessageGenerator.js';

/**
 * Generates recommendation messages for a note
 */
class RecommendationMessageGenerator extends NoteMessageGenerator {
  /**
   * @param {Object} options
   * @param {Object} options.vaultManager - The vault manager contract
   * @param {Object} options.dyad - The DYAD contract
   */
  constructor({ vaultManager, dyad }) {
    super();
    this.vaultManager = vaultManager;
    this.dyad = dyad;
  }

  /**
   * Generate recommendation messages for a note
   * @param {string} noteId - The note ID
   * @returns {Promise<string[]>} Array of message lines
   */
  async generate(noteId) {
    const messages = [];
    
    const { shouldMint, dyadToMint, shouldBurn, dyadToBurn } = 
      await RiskMessageGenerator.lookupRisk(noteId, this.vaultManager, this.dyad);
    
    if (shouldBurn) {
      messages.push('---');
      messages.push(`Recommendation: Burn ${formatNumber(dyadToBurn, 0)} DYAD`);
    } else if (shouldMint) {
      messages.push('---');
      messages.push(`Recommendation: Mint ${formatNumber(dyadToMint, 0)} DYAD`);
    }
    
    return messages;
  }
}

export default RecommendationMessageGenerator;
