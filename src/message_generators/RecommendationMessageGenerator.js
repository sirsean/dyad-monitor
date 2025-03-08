
import NoteMessageGenerator from './NoteMessageGenerator.js';
import { formatNumber } from '../utils.js';
import RiskMessageGenerator from './RiskMessageGenerator.js';
import { getContracts } from '../contracts.js';

/**
 * Generates recommendation messages for a note
 */
class RecommendationMessageGenerator extends NoteMessageGenerator {
  /**
   * Constructor for RecommendationMessageGenerator
   */
  constructor() {
    super();
  }

  /**
   * Generate recommendation messages for a note
   * @param {string} noteId - The note ID
   * @returns {Promise<string[]>} Array of message lines
   */
  async generate(noteId) {
    const messages = [];
    
    const { vaultManager, dyad } = getContracts();
    const { shouldMint, dyadToMint, shouldBurn, dyadToBurn } = 
      await RiskMessageGenerator.lookupRisk(noteId, vaultManager, dyad);
    
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
