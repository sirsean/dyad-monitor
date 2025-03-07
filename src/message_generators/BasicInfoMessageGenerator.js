
import NoteMessageGenerator from './NoteMessageGenerator.js';
import { fetchYield, formatNumber } from '../utils.js';

/**
 * Generates basic note information messages
 */
class BasicInfoMessageGenerator extends NoteMessageGenerator {
  /**
   * @param {Object} options
   */
  constructor() {
    super();
  }

  /**
   * Generate basic info messages for a note
   * @param {string} noteId - The note ID
   * @returns {Promise<string[]>} Array of message lines
   */
  async generate(noteId) {
    const messages = [];
    
    // Add note ID info
    messages.push(`Note: ${noteId}`);
    
    // Add XP info from yield data
    const y = await fetchYield(noteId);
    const noteXp = y[Object.keys(y)[0]]?.noteXp;
    if (noteXp) {
      messages.push(`XP: ${formatNumber(noteXp, 2)}`);
    }
    
    return messages;
  }
}

export default BasicInfoMessageGenerator;
