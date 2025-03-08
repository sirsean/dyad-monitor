
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
    
    const { shouldMint, dyadToMint, shouldBurn, dyadToBurn } = 
      await RiskMessageGenerator.lookupRisk(noteId);
    
    if (shouldBurn) {
      messages.push('--- Recommendation ---');
      messages.push(`Burn ${formatNumber(dyadToBurn, 0)} DYAD`);
    } else if (shouldMint) {
      messages.push('--- Recommendation ---');
      messages.push(`Mint ${formatNumber(dyadToMint, 0)} DYAD`);
    }
    
    return messages;
  }
}

export default RecommendationMessageGenerator;
