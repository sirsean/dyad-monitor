
import NoteMessageGenerator from './NoteMessageGenerator.js';

/**
 * Composite message generator that combines multiple generators
 */
class CompositeMessageGenerator extends NoteMessageGenerator {
  /**
   * @param {Object} options
   * @param {NoteMessageGenerator[]} options.generators - Array of message generators
   */
  constructor({ generators }) {
    super();
    this.generators = generators;
  }

  /**
   * Generate messages by combining all generators
   * @param {string} noteId - The note ID
   * @returns {Promise<string[]>} Array of message lines
   */
  async generate(noteId) {
    let allMessages = [];
    
    for (const generator of this.generators) {
      const messages = await generator.generate(noteId);
      if (messages && messages.length > 0) {
        allMessages = allMessages.concat(messages);
      }
    }
    
    return allMessages;
  }
}

export default CompositeMessageGenerator;
