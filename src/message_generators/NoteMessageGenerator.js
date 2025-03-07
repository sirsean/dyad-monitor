
/**
 * Base class for note message generators
 */
class NoteMessageGenerator {
  /**
   * Generate messages for a note
   * @param {string} noteId - The note ID
   * @returns {Promise<string[]>} Array of message lines
   */
  async generate(noteId) {
    throw new Error('Not implemented');
  }
}

export default NoteMessageGenerator;
